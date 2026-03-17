/** All UI components */

import { WALLETS, walletManager, WalletError } from '../utils/walletConnector.js';
import { store, showToast, setProcessing, loadFCTStats } from '../utils/store.js';

const CAT_BG    = { tech:'linear-gradient(135deg,#1e3a5f,#0d2240)', art:'linear-gradient(135deg,#4a1942,#2d0e3a)', social:'linear-gradient(135deg,#063b2e,#032118)', gaming:'linear-gradient(135deg,#3d1f00,#2a1500)', defi:'linear-gradient(135deg,#1a0a00,#2d1800)' };
const CAT_COLOR = { tech:'#3b82f6', art:'#ec4899', social:'#10b981', gaming:'#f59e0b', defi:'#f5c842' };

export function renderProcessingOverlay(s) {
  return `<div id="processing-overlay" class="processing-overlay ${s.isProcessing?'active':''}">
    <div class="processing-spinner"></div>
    <div class="processing-text">${s.processingText || 'PROCESSING...'}</div>
  </div>`;
}

export function renderToasts(toasts=[]) {
  return toasts.map(t => `<div class="toast toast-${t.type}">${t.message}</div>`).join('');
}

export function renderNav(s) {
  const { walletAddress, walletBalance, walletNetwork, fctBalance } = s;
  const connected = !!walletAddress;
  const short = walletAddress ? walletAddress.slice(0,6)+'...'+walletAddress.slice(-4) : '';
  return `<nav id="nav-root">
    <div class="nav-logo">
      <span class="logo-icon">⛓</span>
      <span class="logo-text">FundChain</span>
      <span class="logo-pro">PRO</span>
    </div>
    <div class="nav-right">
      ${connected ? `
        <span class="net-badge">● ${walletNetwork?.name||'Testnet'}</span>
        <span class="fct-badge">⬡ ${fctBalance} FCT</span>
        <span class="wallet-balance">${walletBalance} XLM</span>` : ''}
      <button id="wallet-btn" class="wallet-btn ${connected?'connected':''}">${connected?short:'🔗 Connect'}</button>
      <button id="create-campaign-btn" class="btn btn-primary btn-sm">+ Campaign</button>
    </div>
  </nav>`;
}

export function renderHero() {
  return `<section class="hero">
    <div class="hero-eyebrow">✦ Stellar Soroban · Two-Contract Architecture · FCT Rewards</div>
    <h1 class="hero-title">Fund Bold Ideas.<br><span class="gradient-text">Earn Rewards.</span></h1>
    <p class="hero-desc">Create campaigns backed by Soroban smart contracts. Every XLM you contribute earns FCT — the FundChain reward token.</p>
    <div class="hero-token-note">⬡ 1 XLM contributed = 1 FCT earned — automatic, on-chain</div>
    <div class="hero-actions">
      <button class="btn btn-primary" onclick="window.__fc.openCreateModal()">Launch Campaign</button>
      <button class="btn btn-outline" onclick="document.querySelector('.tabs')?.scrollIntoView({behavior:'smooth'})">Explore ↓</button>
    </div>
  </section>`;
}

export function renderStatsBar(s) {
  const { campaigns, fctTotalSupply } = s;
  const raised  = campaigns.reduce((a,c) => a+(c.raised||0), 0);
  const backers = campaigns.reduce((a,c) => a+(c.backers||0), 0);
  return `<div id="stats-bar" class="stats-bar">
    <div class="stat-item"><div class="stat-value">${campaigns.length}</div><div class="stat-label">Campaigns</div></div>
    <div class="stat-item"><div class="stat-value">${raised.toLocaleString()} XLM</div><div class="stat-label">Total Raised</div></div>
    <div class="stat-item"><div class="stat-value">${backers}</div><div class="stat-label">Backers</div></div>
    <div class="stat-item"><div class="stat-value">${fctTotalSupply.toLocaleString()} FCT</div><div class="stat-label">Tokens Minted</div></div>
  </div>`;
}

export function renderTabsBar(s) {
  const tabs = [['explore','🔭 Explore'],['my-campaigns','📁 My Campaigns'],['transactions','🧾 Transactions']];
  return `<div class="tabs">${tabs.map(([id,label]) =>
    `<button class="tab-btn ${s.activeTab===id?'active':''}" data-tab="${id}">${label}</button>`
  ).join('')}</div>`;
}

