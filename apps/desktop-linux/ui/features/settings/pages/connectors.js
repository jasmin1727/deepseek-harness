/**
 * Settings Page — Third-Party Connectors
 */

import { icons } from '../../../components/ui/icons.js';

export function renderConnectorsPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  container.innerHTML = `
    <div class="settings-section-card" style="text-align: center; padding: 44px 28px;">
      <div style="display: flex; justify-content: center; margin-bottom: 16px; color: var(--accent-brand);">
        ${icons.link2('', 32)}
      </div>
      <h3 class="settings-card-title" style="font-size: 17px; margin-bottom: 8px;">Connectors</h3>
      <p class="settings-card-desc" style="max-width: 420px; margin: 0 auto 18px; line-height: 1.5;">
        Connect developer workspaces, GitHub issue trackers, remote databases, and external tool APIs directly to your agent loop.
      </p>
      <div style="display: flex; justify-content: center;">
        <span class="coming-soon-pill">Coming Soon...</span>
      </div>
    </div>
  `;

  return container;
}
