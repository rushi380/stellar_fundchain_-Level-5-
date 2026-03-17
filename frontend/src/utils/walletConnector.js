/**
 * walletConnector.js — Fixed for Freighter v2
 */

export const NETWORKS = {
  STELLAR_TESTNET: {
    id: 'stellar-testnet', name: 'Stellar Testnet', symbol: 'XLM', color: '#08b5e5',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl:     'https://soroban-testnet.stellar.org',
    testnet:    true,
  },
};

export class WalletError extends Error {
  constructor(message, code, walletId) {
    super(message);
    this.name = 'WalletError'; this.code = code; this.walletId = walletId;
  }
}

export const freighterConnector = {
  id: 'freighter', name: 'Freighter',
  network: NETWORKS.STELLAR_TESTNET,
  address: null, balance: null, _api: null,

  icon: `<svg viewBox="0 0 40 40" width="28" height="28">
    <circle cx="20" cy="20" r="18" fill="#08b5e5" opacity="0.15" stroke="#08b5e5" stroke-width="2"/>
    <circle cx="20" cy="20" r="8" fill="#08b5e5"/>
    <path fill="white" d="M17 17h6v2h-6zM17 21h6v2h-6z"/>
  </svg>`,

  isAvailable() { return true; },

  async connect() {
    let api;
    try { api = await import('@stellar/freighter-api'); }
    catch { api = window.freighter; }

    if (!api) throw new WalletError('Could not load Freighter API. Run: npm install @stellar/freighter-api', 'LOAD_ERROR', this.id);

    let extensionPresent = false;
    try {
      const result = await api.isConnected();
      extensionPresent = result?.isConnected ?? result ?? false;
    } catch { extensionPresent = false; }

    if (!extensionPresent) throw new WalletError(
      'Freighter not detected.\n1. Install from freighter.app\n2. Enable in chrome://extensions\n3. Refresh the page',
      'NOT_INSTALLED', this.id
    );

    let address = null;
    if (typeof api.requestAccess === 'function') {
      try {
        const result = await api.requestAccess();
        address = result?.address ?? null;
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('denied') || msg.includes('reject') || msg.includes('declined')) {
          throw new WalletError('Connection rejected. Click Allow in Freighter.', 'REJECTED', this.id);
        }
      }
    }

    if (!address) {
      try {
        if (typeof api.getAddress === 'function') {
          const r = await api.getAddress(); address = r?.address ?? r;
        } else if (typeof api.getPublicKey === 'function') {
          const r = await api.getPublicKey(); address = r?.publicKey ?? r;
        }
      } catch (err) {
        throw new WalletError(`Freighter did not return address: ${err.message}`, 'CONNECT_ERROR', this.id);
      }
    }

    if (!address || !address.startsWith('G')) {
      throw new WalletError('Invalid address from Freighter. Set up your wallet first.', 'NO_KEY', this.id);
    }

    try {
      let networkName = null;
      if (typeof api.getNetworkDetails === 'function') {
        const d = await api.getNetworkDetails(); networkName = d?.network ?? null;
      } else if (typeof api.getNetwork === 'function') {
        const r = await api.getNetwork(); networkName = r?.network ?? r ?? null;
      }
      if (networkName) {
        const isTestnet = networkName === 'TESTNET' || networkName.includes('Test SDF') || networkName.toLowerCase().includes('testnet');
        if (!isTestnet) throw new WalletError(
          `Wrong network: "${networkName}"\nOpen Freighter → click network → select Testnet`,
          'WRONG_NETWORK', this.id
        );
      }
    } catch (err) { if (err instanceof WalletError) throw err; }

    this.address = address;
    this._api    = api;

    try {
      const resp = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
      if (resp.ok) {
        const data   = await resp.json();
        const native = data.balances?.find(b => b.asset_type === 'native');
        this.balance = native ? parseFloat(native.balance).toFixed(2) : '0.00';
      } else { this.balance = '0.00'; }
    } catch { this.balance = '—'; }

    return { address: this.address, balance: this.balance, network: this.network };
  },

  async disconnect() { this.address = null; this.balance = null; this._api = null; },

  async signTransaction(xdr) {
    if (!this._api) throw new WalletError('Not connected', 'NOT_CONNECTED', this.id);
    try {
      const result = await this._api.signTransaction(xdr, {
        networkPassphrase: NETWORKS.STELLAR_TESTNET.passphrase,
        network: 'TESTNET',
      });
      return result?.signedTxXdr ?? result?.signedXDR ?? result;
    } catch (err) {
      if (err.message?.toLowerCase().includes('declined')) throw new WalletError('Transaction rejected.', 'REJECTED', this.id);
      throw new WalletError(`Signing failed: ${err.message}`, 'SIGN_ERROR', this.id);
    }
  },
};

export const WALLETS = [freighterConnector];

class WalletManager {
  constructor() { this.activeWallet = null; this._listeners = new Set(); }
  subscribe(fn)  { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  emit(ev, d)    { this._listeners.forEach(fn => fn(ev, d)); }

  async connect(walletId) {
    const w = WALLETS.find(w => w.id === walletId);
    if (!w) throw new Error(`Unknown wallet: ${walletId}`);
    const result = await w.connect();
    this.activeWallet = w;
    this.emit('connected', { wallet: w, ...result });
    try { localStorage.setItem('fc_last_wallet', walletId); } catch {}
    return result;
  }

  async disconnect() {
    if (!this.activeWallet) return;
    await this.activeWallet.disconnect();
    this.emit('disconnected', { walletId: this.activeWallet.id });
    this.activeWallet = null;
    try { localStorage.removeItem('fc_last_wallet'); } catch {}
  }

  getAddress()  { return this.activeWallet?.address ?? null; }
  getBalance()  { return this.activeWallet?.balance ?? null; }
  getNetwork()  { return this.activeWallet?.network ?? null; }
  isConnected() { return !!this.activeWallet?.address; }

  async tryAutoReconnect() {
    try {
      const lastId = localStorage.getItem('fc_last_wallet');
      if (lastId === 'freighter') { await this.connect('freighter'); return true; }
    } catch {}
    return false;
  }
}

export const walletManager = new WalletManager();