/**
 * contractClient.js
 * Calls FundChain and FCToken contracts on Stellar Testnet.
 *
 * Contract expects WHOLE XLM integers (not stroops).
 * The contract multiplies by 10_000_000 internally.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { walletManager } from './walletConnector.js';
import fundchainConfig  from '../contracts/FundChain.json';
import fctokenConfig    from '../contracts/FCToken.json';

const { contractId: FUNDCHAIN_ID, rpcUrl, passphrase } = fundchainConfig;
const { contractId: FCTOKEN_ID }                        = fctokenConfig;

if (!FUNDCHAIN_ID || FUNDCHAIN_ID.startsWith('REPLACE')) {
  console.warn('[FundChain] Set contractId in FundChain.json after deploying');
}
if (!FCTOKEN_ID || FCTOKEN_ID.startsWith('REPLACE')) {
  console.warn('[FCToken] Set contractId in FCToken.json after deploying');
}

const server    = new StellarSdk.rpc.Server(rpcUrl);
const fcContract = new StellarSdk.Contract(FUNDCHAIN_ID);
const tkContract = new StellarSdk.Contract(FCTOKEN_ID);

// ── ScVal helpers ─────────────────────────────────────────────────────────────

function toI128(xlm) {
  const n = parseInt(xlm, 10);
  if (isNaN(n) || n <= 0) throw new Error(`Invalid XLM amount: "${xlm}"`);
  return StellarSdk.nativeToScVal(BigInt(n), { type: 'i128' });
}

function toU64(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid campaign ID: "${n}"`);
  return StellarSdk.nativeToScVal(BigInt(num), { type: 'u64' });
}

function toU32(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid u32: "${n}"`);
  return StellarSdk.nativeToScVal(num, { type: 'u32' });
}

function toAddr(address) { return StellarSdk.Address.fromString(address).toScVal(); }
function toStr(s)         { return StellarSdk.nativeToScVal(String(s), { type: 'string' }); }

// ── Build → simulate → sign → submit → poll ──────────────────────────────────

async function buildAndSubmit(operation) {
  if (!walletManager.isConnected()) throw new Error('Connect Freighter first.');

  const address = walletManager.getAddress();
  let account;
  try { account = await server.getAccount(address); }
  catch { throw new Error(`Account not found. Fund via: https://friendbot.stellar.org?addr=${address}`); }

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: passphrase,
  }).addOperation(operation).setTimeout(30).build();

  let sim;
  try { sim = await server.simulateTransaction(tx); }
  catch (err) { throw new Error(`Network error: ${err.message}`); }

  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    const raw = sim.error || '';
    if (raw.includes('Goal not reached'))    throw new Error('Goal not reached yet.');
    if (raw.includes('Already withdrawn'))   throw new Error('Already withdrawn.');
    if (raw.includes('Campaign has ended'))  throw new Error('Campaign has ended.');
    if (raw.includes('Goal was reached'))    throw new Error('Goal met — no refund.');
    if (raw.includes('does not exist'))      throw new Error('Campaign not found on chain.');
    if (raw.includes('Not initialised'))     throw new Error('Contract not initialised. Run initialize first.');
    if (raw.includes('Minter not set'))      throw new Error('Run set_minter on FCToken first.');
    throw new Error(`Contract error: ${raw}`);
  }

  const prepared  = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  const signedXDR = await walletManager.activeWallet.signTransaction(prepared.toXDR());
  if (!signedXDR) throw new Error('Freighter did not return signed transaction.');

  const submit = await server.sendTransaction(
    StellarSdk.TransactionBuilder.fromXDR(signedXDR, passphrase)
  );
  if (submit.status === 'ERROR') throw new Error(`Submit failed: ${submit.errorResult}`);

  let response, attempts = 0;
  do {
    if (attempts++ > 30) throw new Error('Transaction timed out.');
    await new Promise(r => setTimeout(r, 1000));
    response = await server.getTransaction(submit.hash);
  } while (response.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND);

  if (response.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error(`Transaction failed: ${response.status}`);

  return response;
}

async function simulateRead(operation) {
  if (!walletManager.isConnected()) throw new Error('Connect wallet to read data.');
  const account = await server.getAccount(walletManager.getAddress());
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: passphrase,
  }).addOperation(operation).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(`Read error: ${sim.error}`);
  return StellarSdk.scValToNative(sim.result.retval);
}

// ── FundChain contract calls ──────────────────────────────────────────────────

export async function createCampaign({ title, description, goalXlm, durationDays }) {
  const goalInt = parseInt(goalXlm, 10);
  const daysInt = parseInt(durationDays, 10);
  if (!title?.trim() || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
  if (!description?.trim()) throw new Error('Description is required');
  if (isNaN(goalInt) || goalInt <= 0) throw new Error('Goal must be a positive whole number');
  if (isNaN(daysInt) || daysInt < 1 || daysInt > 90) throw new Error('Duration must be 1–90 days');

  return buildAndSubmit(fcContract.call(
    'create_campaign',
    toAddr(walletManager.getAddress()),
    toStr(title.trim()),
    toStr(description.trim()),
    StellarSdk.nativeToScVal(BigInt(goalInt), { type: 'i128' }),
    StellarSdk.nativeToScVal(daysInt, { type: 'u32' }),
  ));
}

export async function contribute({ campaignId, amountXlm }) {
  const amount = parseInt(amountXlm, 10);
  if (campaignId === undefined || campaignId === null) throw new Error('Campaign ID required');
  if (isNaN(amount) || amount <= 0) throw new Error('Amount must be a positive whole number');

  return buildAndSubmit(fcContract.call(
    'contribute',
    toU64(campaignId),
    toAddr(walletManager.getAddress()),
    StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' }),
  ));
}

export async function withdraw({ campaignId }) {
  return buildAndSubmit(fcContract.call('withdraw', toU64(campaignId)));
}

export async function refund({ campaignId }) {
  return buildAndSubmit(fcContract.call(
    'refund', toU64(campaignId), toAddr(walletManager.getAddress()),
  ));
}

export async function getCampaign(campaignId) {
  const raw = await simulateRead(fcContract.call('get_campaign', toU64(campaignId)));
  return normalizeCampaign(raw, campaignId);
}

export async function getAllCampaigns() {
  const count = await getCampaignCount();
  const list  = [];
  for (let i = 0; i < count; i++) {
    try { list.push(await getCampaign(i)); } catch { /* skip */ }
  }
  return list;
}