function buildCard(c) {
  const pct      = Math.min((c.raised/c.goal)*100, 100);
  const pctClass = pct < 33 ? 'low' : pct < 70 ? 'mid' : 'high';
  const ended    = c.daysLeft <= 0;
  const funded   = c.raised >= c.goal;
  const isDemo   = !c.id || isNaN(Number(c.id));
  const dlText   = ended ? '⏱ Ended' : c.daysLeft <= 5 ? `🔥 ${c.daysLeft}d left` : `📅 ${c.daysLeft}d left`;
  const dlClass  = 'deadline-badge' + (ended ? ' ended' : c.daysLeft <= 5 ? ' urgent' : '');

  return `<div class="campaign-card" data-campaign-id="${c.id}">
    <div class="card-cover" style="background:${CAT_BG[c.category]||CAT_BG.defi}">
      <span class="card-emoji">${c.emoji||'⭐'}</span>
      ${isDemo
        ? `<span class="card-net-badge" style="background:rgba(102,102,102,.5)">✦ Demo</span>`
        : `<span class="card-net-badge">✦ XLM</span>`}
    </div>
    <div class="card-body">
      <div class="card-category" style="color:${CAT_COLOR[c.category]}">${(c.category||'defi').toUpperCase()}</div>
      <div class="card-title">${c.title}</div>
      <div class="card-desc">${c.desc||c.description||''}</div>
      <div class="card-stats">
        <div><div class="card-stat-val">${(c.raised||0).toLocaleString()} XLM</div><div class="card-stat-lbl">of ${c.goal.toLocaleString()} XLM</div></div>
        <div style="text-align:right"><div class="card-stat-val">${c.backers}</div><div class="card-stat-lbl">backers</div></div>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill ${pctClass}" style="width:${pct}%"></div></div>
      <div class="card-token-row">⬡ ${(c.tokenMinted||c.raised||0).toLocaleString()} FCT minted to backers</div>
      <div class="card-footer">
        <span class="${dlClass}">${dlText}</span>
        ${isDemo
          ? `<span class="status-chip" style="background:rgba(102,102,102,.15);color:#666;border:1px solid rgba(102,102,102,.3)">👁 Demo</span>`
          : funded
            ? `<span class="status-chip status-success">🎯 Funded!</span>`
            : !ended
              ? `<button class="btn btn-primary btn-sm fund-btn" data-campaign-id="${c.id}">Fund It</button>`
              : `<button class="btn btn-outline btn-sm" disabled>Closed</button>`}
      </div>
    </div>
  </div>`;
}

export function renderCampaignGrid(campaigns) {
  if (!campaigns.length) return `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><div class="empty-title">No campaigns found</div><p>Try a different search or filter.</p></div>`;
  return campaigns.map(buildCard).join('');
}

export function renderSkeletons(n=6) {
  return Array(n).fill(0).map(() => `<div class="skeleton-card"><div class="skeleton skeleton-cover"></div><div class="skeleton-body"><div class="skeleton skeleton-line w-40"></div><div class="skeleton skeleton-line w-85"></div><div class="skeleton skeleton-line w-65"></div></div></div>`).join('');
}

