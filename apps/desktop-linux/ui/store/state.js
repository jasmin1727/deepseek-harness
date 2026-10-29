/**
 * DeepSeek Harness — Reactive Global Store
 * Centralized state with localStorage persistence and pub/sub events.
 */

import { mockChats } from '../mocks/chats.js';
import { mockSkills } from '../mocks/skills.js';
import { mockConnectors } from '../mocks/connectors.js';
import { mockPlugins } from '../mocks/plugins.js';
import { mockApiKeys } from '../mocks/apiKeys.js';
import { mockMemories } from '../mocks/memories.js';
import { mockConversations } from '../mocks/conversationSamples.js';

export const USE_MOCKS = false;

const STORAGE_KEY = 'dsh_app_state_v1';

const defaultState = {
  user: {
    name: 'Jasmin',
    email: 'jasmin@deepseek.com',
    plan: 'Pro', // 'Free' | 'Pro' | 'API' | 'Guest'
    avatarInitial: 'J'
  },
  auth: {
    isAuthenticated: false,
    mode: 'none' // 'google' | 'email' | 'guest' | 'apikey'
  },
  sidebar: {
    isOpen: true,
    searchQuery: ''
  },
  activeChatId: null, // null = empty welcome state
  activeWorkspaceId: null, // active backend workspace id
  selectedModel: 'v3', // 'v3' | 'r1'
  thinkEnabled: false,
  sandboxEnabled: true,
  chats: USE_MOCKS ? mockChats : [],
  messages: USE_MOCKS ? { 'chat-today-1': mockConversations.default } : {},
  settings: {
    general: {
      theme: 'dark', // 'dark' | 'light' | 'system'
      interfaceFont: 'Inter',
      responseFont: 'Sans',
      textSize: 'medium', // 'small' | 'medium' | 'large'
      transcriptWidth: 'standard', // 'compact' | 'standard' | 'wide' | 'full'
      motion: 'system', // 'system' | 'reduced' | 'full'
      language: 'en-US',
      notifications: {
        taskAlerts: true,
        soundCues: false,
        errorToasts: true
      }
    },
    account: {
      name: 'Jasmin',
      email: 'jasmin@deepseek.com',
      plan: 'Pro'
    },
    privacy: {
      telemetry: true,
      diagnostics: true,
      retainLogs: true
    },
    capabilities: {
      codeExecution: true,
      fsAccess: true,
      webSearch: true,
      artifacts: true,
      maxSubagents: 4
    },
    memory: {
      enabled: true,
      items: mockMemories
    },
    models: {
      defaultModel: 'v3',
      temperature: 0.6,
      maxTokens: 4096,
      contextLimit: '128k',
      systemPrompt: 'You are DeepSeek Harness, an autonomous agent runtime built for deterministic Linux engineering workflows.'
    },
    runtime: {
      daemonState: 'Standby',
      sidecarPort: 3000,
      executionTarget: 'Linux Localhost',
      workingDir: '.',
      permissions: {
        read: true,
        write: true,
        network: true,
        shell: true
      }
    },
    skills: mockSkills,
    connectors: mockConnectors,
    plugins: mockPlugins,
    apiKeys: []
  }
};