export async function getCampaignCount() {
  const raw = await simulateRead(fcContract.call('get_campaign_count'));
  return Number(raw);
}

// ── FCToken contract calls ────────────────────────────────────────────────────

export async function getFCTBalance(address) {
  try {
    const raw = await simulateRead(tkContract.call('balance', toAddr(address)));
    return Number(raw);
  } catch { return 0; }
}

export async function getFCTTotalSupply() {
  try {
    const raw = await simulateRead(tkContract.call('total_supply'));
    return Number(raw);
  } catch { return 0; }
}

// ── Normalize on-chain data → UI shape ───────────────────────────────────────

function normalizeCampaign(raw, id) {
  return {
    id:           Number(raw.id ?? id),
    title:        raw.title?.toString()       ?? '',
    description:  raw.description?.toString() ?? '',
    desc:         raw.description?.toString() ?? '',
    owner:        raw.owner?.toString()       ?? '',
    goal:         Number(raw.goal),
    raised:       Number(raw.raised),
    deadline:     Number(raw.deadline),
    withdrawn:    Boolean(raw.withdrawn),
    tokenMinted:  Number(raw.token_minted ?? 0),
    network:      'stellar-testnet',
    emoji:        '⭐',
    category:     'defi',
    backers:      0,
    daysLeft:     30,
    contributions: [],
  };
}