export function renderDetailModal(c) {
  const pct    = Math.min((c.raised/c.goal)*100, 100);
  const pc     = pct<33?'low':pct<70?'mid':'high';
  const canFund = !isNaN(Number(c.id)) && c.daysLeft > 0 && c.raised < c.goal;
  return `<div class="modal" style="max-width:680px">
    <div class="modal-header">
      <div><div class="modal-title">${c.emoji||'⭐'} ${c.title}</div></div>
      <button class="modal-close">✕</button>
    </div>
    <div class="detail-cover" style="background:${CAT_BG[c.category]||CAT_BG.defi}">
      <span style="font-size:4rem">${c.emoji||'⭐'}</span>
    </div>
    <div class="detail-grid">
      <div>
        <p style="color:var(--muted);line-height:1.7;font-size:.88rem;margin-bottom:1.25rem">${c.desc||c.description||''}</p>
        <div class="detail-meta-row"><span class="detail-meta-label">Owner</span><code style="font-size:.72rem;word-break:break-all">${c.owner}</code></div>
        <div class="detail-meta-row"><span class="detail-meta-label">Network</span><span style="color:var(--cyan)">Stellar Testnet</span></div>
        <div class="detail-meta-row"><span class="detail-meta-label">FCT Minted</span><span style="color:var(--gold);font-family:'JetBrains Mono',monospace">⬡ ${(c.tokenMinted||0).toLocaleString()} FCT</span></div>
        <div style="margin-top:1rem;font-size:.65rem;font-family:'JetBrains Mono',monospace;color:var(--muted);margin-bottom:.5rem;letter-spacing:.08em">RECENT BACKERS</div>
        ${(c.contributions||[]).slice(0,5).map(b=>`<div class="backer-row"><code style="font-size:.7rem">${b.addr?.slice(0,8)}...${b.addr?.slice(-4)}</code><span style="color:var(--gold);font-family:'JetBrains Mono',monospace">${b.amount} XLM</span></div>`).join('')||'<div style="font-size:.78rem;color:var(--muted)">No contributions yet.</div>'}
      </div>
      <div>
        <div class="detail-raised">${(c.raised||0).toLocaleString()} <span style="font-size:.9rem;color:var(--muted)">XLM</span></div>
        <div style="color:var(--muted);font-size:.8rem;margin-bottom:.5rem">of ${c.goal.toLocaleString()} XLM goal</div>
        <div class="progress-bar-track" style="margin:.75rem 0"><div class="progress-bar-fill ${pc}" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted);margin-bottom:1.5rem">
          <span>${pct.toFixed(0)}% funded</span><span>${c.daysLeft>0?c.daysLeft+'d left':'Ended'}</span>
        </div>
        ${canFund
          ? `<button class="btn btn-primary fund-campaign-btn" style="width:100%;padding:.7rem">⚡ Fund + Earn FCT</button>`
          : `<button class="btn btn-outline" style="width:100%;padding:.7rem" disabled>${c.raised>=c.goal?'🎯 Goal Reached!':'⏱ Ended'}</button>`}
        <div style="text-align:center;font-size:.68rem;color:var(--gold);font-family:'JetBrains Mono',monospace;margin-top:.75rem">⬡ You earn 1 FCT per 1 XLM funded</div>
      </div>
    </div>
  </div>`;
}

export function renderMyCampaigns(s) {
  const { walletAddress, campaigns, fctBalance } = s;
  if (!walletAddress) return `<div class="connect-wall">
    <div class="connect-wall-icon">🔐</div>
    <h2>Connect Freighter</h2>
    <p>Connect your wallet to view your campaigns and FCT token balance.</p>
    <button class="btn btn-primary" onclick="window.__fc.openWalletModal()">Connect Wallet</button>
  </div>`;

  const mine   = campaigns.filter(c => c.owner === walletAddress);
  const backed = campaigns.filter(c => (c.contributions||[]).some(x => x.addr === walletAddress));

  return `
    <div class="fct-panel">
      <div><div class="fct-panel-title">Your FCT Balance</div><div class="fct-panel-value">⬡ ${fctBalance.toLocaleString()} FCT</div><div class="fct-panel-note">Earned by funding campaigns · 1 XLM = 1 FCT</div></div>
      <div style="text-align:right"><div class="fct-panel-title">Token Contract</div><code style="font-size:.65rem;color:var(--muted)">FCToken (FCT)</code><div class="fct-panel-note">Stellar Testnet SEP-41</div></div>
    </div>
    <div class="section-header"><div class="section-title">My Campaigns</div><button class="btn btn-primary btn-sm" onclick="window.__fc.openCreateModal()">+ New</button></div>
    ${!mine.length
      ? `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No campaigns yet</div><p>Launch your first campaign.</p></div>`
      : mine.map(c => {
          const pct = Math.min((c.raised/c.goal)*100,100);
          const st  = c.daysLeft<=0?'ended':c.raised>=c.goal?'success':'active';
          const labels = {active:'Active',ended:'Ended',success:'Funded'};
          return `<div class="campaign-row" onclick="window.__fc.openDetailModal('${c.id}')">
            <div class="campaign-row-icon">${c.emoji||'⭐'}</div>
            <div class="campaign-row-info"><div class="campaign-row-title">${c.title}</div><div class="campaign-row-sub">${c.raised}/${c.goal} XLM · ${c.backers} backers · ⬡${c.tokenMinted||0} FCT minted</div></div>
            <span class="status-chip status-${st}">${labels[st]}</span>
          </div>`;
        }).join('')}
    ${backed.length ? `
      <div class="section-header" style="margin-top:2rem"><div class="section-title">Campaigns I Backed</div></div>
      ${backed.map(c => {
        const total = (c.contributions||[]).filter(x=>x.addr===walletAddress).reduce((s,x)=>s+x.amount,0);
        return `<div class="campaign-row" onclick="window.__fc.openDetailModal('${c.id}')">
          <div class="campaign-row-icon">${c.emoji||'⭐'}</div>
          <div class="campaign-row-info"><div class="campaign-row-title">${c.title}</div><div class="campaign-row-sub">Contributed ${total} XLM · Earned ⬡${total} FCT</div></div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--gold)">⬡ +${total} FCT</span>
        </div>`;
      }).join('')}` : ''}`;
}

