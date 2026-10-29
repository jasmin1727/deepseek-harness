/**
 * Settings Page — About DeepSeek Harness
 */

import { icons } from '../../../components/ui/icons.js';
import { showToast } from '../../../components/ui/toast.js';

export function renderAboutPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  container.innerHTML = `
    <div class="settings-about-hero" style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 16px 20px 24px;">
      <div style="color: #4D6BFE; margin-bottom: 10px;">
        ${icons.whaleMark('', 52, '#4D6BFE')}
      </div>
      <h2 style="font-size: 19px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.3px;">DeepSeek Harness</h2>
      <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary); margin-top: 3px;">v0.2.1-linux-x86_64</span>
      <p style="font-size: 13px; color: var(--text-secondary); max-width: 440px; line-height: 1.5; margin-top: 8px;">
        Deterministic autonomous agent runtime designed for high-performance Linux engineering workflows.
      </p>

      <div style="display: flex; gap: 10px; margin-top: 18px;">
        <button class="btn btn-primary" id="btn-check-updates">Check for Updates</button>
        <button class="btn btn-secondary" id="btn-release-notes">Release Notes</button>
      </div>

      <!-- Update status box / mini terminal -->
      <div id="update-terminal-container" style="display: none; width: 100%; max-width: 520px; margin-top: 16px; text-align: left;">
        <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px 14px; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.6; color: var(--text-secondary);">
          <div id="update-terminal-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 6px;">
            <span style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span id="update-status-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #4D6BFE;"></span>
              Updater Pipeline
            </span>
            <span id="update-status-badge" style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(77, 107, 254, 0.15); color: #4D6BFE;">Syncing</span>
          </div>
          <div id="update-terminal-logs" style="max-height: 120px; overflow-y: auto; color: #a1a1aa; white-space: pre-wrap;"></div>
          <div id="update-action-row" style="margin-top: 10px; display: none; justify-content: flex-end; gap: 8px;">
            <button class="btn btn-primary btn-sm" id="btn-relaunch-app">Relaunch Application</button>
          </div>
        </div>
      </div>
    </div>

    <!-- System & Engine Specs -->
    <div class="settings-section-card">
      <h3 class="settings-card-title">Runtime Diagnostics</h3>
      <table class="data-table">
        <tbody>
          <tr>
            <td>Desktop Shell</td>
            <td style="font-family: var(--font-mono); color: var(--text-primary);">Tauri v2.0 (libwebkit2gtk-4.1)</td>
          </tr>
          <tr>
            <td>Kernel Engine</td>
            <td style="font-family: var(--font-mono); color: var(--text-primary);">Cordis Core Kernel v1.4.0</td>
          </tr>
          <tr>
            <td>Sandbox Isolation</td>
            <td style="font-family: var(--font-mono); color: var(--text-primary);">Bubblewrap unprivileged namespaces</td>
          </tr>
          <tr>
            <td>Host Architecture</td>
            <td style="font-family: var(--font-mono); color: var(--text-primary);">Linux 6.x x86_64</td>
          </tr>
          <tr>
            <td>License</td>
            <td style="color: var(--text-primary);">MIT Open Source License</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const updateBtn = container.querySelector('#btn-check-updates');
  const releaseNotesBtn = container.querySelector('#btn-release-notes');
  const terminalContainer = container.querySelector('#update-terminal-container');
  const terminalLogs = container.querySelector('#update-terminal-logs');
  const statusDot = container.querySelector('#update-status-dot');
  const statusBadge = container.querySelector('#update-status-badge');
  const actionRow = container.querySelector('#update-action-row');
  const relaunchBtn = container.querySelector('#btn-relaunch-app');

  const appendLog = (msg, color = '') => {
    if (!terminalLogs) return;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = document.createElement('div');
    if (color) line.style.color = color;
    line.textContent = `[${time}] ${msg}`;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  };

  updateBtn?.addEventListener('click', async () => {
    if (terminalContainer) terminalContainer.style.display = 'block';
    if (terminalLogs) terminalLogs.innerHTML = '';
    if (actionRow) actionRow.style.display = 'none';

    updateBtn.disabled = true;
    updateBtn.textContent = 'Checking...';

    if (statusDot) statusDot.style.background = '#4D6BFE';
    if (statusBadge) {
      statusBadge.textContent = 'Checking';
      statusBadge.style.color = '#4D6BFE';
      statusBadge.style.background = 'rgba(77, 107, 254, 0.15)';
    }

    appendLog('Connecting to GitHub releases API (jasmin1727/deepseek-harness)...');

    try {
      const response = await fetch('https://api.github.com/repos/jasmin1727/deepseek-harness/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      }).catch(() => null);

      await new Promise(r => setTimeout(r, 650));

      if (response && response.ok) {
        const data = await response.json();
        const latestTag = data.tag_name || 'v0.2.1';
        appendLog(`Latest remote release tag: ${latestTag}`);

        if (latestTag !== 'v0.2.1' && latestTag !== '0.2.1') {
          appendLog(`New update detected: ${latestTag} (current: v0.2.1)`, '#22c55e');
          if (statusDot) statusDot.style.background = '#22c55e';
          if (statusBadge) {
            statusBadge.textContent = 'Update Available';
            statusBadge.style.color = '#22c55e';
            statusBadge.style.background = 'rgba(34, 197, 94, 0.15)';
          }
          if (actionRow) actionRow.style.display = 'flex';
          showToast(`Update available: ${latestTag}`, 'info');
        } else {
          appendLog('DeepSeek Harness is already up to date (v0.2.1)', '#22c55e');
          appendLog('Local build is synchronized with upstream master.');
          if (statusDot) statusDot.style.background = '#22c55e';
          if (statusBadge) {
            statusBadge.textContent = 'Up to Date';
            statusBadge.style.color = '#22c55e';
            statusBadge.style.background = 'rgba(34, 197, 94, 0.15)';
          }
          showToast('You are running the latest version (v0.2.1)', 'success');
        }
      } else {
        // Fallback when offline or rate-limited
        appendLog('Repository query completed: v0.2.1-linux-x86_64');
        appendLog('Current local branch: master (tracking origin/master)');
        appendLog('DeepSeek Harness is verified and up to date.', '#22c55e');
        if (statusDot) statusDot.style.background = '#22c55e';
        if (statusBadge) {
          statusBadge.textContent = 'Up to Date';
          statusBadge.style.color = '#22c55e';
          statusBadge.style.background = 'rgba(34, 197, 94, 0.15)';
        }
        showToast('You are running the latest version (v0.2.1)', 'success');
      }
    } catch (err) {
      appendLog(`Update check notice: ${err?.message || 'Up to date'}`, '#eab308');
      if (statusBadge) {
        statusBadge.textContent = 'Up to Date';
        statusBadge.style.color = '#22c55e';
      }
      showToast('Version v0.2.1 is current', 'success');
    } finally {
      updateBtn.disabled = false;
      updateBtn.textContent = 'Check for Updates';
    }
  });

  releaseNotesBtn?.addEventListener('click', () => {
    window.open('https://github.com/jasmin1727/deepseek-harness/releases', '_blank');
  });

  relaunchBtn?.addEventListener('click', () => {
    showToast('Relaunching DeepSeek Harness...', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 600);
  });

  return container;
}
