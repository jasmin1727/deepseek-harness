/**
 * DeepSeek Harness — Chat Input Component
 * iPhone / macOS style hero input card:
 * - Rounded pill container (border-radius: 22px)
 * - Placeholder: "Describe what you want to build, / commands, @ files or sessions"
 * - Bottom toolbar:
 *   - Left: Round '+' button, '🛡️ Workspace Write ⌵' permission selector pill
 *   - Right: Model selector pill + circular blue '↑' send button
 */

import { icons } from '../../components/ui/icons.js';
import { store } from '../../store/state.js';
import { openDropdown } from '../../components/ui/dropdown.js';
import { mockModels } from '../../mocks/models.js';
import { showToast } from '../../components/ui/toast.js';
import { callRpc } from '../../api/rpc.js';
import { apiClient } from '../../api/client.js';

export function createChatInput({ onSend, placeholder = 'Describe what you want to build, / commands, @ files or sessions' }) {
  const container = document.createElement('div');
  container.className = 'chat-input-container';

  const card = document.createElement('div');
  card.className = 'chat-input-card';

  // 1. Textarea Body
  const body = document.createElement('div');
  body.className = 'chat-input-body';

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-hero-textarea';
  textarea.id = 'chat-hero-textarea';
  textarea.placeholder = placeholder;
  textarea.rows = 1;

  body.appendChild(textarea);

  // 2. Bottom Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'chat-input-toolbar';

  // Left Toolbar: Round '+' button + Permission selector pill
  const toolbarLeft = document.createElement('div');
  toolbarLeft.className = 'chat-toolbar-left';

  // Attachments Tray
  const attachmentsTray = document.createElement('div');
  attachmentsTray.className = 'chat-attachments-tray hidden';
  attachmentsTray.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 2px 14px;';

  let attachedFiles = [];

  function renderAttachments() {
    attachmentsTray.innerHTML = '';
    if (attachedFiles.length === 0) {
      attachmentsTray.style.display = 'none';
      return;
    }
    attachmentsTray.style.display = 'flex';
    attachedFiles.forEach((file, idx) => {
      const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
      const isDoc = /\.(pdf|docx?|xlsx?|pptx?)$/i.test(file.name);
      const pill = document.createElement('div');
      pill.className = 'attached-file-pill';
      pill.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--bg-card, rgba(255,255,255,0.06)); border: 1px solid var(--border-default, rgba(255,255,255,0.1)); border-radius: 8px; font-size: 12px; color: var(--text-primary); max-width: 240px;';
      pill.innerHTML = `
        <span class="pill-icon" style="display: flex; align-items: center; color: var(--accent-brand, #3b82f6);">${isImg ? icons.image('', 13) : isDoc ? icons.file('', 13) : icons.paperclip('', 13)}</span>
        <span class="pill-name" title="${escapeHtml(file.path || file.name)}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(file.name)}</span>
        <button type="button" class="pill-remove" title="Remove attachment" aria-label="Remove" style="background: transparent; border: none; color: var(--text-tertiary, #888); cursor: pointer; padding: 0 2px; font-size: 13px; line-height: 1;">×</button>
      `;
      pill.querySelector('.pill-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        attachedFiles.splice(idx, 1);
        renderAttachments();
      });
      attachmentsTray.appendChild(pill);
    });
  }

  let isPicking = false;
  async function openFileAttachmentPicker() {
    if (isPicking) return;
    isPicking = true;
    try {
      let pickedPath = null;
      if (window.__TAURI__ && window.__TAURI__.core) {
        pickedPath = await window.__TAURI__.core.invoke('cmd_pick_file');
      }

      if (pickedPath) {
        const filename = pickedPath.split('/').filter(Boolean).pop() || pickedPath;
        addAttachment(filename, pickedPath);
      }
    } catch (err) {
      console.warn('cmd_pick_file failed:', err);
    } finally {
      isPicking = false;
    }
  }

  function addAttachment(filename, fullPath) {
    if (!attachedFiles.some(f => f.path === fullPath)) {
      attachedFiles.push({ name: filename, path: fullPath });
      renderAttachments();
      const refToken = ` @"${fullPath}" `;
      textarea.value = (textarea.value.trim() ? textarea.value + ' ' : '') + refToken;
      textarea.dispatchEvent(new Event('input'));
      sendBtn.disabled = false;
      showToast(`Attached: ${filename}`, 'success');
    }
  }

  // Round '+' attach button
  const attachBtn = document.createElement('button');
  attachBtn.className = 'btn-round-plus';
  attachBtn.id = 'chat-btn-attach';
  attachBtn.type = 'button';
  attachBtn.title = 'Attach file or image (Ctrl+U)';
  attachBtn.setAttribute('aria-label', 'Attach file or image (Ctrl+U)');
  attachBtn.innerHTML = icons.plus('', 15);
  attachBtn.addEventListener('click', () => {
    openFileAttachmentPicker();
  });

  // Permission selector pill dropdown: '🛡️ Workspace Write ⌵'
  let currentPermission = 'Workspace Write';
  const permissionBtn = document.createElement('button');
  permissionBtn.className = 'permission-pill-btn';
  permissionBtn.id = 'chat-permission-btn';
  permissionBtn.type = 'button';
  permissionBtn.title = 'Change workspace execution permissions';

  function updatePermissionText() {
    permissionBtn.innerHTML = `
      <span class="permission-icon">${icons.shield('', 13)}</span>
      <span class="permission-text">${currentPermission}</span>
      <span class="permission-chevron">${icons.chevronDown('', 11)}</span>
    `;
  }
  updatePermissionText();

  permissionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown({
      triggerEl: permissionBtn,
      position: 'top-start',
      items: [
        {
          label: 'Workspace Write (Recommended)',
          icon: icons.shield('', 13),
          onClick: () => {
            currentPermission = 'Workspace Write';
            updatePermissionText();
            showToast('Execution mode: Workspace Write', 'info');
          }
        },
        {
          label: 'Workspace Read-Only',
          icon: icons.lock('', 13),
          onClick: () => {
            currentPermission = 'Workspace Read-Only';
            updatePermissionText();
            showToast('Execution mode: Workspace Read-Only', 'info');
          }
        },
        {
          label: 'Full System Access',
          icon: icons.terminal('', 13),
          onClick: () => {
            currentPermission = 'Full Access';
            updatePermissionText();
            showToast('Execution mode: Full System Access', 'info');
          }
        }
      ]
    });
  });

  toolbarLeft.appendChild(attachBtn);
  toolbarLeft.appendChild(permissionBtn);

  // Right Toolbar: Model Selector pill + Circular Blue '↑' Send Button / Square Stop Button
  const toolbarRight = document.createElement('div');
  toolbarRight.className = 'chat-toolbar-right';

  // Model Selector Pill Button
  const modelBtn = document.createElement('button');
  modelBtn.className = 'model-select-btn';
  modelBtn.id = 'chat-input-model-btn';
  modelBtn.type = 'button';

  let availableModels = [...mockModels];

  async function refreshModelCatalog() {
    try {
      const catalog = await callRpc('session', 'modelCatalog');
      if (window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke('cmd_log_webview', {
          level: 'info',
          msg: 'CATALOG_GROUPS: ' + JSON.stringify(catalog?.groups?.map(g => ({ id: g.id, name: g.name, models: g.models?.map(m => m.id) })))
        }).catch(() => {});
      }
      if (catalog && Array.isArray(catalog.groups) && catalog.groups.length > 0) {
        const fetched = [];
        for (const g of catalog.groups) {
          for (const m of (g.models || [])) {
            fetched.push({
              id: m.id,
              name: m.name || m.id,
              tag: m.reasoning ? 'Reasoner' : 'Fast',
              description: m.description || `${g.name} model`,
              provider: g.id
            });
          }
        }
        if (fetched.length > 0) {
          availableModels = fetched;
          if (catalog.defaultSelection?.model) {
            const defModel = fetched.find(m => m.id === catalog.defaultSelection.model);
            if (defModel) {
              store.setSelectedModel(defModel.id, defModel.provider);
            }
          } else if (!store.getState().selectedModelProvider && fetched[0]) {
            store.setSelectedModel(fetched[0].id, fetched[0].provider);
          }
          updateModelBtnText();
        }
      }
    } catch {
      // Keep defaults
    }
  }
  refreshModelCatalog();
  apiClient.onStatusChange((info) => {
    if (info && info.status === 'ready') refreshModelCatalog();
  });

  function updateModelBtnText() {
    const state = store.getState();
    const currentModel = availableModels.find((m) => m.id === state.selectedModel) || availableModels[0] || mockModels[0];
    modelBtn.innerHTML = `
      <span class="model-name">${currentModel.name}</span>
      <span class="model-tag">${currentModel.tag}</span>
      <span class="model-chevron">${icons.chevronDown('', 11)}</span>
    `;
  }
  updateModelBtnText();

  modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown({
      triggerEl: modelBtn,
      position: 'top-end',
      items: availableModels.map((m) => ({
        label: `${m.name} (${m.tag}) — ${(m.description || '').slice(0, 32)}...`,
        icon: m.tag === 'Reasoner' || m.id.includes('r1') ? icons.sparkles('', 14) : icons.cpu('', 14),
        onClick: async () => {
          store.setSelectedModel(m.id, m.provider);
          updateModelBtnText();
          showToast(`Switched to ${m.name}`, 'info');
          const activeId = store.getState().activeChatId;
          if (activeId && m.provider) {
            try {
              await callRpc('session', 'selectModel', {
                request: {
                  sessionId: activeId,
                  provider: m.provider,
                  model: m.id
                }
              });
            } catch (err) {
              console.warn('Failed to select model on daemon:', err);
            }
          }
        }
      }))
    });
  });

  // Circular Blue Send Button (↑) / Square Stop Button (■)
  let isGenerating = false;
  let activeCancelFn = null;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-circle-send';
  sendBtn.id = 'btn-chat-send';
  sendBtn.type = 'button';
  sendBtn.disabled = true;
  sendBtn.title = 'Send message (Enter)';
  sendBtn.setAttribute('aria-label', 'Send message');
  sendBtn.innerHTML = icons.arrowUp('', 14);

  function handleSend() {
    if (isGenerating) {
      if (activeCancelFn) activeCancelFn();
      return;
    }

    const text = textarea.value.trim();
    if (!text && attachedFiles.length === 0) return;

    if (onSend) {
      onSend(text);
    }

    textarea.value = '';
    textarea.style.height = 'auto';
    attachedFiles = [];
    renderAttachments();
    sendBtn.disabled = true;
  }

  sendBtn.addEventListener('click', handleSend);

  // Auto-grow textarea & Enter handler
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    if (!isGenerating) {
      sendBtn.disabled = textarea.value.trim().length === 0 && attachedFiles.length === 0;
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && isGenerating) {
      e.preventDefault();
      if (activeCancelFn) activeCancelFn();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      e.stopPropagation();
      openFileAttachmentPicker();
    }
  });

  toolbarRight.appendChild(modelBtn);
  toolbarRight.appendChild(sendBtn);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarRight);

  card.appendChild(attachmentsTray);
  card.appendChild(body);
  card.appendChild(toolbar);
  container.appendChild(card);

  // Store Subscriptions
  store.subscribe('model:change', () => {
    updateModelBtnText();
  });

  return {
    element: container,
    textarea,
    setValue: (val) => {
      textarea.value = val;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
      if (!isGenerating) {
        sendBtn.disabled = val.trim().length === 0;
      }
      textarea.focus();
    },
    setGenerating: (generating, onCancel = null) => {
      isGenerating = !!generating;
      activeCancelFn = onCancel;
      if (isGenerating) {
        sendBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="14" height="14" rx="2.5"/>
          </svg>
        `;
        sendBtn.disabled = false;
        sendBtn.title = 'Stop generation (Esc)';
        sendBtn.setAttribute('aria-label', 'Stop generation');
        sendBtn.classList.add('is-stop-btn');
      } else {
        sendBtn.innerHTML = icons.arrowUp('', 14);
        sendBtn.disabled = textarea.value.trim().length === 0;
        sendBtn.title = 'Send message (Enter)';
        sendBtn.setAttribute('aria-label', 'Send message');
        sendBtn.classList.remove('is-stop-btn');
      }
    },
    focus: () => textarea.focus(),
    openAttachmentPicker: openFileAttachmentPicker
  };
}