export function renderTransactions(s) {
  const all = [...s.transactions].slice(0, 25);
  return `<div class="section-header"><div class="section-title">Transaction History</div></div>
    <div class="tx-list">
      ${!all.length
        ? `<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No transactions yet</div></div>`
        : all.map(tx => {
            const d = new Date(tx.ts);
            const when = d.toLocaleDateString('en',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
            const iconClass = tx.isFCT ? 'fct' : tx.dir;
            const icon = tx.isFCT ? '⬡' : tx.dir==='in' ? '⬇' : '⬆';
            return `<div class="tx-item">
              <div class="tx-icon ${iconClass}">${icon}</div>
              <div class="tx-info"><div class="tx-title">${tx.label}</div><div class="tx-sub">${when}</div></div>
              ${tx.amount > 0
                ? `<div class="tx-amount ${tx.isFCT?'fct':tx.dir}">${tx.isFCT?'⬡':tx.dir==='in'?'+':'-'}${tx.amount} ${tx.isFCT?'FCT':'XLM'}</div>`
                : `<div class="tx-amount" style="color:var(--muted)">deploy</div>`}
            </div>`;
          }).join('')}
    </div>`;
}

export function openWalletModal() {
  document.getElementById('wm-root')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'wm-root'; overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal" style="max-width:400px">
    <div class="modal-header">
      <div><div class="modal-title">Connect Wallet</div><div class="modal-subtitle">Freighter recommended for Stellar Testnet</div></div>
      <button class="modal-close" id="wm-close">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.625rem;margin-bottom:1.5rem">
      ${WALLETS.map(w => `<div class="wallet-option" data-wid="${w.id}" role="button" tabindex="0">
        <div>${w.icon}</div>
        <div style="flex:1">
          <div class="wallet-option-name">${w.name}</div>
          <div class="wallet-option-net" style="color:${w.network?.color||'#666'};background:${w.network?.color||'#666'}22">${w.network?.name||''}</div>
        </div>
        <span style="color:var(--green);font-size:.6rem">●</span>
      </div>`).join('')}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:1rem;font-size:.72rem;color:var(--muted);line-height:1.7">
      🔒 Stellar Testnet only — no real XLM.<br>
      No Freighter? <a href="https://freighter.app" target="_blank" style="color:var(--gold)">freighter.app</a>
    </div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.getElementById('wm-close').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('.wallet-option').forEach(el => {
    el.addEventListener('click', () => _connectWallet(el.dataset.wid, overlay));
  });
}

async function _connectWallet(walletId, overlay) {
  overlay.remove();
  setProcessing(true, `CONNECTING ${walletId.toUpperCase()}...`);
  try {
    const r = await walletManager.connect(walletId);
    store.setState({ walletId, walletAddress: r.address, walletBalance: r.balance, walletNetwork: r.network });
    showToast(`✅ ${walletId} connected`, 'success');
    loadFCTStats(r.address);
  } catch (err) {
    const msg = err instanceof WalletError ? err.message : err.message;
    showToast(msg, 'error', 5000);
  } finally { setProcessing(false); }
}