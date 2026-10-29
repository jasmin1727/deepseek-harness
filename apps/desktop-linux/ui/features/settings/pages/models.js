/**
 * Settings Page — Model Configuration
 * Configures default foundation model and inference parameters.
 */

import { store } from '../../../store/state.js';
import { callRpc } from '../../../api/rpc.js';
import { showToast } from '../../../components/ui/toast.js';

export function renderModelsPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  const mod = store.getState().settings.models || {
    defaultModel: 'deepseek-v3',
    temperature: 0.6
  };

  container.innerHTML = `
    <div class="settings-section-card" style="padding: 22px 24px;">
      <h3 class="settings-card-title" style="font-size: 15px; font-weight: 600;">Default Model & Inference</h3>
      <p class="settings-card-desc" style="margin-top: 4px; line-height: 1.5; color: var(--text-secondary); font-size: 13px;">
        Choose the foundation model and temperature applied when starting new sessions.
      </p>

      <!-- Default Model Selector -->
      <div class="settings-row" style="padding: 16px 0; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
        <div class="settings-row-text">
          <span class="settings-row-label" style="font-size: 13.5px; font-weight: 550; color: var(--text-primary); display: block;">Default Execution Model</span>
          <span class="settings-row-sub" style="font-size: 12.5px; color: var(--text-secondary); margin-top: 2px; display: block;">Foundation model selected for new engineering agent tasks.</span>
        </div>
        <div class="settings-row-control">
          <select class="select-input" id="setting-default-model" style="min-width: 220px; height: 36px; font-size: 13px; border-radius: 8px;">
            <option value="deepseek-v3" ${mod.defaultModel === 'deepseek-v3' ? 'selected' : ''}>DeepSeek-V3 (MoE)</option>
            <option value="deepseek-r1" ${mod.defaultModel === 'deepseek-r1' ? 'selected' : ''}>DeepSeek-R1 (Reasoner)</option>
          </select>
        </div>
      </div>

      <!-- Temperature Slider -->
      <div class="settings-row" style="padding: 16px 0; display: flex; align-items: center; justify-content: space-between;">
        <div class="settings-row-text">
          <span class="settings-row-label" style="font-size: 13.5px; font-weight: 550; color: var(--text-primary); display: block;">Sampling Temperature</span>
          <span class="settings-row-sub" style="font-size: 12.5px; color: var(--text-secondary); margin-top: 2px; display: block;">Lower values (0.2) are more deterministic; higher values (0.8) are more creative.</span>
        </div>
        <div class="settings-row-control">
          <div class="slider-control-group" style="display: flex; align-items: center; gap: 12px;">
            <input type="range" class="range-slider" id="setting-temp-slider" min="0" max="1.0" step="0.05" value="${mod.temperature ?? 0.6}" style="width: 130px;" />
            <span class="slider-val-tag" id="setting-temp-val" style="font-family: var(--font-mono); font-size: 12.5px; font-weight: 500; min-width: 32px; text-align: right;">${mod.temperature ?? 0.6}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Dynamically query catalog from daemon to populate all detected models for user
  const modelSelect = container.querySelector('#setting-default-model');
  callRpc('model', 'getCatalog', { _request: {} }).then((catalog) => {
    if (catalog && Array.isArray(catalog.groups) && catalog.groups.length > 0) {
      const options = [];
      for (const g of catalog.groups) {
        for (const m of (g.models || [])) {
          const isSelected = mod.defaultModel === m.id;
          const tag = m.reasoning ? 'Reasoner' : 'Fast';
          options.push(`<option value="${m.id}" ${isSelected ? 'selected' : ''}>${m.name || m.id} (${tag})</option>`);
        }
      }
      if (options.length > 0) {
        modelSelect.innerHTML = options.join('');
      }
    }
  }).catch(() => {
    // Keep defaults
  });

  // Attach handlers
  modelSelect?.addEventListener('change', (e) => {
    store.updateSetting('models', 'defaultModel', e.target.value);
    showToast(`Default model set to ${e.target.value}`, 'info');
  });

  const tempSlider = container.querySelector('#setting-temp-slider');
  const tempVal = container.querySelector('#setting-temp-val');
  tempSlider?.addEventListener('input', (e) => {
    tempVal.textContent = e.target.value;
  });
  tempSlider?.addEventListener('change', (e) => {
    store.updateSetting('models', 'temperature', parseFloat(e.target.value));
    showToast(`Temperature set to ${e.target.value}`, 'info');
  });

  return container;
}
