/**
 * Settings Page — Plugins Registry
 */

import { icons } from '../../../components/ui/icons.js';

export function renderPluginsPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  container.innerHTML = `
    <div class="settings-section-card" style="text-align: center; padding: 44px 28px;">
      <div style="display: flex; justify-content: center; margin-bottom: 16px; color: var(--accent-brand);">
        ${icons.sliders('', 32)}
      </div>
      <h3 class="settings-card-title" style="font-size: 17px; margin-bottom: 8px;">Plugins</h3>
      <p class="settings-card-desc" style="max-width: 420px; margin: 0 auto 18px; line-height: 1.5;">
        Native plugins and sidecar extensions extending the Cordis agent execution loop with custom toolchains and sandbox environments.
      </p>
      <div style="display: flex; justify-content: center;">
        <span class="coming-soon-pill">Coming Soon...</span>
      </div>
    </div>
  `;

  return container;
}
