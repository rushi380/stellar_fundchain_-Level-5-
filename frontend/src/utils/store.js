/**
 * store.js — Reactive state management
 */
import { cache }                          from './cache.js';
import { getAllCampaigns as fetchChain,
         createCampaign  as contractCreate,
         contribute      as contractContribute,
         getFCTBalance, getFCTTotalSupply } from './contractClient.js';

function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    getState()  { return state; },
    setState(u) {
      const next = typeof u === 'function' ? u(state) : u;
      state = { ...state, ...next };
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const store = createStore({
  walletId: null, walletAddress: null, walletBalance: null, walletNetwork: null,
  fctBalance: 0, fctTotalSupply: 0,
  campaigns: [], campaignsLoading: true,
  transactions: [],
  activeTab: 'explore', activeCategory: 'all', searchQuery: '',
  isProcessing: false, processingText: '', toasts: [],
});

export async function loadCampaigns() {
  store.setState({ campaignsLoading: true });
  const cached = cache.get('campaigns');
  if (cached?.length) store.setState({ campaigns: cached, campaignsLoading: false });
  try {
    const campaigns = await fetchChain();
    store.setState({ campaigns, campaignsLoading: false });
    cache.set('campaigns', campaigns);
  } catch (err) {
    console.warn('[store] Chain fetch failed:', err.message);
    if (!cached?.length) store.setState({ campaigns: SEED, campaignsLoading: false });
    else store.setState({ campaignsLoading: false });
  }
}

export async function loadFCTStats(address) {
  if (!address) return;
  try {
    const [bal, supply] = await Promise.all([getFCTBalance(address), getFCTTotalSupply()]);
    store.setState({ fctBalance: bal, fctTotalSupply: supply });
  } catch {}
}

export async function createCampaign(data, ownerAddress, networkId) {
  const { title, desc, goal, days, category = 'tech', emoji = '🚀' } = data;
  const goalInt = parseInt(goal, 10);
  const daysInt = parseInt(days, 10);
  if (!title?.trim() || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
  if (!desc?.trim())                              throw new Error('Description is required');
  if (isNaN(goalInt) || goalInt <= 0)             throw new Error('Goal must be a positive whole number');
  if (isNaN(daysInt) || daysInt < 1 || daysInt > 90) throw new Error('Duration must be 1–90 days');
  if (!ownerAddress)                              throw new Error('Wallet not connected');

  await contractCreate({
    title: title.trim(), description: desc.trim(),
    goalXlm: goalInt, durationDays: daysInt,
  });

  const campaign = {
    id: `local_${Date.now()}`, title: title.trim(), desc: desc.trim(),
    goal: goalInt, emoji, category, network: networkId || 'stellar-testnet',
    raised: 0, backers: 0, contributions: [], tokenMinted: 0,
    owner: ownerAddress, daysLeft: daysInt, withdrawn: false,
  };
  store.setState(s => ({ campaigns: [campaign, ...s.campaigns] }));
  addTransaction({ dir: 'out', label: `Created: ${campaign.title}`, amount: 0 });
  setTimeout(() => loadCampaigns(), 3000);
  return campaign;
}

export async function contribute(campaignId, amount, walletAddress) {
  if (!walletAddress) throw new Error('Wallet not connected');
  const amountInt = parseInt(amount, 10);
  if (isNaN(amountInt) || amountInt <= 0) throw new Error('Amount must be a positive whole number');

  await contractContribute({ campaignId: Number(campaignId), amountXlm: amountInt });

  store.setState(s => {
    const campaigns = s.campaigns.map(c => {
      if (String(c.id) !== String(campaignId)) return c;
      return {
        ...c,
        raised:       c.raised + amountInt,
        backers:      c.backers + 1,
        tokenMinted:  (c.tokenMinted || 0) + amountInt,
        contributions: [{ addr: walletAddress, amount: amountInt, ts: Date.now() }, ...c.contributions],
      };
    });
    cache.set('campaigns', campaigns);
    return { campaigns };
  });

  const camp = store.getState().campaigns.find(c => String(c.id) === String(campaignId));
  addTransaction({ dir: 'out', label: `Backed: ${camp?.title ?? campaignId}`, amount: amountInt });
  addTransaction({ dir: 'in',  label: `Earned: ${amountInt} FCT reward tokens`, amount: amountInt, isFCT: true });

  // Refresh FCT balance
  loadFCTStats(walletAddress);
  setTimeout(() => loadCampaigns(), 3000);
}

export function addTransaction({ dir, label, amount, isFCT = false }) {
  const tx = { id: Date.now() + Math.random(), dir, label, amount, isFCT, ts: Date.now() };
  store.setState(s => {
    const transactions = [tx, ...s.transactions];
    cache.set('transactions', transactions);
    return { transactions };
  });
}

export function showToast(msg, type = 'info', ms = 3500) {
  const id = Date.now() + Math.random();
  store.setState(s => ({ toasts: [...s.toasts, { id, message: msg, type }] }));
  setTimeout(() => store.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms);
}

export function setProcessing(active, text = '') {
  store.setState({ isProcessing: active, processingText: text });
}

export function getFilteredCampaigns() {
  const { campaigns, activeCategory, searchQuery } = store.getState();
  return campaigns.filter(c => {
    const matchCat = activeCategory === 'all' || c.category === activeCategory;
    const q = searchQuery.toLowerCase();
    return matchCat && (!q || c.title?.toLowerCase().includes(q) || c.desc?.toLowerCase().includes(q));
  });
}

const SEED = [
  { id:'s1', title:'ZeroGas Protocol', emoji:'⚡', desc:'Fee-less micro-transactions on Stellar.', category:'defi', goal:5000, raised:3800, backers:142, tokenMinted:3800, owner:'GABC...', network:'stellar-testnet', daysLeft:8,  contributions:[], withdrawn:false },
  { id:'s2', title:'Stellar Art DAO',  emoji:'🎨', desc:'On-chain gallery curated by XLM holders.',  category:'art',  goal:2000, raised:2000, backers:89,  tokenMinted:2000, owner:'GXYZ...', network:'stellar-testnet', daysLeft:0,  contributions:[], withdrawn:false },
  { id:'s3', title:'DeFi for India',   emoji:'🌍', desc:'Mobile DeFi education in local languages.', category:'social',goal:1500, raised:620,  backers:201, tokenMinted:620,  owner:'GIJK...', network:'stellar-testnet', daysLeft:19, contributions:[], withdrawn:false },
];