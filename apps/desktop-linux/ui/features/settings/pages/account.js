/**
 * Settings Page — Account
 * Profile details, active subscription tier, wallet token balance, and sign out.
 */

import { store } from '../../../store/state.js';
import { callRpc } from '../../../api/rpc.js';
import { getClientMetadata, signOut } from '../../../api/auth.js';
import { showToast } from '../../../components/ui/toast.js';

export function renderAccountPage({ onSignOut, onCloseModal }) {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  let user = store.getState().user;
  let balanceInfo = null;

  async function loadRemoteDetails() {
    try {
      const client = getClientMetadata();
      const [profileRes, balanceRes] = await Promise.allSettled([
        callRpc('account', 'getProfile', { client }),
        callRpc('account', 'getBalance', { client })
      ]);

      if (profileRes.status === 'fulfilled' && profileRes.value) {
        const p = profileRes.value.value || profileRes.value;
        if (p && (p.name || p.contact || p.email)) {
          const name = p.name || p.contact || user.name;
          const email = p.contact || p.email || user.email;
          store.login('google', name, email);
          user = store.getState().user;
        }
      }

      if (balanceRes.status === 'fulfilled' && balanceRes.value) {
        const b = balanceRes.value.value || balanceRes.value;
        if (b) {
          balanceInfo = b;
        }
      }
    } catch (e) {
      console.warn('Account: failed to fetch remote details:', e);
    }
  }

  function render() {
    const plan = user.plan || 'Pro';
    let badgeClass = 'badge-pro';
    if (plan.toLowerCase() === 'free' || plan.toLowerCase() === 'guest') badgeClass = 'badge-free';
    if (plan.toLowerCase() === 'api') badgeClass = 'badge-api';

    const normalTokens = balanceInfo?.normal_wallets?.length
      ? balanceInfo.normal_wallets.map(w => `${w.currency || ''} ${w.amount || '0'}`).join(', ')
      : null;

    container.innerHTML = `
      <!-- Profile Card -->
      <div class="settings-section-card">
        <h3 class="settings-card-title">Identity & Profile</h3>
        <p class="settings-card-desc">Manage your workspace account credentials and authentication.</p>

        <div style="display: flex; align-items: center; gap: 16px; padding: 10px 0 16px; border-bottom: 1px solid var(--border-subtle);">
          <div class="avatar" style="width: 52px; height: 52px; font-size: 20px; font-weight: 600;">
            ${(user.name?.[0] || 'D').toUpperCase()}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 15px; font-weight: 600; color: var(--text-primary);">${escapeHtml(user.name)}</span>
              <span class="badge ${badgeClass}">${plan}</span>
            </div>
            <span style="font-size: 12.5px; color: var(--text-tertiary);">${escapeHtml(user.email)}</span>
          </div>
        </div>

        ${normalTokens ? `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
            <div>
              <span style="font-size: 13px; font-weight: 500; color: var(--text-primary);">Token Balance</span>
              <p style="font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0 0;">Active DeepSeek Platform wallet credit.</p>
            </div>
            <span class="badge badge-pro" style="font-family: var(--font-mono); font-size: 12px;">${normalTokens}</span>
          </div>
        ` : ''}

        <!-- Editable Name -->
        <div class="settings-row" style="margin-top: 12px;">
          <div class="settings-row-text">
            <span class="settings-row-label">Display Name</span>
            <span class="settings-row-sub">Visible in greetings and collaborative multi-agent transcripts.</span>
          </div>
          <div class="settings-row-control">
            <input type="text" class="input-text" id="setting-account-name" value="${escapeHtml(user.name)}" style="width: 220px;" />
          </div>
        </div>

        <!-- Editable Email -->
        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Email Address</span>
            <span class="settings-row-sub">Used for invoice receipts and notifications.</span>
          </div>
          <div class="settings-row-control">
            <input type="email" class="input-text" id="setting-account-email" value="${escapeHtml(user.email)}" style="width: 220px;" />
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; padding-top: 10px;">
          <button class="btn btn-primary" id="btn-save-account">Save Changes</button>
        </div>
      </div>

      <!-- Active Session & Sign Out -->
      <div class="settings-section-card">
        <h3 class="settings-card-title">Session Management</h3>
        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Sign Out of Harness</span>
            <span class="settings-row-sub">Terminates daemon session and clears local runtime tokens.</span>
          </div>
          <div class="settings-row-control">
            <button class="btn btn-secondary" id="btn-account-signout">Sign Out</button>
          </div>
        </div>
      </div>
    `;

    // Handlers
    const saveBtn = container.querySelector('#btn-save-account');
    const nameInput = container.querySelector('#setting-account-name');
    const emailInput = container.querySelector('#setting-account-email');

    saveBtn?.addEventListener('click', () => {
      const newName = nameInput.value.trim() || user.name;
      const newEmail = emailInput.value.trim() || user.email;

      store.login(store.getState().auth.mode, newName, newEmail);
      user = store.getState().user;
      showToast('Profile updated', 'success');
      render();
    });

    const signOutBtn = container.querySelector('#btn-account-signout');
    signOutBtn?.addEventListener('click', async () => {
      if (confirm('Sign out of DeepSeek Harness?')) {
        await signOut().catch(() => {});
        if (onCloseModal) onCloseModal();
        if (onSignOut) onSignOut();
      }
    });
  }

  render();
  loadRemoteDetails().then(() => render());

  return container;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
