/**
 * DeepSeek Harness — Main Chat Area Controller
 * Ultra-clean, minimal iPhone/macOS-style layout:
 * - No topbar / workspace header in empty state
 * - No workflow suggestion cards
 * - No bottom status strip
 * - Single floating toggle button when sidebar is collapsed (never duplicate buttons)
 * - Hero lockup: [whale logo] Into the Unknown [Preview]
 * - Workspace selector pill above input: 📁 Default workspace ⌵
 * - Hero rounded input card
 * - Seamless switch to conversation view on user prompt
 * - Real live token streaming, reasoning blocks, sandboxed tool calls, and cancellation
 */

import { icons } from '../../components/ui/icons.js';
import { store, USE_MOCKS } from '../../store/state.js';
import { createChatInput } from './chatInput.js';
import { createMessagesList } from './chatMessages.js';
import { mockConversations } from '../../mocks/conversationSamples.js';
import { openDropdown } from '../../components/ui/dropdown.js';
import { showToast } from '../../components/ui/toast.js';
import { listWorkspaces, pickAndCreateWorkspace } from '../../api/workspaces.js';
import { createSession, loadSessionHistory, cancelSession, renameSession, saveSessionTitle } from '../../api/sessions.js';
import { streamMux } from '../../api/stream.js';
import { callRpc } from '../../api/rpc.js';