class Store {
  constructor() {
    this.listeners = new Map();
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Filter out legacy mock keys so only real user keys exist
          const filteredKeys = (parsed.settings?.apiKeys || []).filter(
            k => k.id && !['key-1', 'key-2', 'key-3'].includes(k.id) && !k.name?.includes('CLI Daemon Production')
          );

          // Merge with default to preserve new schema fields
          return {
            ...defaultState,
            ...parsed,
            user: { ...defaultState.user, ...parsed.user },
            settings: {
              ...defaultState.settings,
              ...parsed.settings,
              general: { ...defaultState.settings.general, ...(parsed.settings?.general || {}) },
              capabilities: { ...defaultState.settings.capabilities, ...(parsed.settings?.capabilities || {}) },
              runtime: { ...defaultState.settings.runtime, ...(parsed.settings?.runtime || {}) },
              apiKeys: filteredKeys
            }
          };
        }
      }
    } catch (e) {
      console.warn('Could not load state from localStorage:', e);
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  saveState() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('Could not save state to localStorage:', e);
    }
  }

  getState() {
    return this.state;
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((cb) => cb({ event, data }));
    }
  }

  // ── Auth Actions ──────────────────────────────────────────────────────────
  login(mode, customName, customEmail) {
    let name = customName || 'Jasmin';
    let email = customEmail || 'jasmin@deepseek.com';
    let plan = 'Pro';

    if (mode === 'guest') {
      name = 'Guest';
      email = 'guest@localhost';
      plan = 'Free';
    } else if (mode === 'apikey') {
      name = 'Jasmin';
      email = 'developer@deepseek.com';
      plan = 'API';
    } else if (mode === 'google' || mode === 'email') {
      plan = 'Pro';
    }

    this.state.auth.isAuthenticated = true;
    this.state.auth.mode = mode;
    this.state.user = {
      name,
      email,
      plan,
      avatarInitial: name.charAt(0).toUpperCase()
    };
    this.state.settings.account = {
      ...this.state.settings.account,
      name,
      email,
      plan
    };

    this.saveState();
    this.emit('auth:change', this.state.auth);
    this.emit('user:change', this.state.user);
  }

  logout() {
    this.state.auth.isAuthenticated = false;
    this.state.auth.mode = 'none';
    this.state.activeChatId = null;
    this.saveState();
    this.emit('auth:change', this.state.auth);
  }

  // ── Sidebar Actions ───────────────────────────────────────────────────────
  toggleSidebar() {
    this.state.sidebar.isOpen = !this.state.sidebar.isOpen;
    this.saveState();
    this.emit('sidebar:toggle', this.state.sidebar.isOpen);
  }

  setSidebarSearch(query) {
    this.state.sidebar.searchQuery = query;
    this.emit('sidebar:search', query);
  }

  // ── Chat Actions ──────────────────────────────────────────────────────────
  createChat(initialPrompt = '') {
    const id = `chat-${Date.now()}`;
    const newChat = {
      id,
      title: initialPrompt ? (initialPrompt.length > 40 ? initialPrompt.slice(0, 40) + '...' : initialPrompt) : 'New Conversation',
      group: 'Today',
      model: this.state.selectedModel,
      pinned: false,
      updatedAt: 'Just now',
      messagesCount: initialPrompt ? 1 : 0
    };

    this.state.chats.unshift(newChat);
    this.state.activeChatId = id;
    this.state.messages[id] = [];

    this.saveState();
    this.emit('chats:change', this.state.chats);
    this.emit('chat:active', id);
    return id;
  }

  setChats(chats) {
    this.state.chats = Array.isArray(chats) ? chats : [];
    this.saveState();
    this.emit('chats:change', this.state.chats);
  }

  setSessionMessages(chatId, messages) {
    this.state.messages[chatId] = Array.isArray(messages) ? messages : [];
    this.saveState();
    this.emit('messages:change', { chatId, messages: this.state.messages[chatId] });
  }

  selectChat(chatId) {
    this.state.activeChatId = chatId;
    this.saveState();
    this.emit('chat:active', chatId);
  }

  setActiveChat(chatId) {
    return this.selectChat(chatId);
  }

  clearActiveChat() {
    this.state.activeChatId = null;
    this.saveState();
    this.emit('chat:active', null);
  }

  setActiveWorkspace(workspaceId) {
    this.state.activeWorkspaceId = workspaceId;
    this.saveState();
    this.emit('workspace:change', workspaceId);
  }

  updateChatTitle(chatId, newTitle) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (chat && newTitle?.trim()) {
      chat.title = newTitle.trim();
      this.saveState();
      this.emit('chats:change', this.state.chats);
    }
  }

  togglePinChat(chatId) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.pinned = !chat.pinned;
      this.saveState();
      this.emit('chats:change', this.state.chats);
    }
  }

  deleteChat(chatId) {
    this.state.chats = this.state.chats.filter((c) => c.id !== chatId);
    delete this.state.messages[chatId];
    if (this.state.activeChatId === chatId) {
      this.state.activeChatId = null;
    }
    this.saveState();
    this.emit('chats:change', this.state.chats);
    this.emit('chat:active', this.state.activeChatId);
  }

  clearAllChats() {
    this.state.chats = [];
    this.state.messages = {};
    this.state.activeChatId = null;
    this.saveState();
    this.emit('chats:change', this.state.chats);
    this.emit('chat:active', null);
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  getMessages(chatId) {
    return this.state.messages[chatId] || [];
  }

  addMessage(chatId, message) {
    if (!this.state.messages[chatId]) {
      this.state.messages[chatId] = [];
    }
    const existingIdx = this.state.messages[chatId].findIndex((m) => m.id === message.id);
    if (existingIdx >= 0) {
      this.state.messages[chatId][existingIdx] = message;
    } else {
      this.state.messages[chatId].push(message);
    }

    const chat = this.state.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.messagesCount = this.state.messages[chatId].length;
      chat.updatedAt = 'Just now';
    }

    this.saveState();
    this.emit('messages:change', { chatId, messages: this.state.messages[chatId] });
  }

  // ── Model & Option Toggles ────────────────────────────────────────────────
  setSelectedModel(modelId, provider) {
    this.state.selectedModel = modelId;
    if (provider) {
      this.state.selectedModelProvider = provider;
    }
    this.saveState();
    this.emit('model:change', modelId);
  }

  toggleThink() {
    this.state.thinkEnabled = !this.state.thinkEnabled;
    this.saveState();
    this.emit('think:change', this.state.thinkEnabled);
  }

  toggleSandbox() {
    this.state.sandboxEnabled = !this.state.sandboxEnabled;
    this.saveState();
    this.emit('sandbox:change', this.state.sandboxEnabled);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  updateSetting(category, key, value) {
    if (this.state.settings[category]) {
      this.state.settings[category][key] = value;
      this.saveState();
      this.emit('settings:change', { category, key, value });

      if (category === 'general') {
        this.applyLiveGeneralSetting(key, value);
      }
    }
  }

  applyLiveGeneralSetting(key, value) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;
    if (key === 'theme') {
      root.setAttribute('data-theme', value);
    } else if (key === 'textSize') {
      root.setAttribute('data-text-size', value);
    } else if (key === 'transcriptWidth') {
      root.setAttribute('data-transcript-width', value);
    } else if (key === 'motion') {
      root.setAttribute('data-motion', value);
    } else if (key === 'interfaceFont') {
      root.style.setProperty('--font-sans', value === 'JetBrains Mono' ? 'JetBrains Mono, monospace' : `-apple-system, BlinkMacSystemFont, "${value}", system-ui, sans-serif`);
    }
  }

  // Helper CRUD for arrays in settings
  addApiKey(keyObj) {
    this.state.settings.apiKeys.unshift(keyObj);
    this.saveState();
    this.emit('settings:change', { category: 'apiKeys', data: this.state.settings.apiKeys });
  }

  revokeApiKey(id) {
    this.state.settings.apiKeys = this.state.settings.apiKeys.filter((k) => k.id !== id);
    this.saveState();
    this.emit('settings:change', { category: 'apiKeys', data: this.state.settings.apiKeys });
  }

  addMemory(memObj) {
    this.state.settings.memory.items.unshift(memObj);
    this.saveState();
    this.emit('settings:change', { category: 'memory', data: this.state.settings.memory.items });
  }

  deleteMemory(id) {
    this.state.settings.memory.items = this.state.settings.memory.items.filter((m) => m.id !== id);
    this.saveState();
    this.emit('settings:change', { category: 'memory', data: this.state.settings.memory.items });
  }

  clearAllMemories() {
    this.state.settings.memory.items = [];
    this.saveState();
    this.emit('settings:change', { category: 'memory', data: [] });
  }

  toggleConnector(id) {
    const connector = this.state.settings.connectors.find((c) => c.id === id);
    if (connector) {
      connector.status = connector.status === 'connected' ? 'disconnected' : 'connected';
      this.saveState();
      this.emit('settings:change', { category: 'connectors', data: this.state.settings.connectors });
    }
  }

  toggleSkill(id) {
    const skill = this.state.settings.skills.find((s) => s.id === id);
    if (skill) {
      skill.enabled = !skill.enabled;
      this.saveState();
      this.emit('settings:change', { category: 'skills', data: this.state.settings.skills });
    }
  }
}

export const store = new Store();