export function createChatArea() {
  const container = document.createElement('section');
  container.className = 'app-center-view';
  container.id = 'app-center-view';

  // 1. Floating Sidebar Toggle Button (ONLY visible when sidebar is collapsed)
  const floatingToggleBtn = document.createElement('button');
  floatingToggleBtn.className = 'btn-icon floating-sidebar-toggle-btn';
  floatingToggleBtn.id = 'floating-sidebar-toggle';
  floatingToggleBtn.type = 'button';
  floatingToggleBtn.title = 'Open Sidebar (Ctrl+B)';
  floatingToggleBtn.setAttribute('aria-label', 'Open Sidebar');
  floatingToggleBtn.innerHTML = icons.sidebar('', 16);
  floatingToggleBtn.addEventListener('click', () => {
    store.toggleSidebar();
  });

  function syncFloatingToggle(isOpen) {
    floatingToggleBtn.style.display = isOpen ? 'none' : 'flex';
  }
  syncFloatingToggle(store.getState().sidebar.isOpen);

  store.subscribe('sidebar:toggle', (isOpen) => {
    syncFloatingToggle(isOpen);
  });

  // 2. Chat Stage Wrapper
  const chatStageWrapper = document.createElement('div');
  chatStageWrapper.className = 'chat-stage-wrapper';

  // ── View A: Empty Welcome State (Into the Unknown) ────────────────────────
  const emptyStateEl = document.createElement('div');
  emptyStateEl.className = 'chat-empty-state';

  // Hero Brand Lockup: [whale logo] User Name [Plan]
  const heroLockup = document.createElement('div');
  heroLockup.className = 'empty-state-hero-lockup';

  function updateHeroGreeting() {
    const user = store.getState().user;
    const name = user?.name || 'DeepSeek User';
    const plan = user?.plan || 'Pro';
    heroLockup.innerHTML = `
      <span class="hero-whale-icon">${icons.whaleMark('', 28, '#4D6BFE')}</span>
      <span class="hero-brand-name">${name}</span>
      <span class="hero-preview-badge">${plan}</span>
    `;
  }
  updateHeroGreeting();

  // Workspace selector pill directly above input box
  const wsSelectorPill = document.createElement('button');
  wsSelectorPill.className = 'empty-state-workspace-pill';
  wsSelectorPill.id = 'empty-state-ws-pill';
  wsSelectorPill.type = 'button';

  let currentWorkspaces = [];

  function updateWsPillText(name = 'Default workspace') {
    wsSelectorPill.innerHTML = `
      <span class="ws-pill-icon">${icons.folder('', 13)}</span>
      <span class="ws-pill-text">${name}</span>
      <span class="ws-pill-chevron">${icons.chevronDown('', 11)}</span>
    `;
  }
  updateWsPillText();

  async function loadWorkspacesForPill() {
    if (USE_MOCKS) return;
    try {
      const list = await listWorkspaces();
      if (list && list.length > 0) {
        currentWorkspaces = list;
        const activeWs = list.find(w => w.id === store.getState().activeWorkspaceId) || list[0];
        if (activeWs) {
          updateWsPillText(activeWs.name);
        }
      }
    } catch (err) {
      console.warn('Failed to load workspaces for pill:', err);
    }
  }
  loadWorkspacesForPill();

  wsSelectorPill.addEventListener('click', (e) => {
    e.stopPropagation();
    const activeWsId = store.getState().activeWorkspaceId;

    const items = currentWorkspaces.map(ws => ({
      label: `${ws.name}${ws.id === activeWsId ? ' (Active)' : ''}`,
      icon: icons.folder('', 13),
      onClick: () => {
        store.setActiveWorkspace(ws.id);
        updateWsPillText(ws.name);
        showToast(`Active workspace: ${ws.name}`, 'info');
      }
    }));

    items.push({
      label: '+ Add workspace folder...',
      icon: icons.plus('', 13),
      onClick: async () => {
        try {
          const created = await pickAndCreateWorkspace();
          if (created) {
            await loadWorkspacesForPill();
            store.setActiveWorkspace(created.id);
            updateWsPillText(created.name);
            showToast(`Added workspace: ${created.name}`, 'success');
          }
        } catch (err) {
          showToast(err.message || 'Failed to open directory', 'error');
        }
      }
    });

    openDropdown({
      triggerEl: wsSelectorPill,
      position: 'bottom-start',
      items
    });
  });

  // Hero Chat Input in Empty State
  const emptyChatInput = createChatInput({
    onSend: (text) => handleUserPrompt(text)
  });

  // Group input and workspace pill for aligned layout
  const inputGroupEl = document.createElement('div');
  inputGroupEl.className = 'hero-input-group';
  inputGroupEl.appendChild(wsSelectorPill);
  inputGroupEl.appendChild(emptyChatInput.element);

  emptyStateEl.appendChild(heroLockup);
  emptyStateEl.appendChild(inputGroupEl);

  // ── View B: Conversation View ───────────────────────────────────────────
  const conversationViewEl = document.createElement('div');
  conversationViewEl.className = 'conversation-view hidden';

  // Minimal Conversation Header
  const convoHeader = document.createElement('div');
  convoHeader.className = 'conversation-header';

  const convoTitle = document.createElement('span');
  convoTitle.className = 'conversation-title-text';
  convoTitle.id = 'active-conversation-title';
  convoTitle.textContent = 'Session';

  const actionsWrap = document.createElement('div');
  actionsWrap.style.cssText = 'display: flex; align-items: center; gap: 4px;';

  const newSessionBtn = document.createElement('button');
  newSessionBtn.className = 'btn-icon convo-new-btn';
  newSessionBtn.title = 'New Session (Ctrl+N)';
  newSessionBtn.setAttribute('aria-label', 'New Session');
  newSessionBtn.innerHTML = icons.plus('', 15);
  newSessionBtn.addEventListener('click', () => {
    store.clearActiveChat();
  });

  const closeSessionBtn = document.createElement('button');
  closeSessionBtn.className = 'btn-icon convo-close-btn';
  closeSessionBtn.title = 'Close Chat';
  closeSessionBtn.setAttribute('aria-label', 'Close chat');
  closeSessionBtn.innerHTML = icons.x('', 15);
  closeSessionBtn.addEventListener('click', () => {
    store.clearActiveChat();
  });

  actionsWrap.appendChild(newSessionBtn);
  actionsWrap.appendChild(closeSessionBtn);

  convoHeader.appendChild(convoTitle);
  convoHeader.appendChild(actionsWrap);

  const messagesScrollArea = document.createElement('div');
  messagesScrollArea.className = 'messages-scroll-area';

  const bottomInputBar = document.createElement('div');
  bottomInputBar.className = 'conversation-input-bar';

  const activeChatInput = createChatInput({
    onSend: (text) => handleUserPrompt(text)
  });
  bottomInputBar.appendChild(activeChatInput.element);

  conversationViewEl.appendChild(convoHeader);
  conversationViewEl.appendChild(messagesScrollArea);
  conversationViewEl.appendChild(bottomInputBar);

  chatStageWrapper.appendChild(emptyStateEl);
  chatStageWrapper.appendChild(conversationViewEl);

  // Assemble Main Stage
  container.appendChild(floatingToggleBtn);
  container.appendChild(chatStageWrapper);

  // Single global Ctrl+U shortcut handler targeting whichever input is active
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      const isConvoVisible = !conversationViewEl.classList.contains('hidden');
      const targetInput = isConvoVisible ? activeChatInput : emptyChatInput;
      if (targetInput && targetInput.openAttachmentPicker) {
        targetInput.focus();
        targetInput.openAttachmentPicker();
      }
    }
  });

  // ── Switch Between Empty State and Active Chat ───────────────────────────
  let activeFollowHandle = null;

  async function refreshViewState() {
    const state = store.getState();
    const activeId = state.activeChatId;

    if (!activeId) {
      emptyStateEl.classList.remove('hidden');
      conversationViewEl.classList.add('hidden');
      emptyChatInput.focus();
    } else {
      emptyStateEl.classList.add('hidden');
      conversationViewEl.classList.remove('hidden');

      const chat = state.chats.find((c) => c.id === activeId);
      convoTitle.textContent = chat ? chat.title : 'Session';

      // Load history from daemon if messages not already in memory
      let existingMsgs = store.getMessages(activeId);
      if (existingMsgs.length === 0 && !USE_MOCKS) {
        try {
          const history = await loadSessionHistory(activeId);
          if (history && history.length > 0) {
            store.setSessionMessages(activeId, history);
            existingMsgs = history;
          }
        } catch (err) {
          console.warn('Failed to load session history for', activeId, err);
        }
      }

      // Auto-title from user's first prompt if still generic
      const currentChat = store.getState().chats.find((c) => c.id === activeId);
      if (currentChat && (currentChat.title === 'Conversation' || currentChat.title === 'Untitled Session' || currentChat.title === 'New conversation' || currentChat.title === 'Session')) {
        const firstUser = existingMsgs.find(m => m.role === 'user');
        if (firstUser && firstUser.text) {
          const autoTitle = formatChatTitle(firstUser.text);
          store.updateChatTitle(activeId, autoTitle);
          saveSessionTitle(activeId, autoTitle);
          renameSession(activeId, autoTitle).catch(() => {});
          convoTitle.textContent = autoTitle;
        }
      }

      renderActiveMessages();
      activeChatInput.focus();
    }
  }

  function renderActiveMessages() {
    const activeId = store.getState().activeChatId;
    if (!activeId) return;

    const msgs = store.getMessages(activeId);
    messagesScrollArea.innerHTML = '';

    const listEl = createMessagesList({
      messages: msgs,
      onRegenerate: (msg) => {
        if (USE_MOCKS) {
          simulateAssistantReply(activeId, 'Regenerating analysis and verification report...');
        } else {
          showToast('Regeneration requested', 'info');
        }
      }
    });

    messagesScrollArea.appendChild(listEl);
    messagesScrollArea.scrollTop = messagesScrollArea.scrollHeight;
  }

  function formatChatTitle(rawText) {
    const clean = (rawText || '').trim().replace(/\s+/g, ' ');
    if (!clean) return 'New conversation';
    if (clean.length > 28) {
      return clean.slice(0, 25) + '...';
    }
    return clean;
  }

  // Handle User Message Submission
  async function handleUserPrompt(text) {
    let activeId = store.getState().activeChatId;

    if (!activeId) {
      if (!USE_MOCKS) {
        try {
          const newSession = await createSession(store.getState().activeWorkspaceId);
          activeId = newSession.id;
          const initialTitle = formatChatTitle(text);
          const newChat = {
            id: activeId,
            title: initialTitle,
            category: 'today',
            timestamp: 'Just now'
          };
          const existing = store.getState().chats.filter(c => c.id !== activeId);
          store.setChats([newChat, ...existing]);
          store.setActiveChat(activeId);
          saveSessionTitle(activeId, initialTitle);
          renameSession(activeId, initialTitle).catch(() => {});
        } catch (err) {
          showToast('Failed to create session on backend: ' + err.message, 'error');
          return;
        }
      } else {
        activeId = store.createChat(text);
      }
    } else {
      // If current chat is still untitled or new conversation, auto-title from first user message
      const currentChat = store.getState().chats.find(c => c.id === activeId);
      if (currentChat && (currentChat.title === 'New conversation' || currentChat.title === 'Untitled Session' || currentChat.title === 'Conversation')) {
        const autoTitle = formatChatTitle(text);
        if (autoTitle) {
          store.updateChatTitle(activeId, autoTitle);
          saveSessionTitle(activeId, autoTitle);
          renameSession(activeId, autoTitle).catch(() => {});
        }
      }
    }

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text,
      timestamp: formatTime(new Date())
    };

    store.addMessage(activeId, userMsg);
    refreshViewState();

    if (USE_MOCKS) {
      simulateAssistantReply(activeId, text);
      return;
    }

    // Real backend chat flow
    await executeRealPrompt(activeId, text);
  }

  async function executeRealPrompt(sessionId, text) {
    // 1. Create live streaming assistant message model
    const assistantMsg = {
      id: `msg-asst-${Date.now()}`,
      role: 'assistant',
      text: '',
      thinking: '',
      toolCall: null,
      approvalRequest: null,
      userQuestion: null,
      model: store.getState().selectedModel || 'DeepSeek-V3',
      timestamp: formatTime(new Date()),
      isStreaming: true
    };

    store.addMessage(sessionId, assistantMsg);
    renderActiveMessages();

    // 2. Cancellation callback
    const cancelCurrentTurn = async () => {
      try {
        assistantMsg.isStreaming = false;
        assistantMsg.wasCancelled = true;
        if (assistantMsg.toolCall && assistantMsg.toolCall.duration === 'running...') {
          assistantMsg.toolCall.duration = 'cancelled';
        }
        emptyChatInput.setGenerating(false);
        activeChatInput.setGenerating(false);
        if (activeFollowHandle) {
          activeFollowHandle.cancel();
          activeFollowHandle = null;
        }
        await cancelSession(sessionId);
        store.saveState();
        renderActiveMessages();
        showToast('Generation cancelled', 'info');
      } catch (err) {
        console.warn('cancel turn failed:', err);
      }
    };

    emptyChatInput.setGenerating(true, cancelCurrentTurn);
    activeChatInput.setGenerating(true, cancelCurrentTurn);

    // 3. Follow session live stream
    if (activeFollowHandle) {
      activeFollowHandle.cancel();
      activeFollowHandle = null;
    }

    let renderScheduled = false;
    const scheduleRender = () => {
      if (!renderScheduled) {
        renderScheduled = true;
        requestAnimationFrame(() => {
          renderScheduled = false;
          renderActiveMessages();
        });
      }
    };

    activeFollowHandle = streamMux.followSession(sessionId, {
      onTextDelta: (delta) => {
        assistantMsg.text += delta;
        scheduleRender();
      },
      onReasoningDelta: (delta) => {
        assistantMsg.thinking += delta;
        scheduleRender();
      },
      onToolCall: (data) => {
        const toolName = data?.toolName || 'bash';
        const command = data?.args?.command || data?.args?.cmd || JSON.stringify(data?.args || {});
        let userQuestionData = null;

        if (toolName === 'ask_user_question' || toolName.includes('question')) {
          try {
            const rawArgs = typeof data?.args === 'string' ? JSON.parse(data.args) : data?.args;
            const qList = rawArgs?.questions || rawArgs?.items;
            if (Array.isArray(qList) && qList.length > 0) {
              const firstQ = qList[0];
              userQuestionData = {
                callId: data.callId || `q-${Date.now()}`,
                questionId: firstQ.id || 'today_pick',
                question: firstQ.question || 'Please select an option to continue:',
                header: firstQ.header,
                options: firstQ.options || [],
                onAnswer: async (chosenOption) => {
                  try {
                    await callRpc('userQuestions', 'answer', {
                      callId: data.callId,
                      answer: { answers: [{ id: firstQ.id || 'today_pick', value: chosenOption }] }
                    });
                  } catch (e) {
                    console.warn('answer question failed, submitting as prompt:', e);
                    handleUserPrompt(chosenOption);
                  }
                }
              };
            }
          } catch (e) {
            console.warn('Could not parse ask_user_question args:', e);
          }
        }

        if (userQuestionData) {
          assistantMsg.userQuestion = userQuestionData;
        } else {
          assistantMsg.toolCall = {
            toolName,
            command,
            output: '',
            duration: 'running...'
          };
        }
        scheduleRender();
      },
      onToolResult: (data) => {
        if (assistantMsg.toolCall) {
          assistantMsg.toolCall.output = data?.output || data?.stdout || data?.error || '';
          assistantMsg.toolCall.duration = data?.durationMs ? `${(data.durationMs / 1000).toFixed(1)}s` : '0.4s';
          assistantMsg.toolCall.isError = !!data?.error;
        }
        scheduleRender();
      },
      onApprovalAsked: (data) => {
        assistantMsg.approvalRequest = {
          id: data.id,
          toolName: data.toolName,
          reason: data.reason,
          command: data.command || data.args?.command,
          status: 'pending',
          onAllow: async () => {
            await callRpc('approval', 'decide', { requestId: data.id, outcome: 'allowed-once' });
          },
          onDeny: async () => {
            await callRpc('approval', 'decide', { requestId: data.id, outcome: 'rejected' });
          }
        };
        scheduleRender();
      },
      onQuestionAsked: (data) => {
        assistantMsg.userQuestion = {
          callId: data.callId,
          questionId: data.questionId || (data.questions && data.questions[0]?.id) || 'today_pick',
          question: data.question || (data.questions && data.questions[0]?.question) || 'Please select an option:',
          header: data.header || (data.questions && data.questions[0]?.header),
          options: data.options || (data.questions && data.questions[0]?.options) || [],
          onAnswer: async (chosenOption) => {
            try {
              await callRpc('userQuestions', 'answer', {
                callId: data.callId,
                answer: { answers: [{ id: data.questionId || (data.questions && data.questions[0]?.id) || 'today_pick', value: chosenOption }] }
              });
            } catch (err) {
              console.warn('userQuestions/answer failed:', err);
              handleUserPrompt(chosenOption);
            }
          }
        };
        scheduleRender();
      },
      onTurnEnd: () => {
        assistantMsg.isStreaming = false;
        if (assistantMsg.toolCall && assistantMsg.toolCall.duration === 'running...') {
          assistantMsg.toolCall.duration = '0.4s';
        }
        emptyChatInput.setGenerating(false);
        activeChatInput.setGenerating(false);
        store.saveState();
        renderActiveMessages();
      },
      onError: (err) => {
        assistantMsg.isStreaming = false;
        assistantMsg.error = {
          message: err.message || 'Stream error occurred',
          code: err.code || 'STREAM_ERROR',
          retry: () => executeRealPrompt(sessionId, text)
        };
        emptyChatInput.setGenerating(false);
        activeChatInput.setGenerating(false);
        store.saveState();
        showToast(err.message || 'Stream error occurred', 'error');
        renderActiveMessages();
      }
    });

    // 4. Ensure model is explicitly selected for this session if configured
    const selectedModel = store.getState().selectedModel;
    const selectedProvider = store.getState().selectedModelProvider;
    if (selectedModel && selectedProvider) {
      try {
        await callRpc('session', 'selectModel', {
          request: {
            sessionId,
            provider: selectedProvider,
            model: selectedModel
          }
        });
      } catch (err) {
        console.warn('session/selectModel before prompt notice:', err);
      }
    }

    // 5. Send prompt RPC to daemon
    try {
      await callRpc('session', 'prompt', {
        request: {
          requestId: crypto.randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text }],
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
    } catch (err) {
      console.error('session/prompt RPC failed:', err);
      assistantMsg.isStreaming = false;
      assistantMsg.error = {
        message: err.message || 'Failed to send message to daemon',
        code: err.code || 'PROMPT_FAILED',
        retry: () => executeRealPrompt(sessionId, text)
      };
      emptyChatInput.setGenerating(false);
      activeChatInput.setGenerating(false);
      showToast(err.message || 'Failed to send message', 'error');
      renderActiveMessages();
    }
  }

  function simulateAssistantReply(chatId, queryText) {
    const lower = (queryText || '').toLowerCase();
    let sample = mockConversations.default[1];

    if (lower.includes('inspect') || lower.includes('deps') || lower.includes('tree')) {
      sample = mockConversations.repoInspection;
    } else if (lower.includes('test') || lower.includes('suite') || lower.includes('run')) {
      sample = mockConversations.testSuite;
    } else if (lower.includes('sidecar') || lower.includes('diagnostic') || lower.includes('rpc') || lower.includes('port')) {
      sample = mockConversations.sidecarDiagnostics;
    }

    setTimeout(() => {
      const assistantMsg = {
        ...sample,
        id: `msg-reply-${Date.now()}`,
        timestamp: formatTime(new Date())
      };

      store.addMessage(chatId, assistantMsg);
      renderActiveMessages();
    }, 450);
  }

  // Store subscriptions
  store.subscribe('chat:active', () => {
    refreshViewState();
  });

  store.subscribe('chats:change', () => {
    refreshViewState();
  });

  store.subscribe('user:change', () => {
    updateHeroGreeting();
  });

  // Initial render
  refreshViewState();

  return container;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
