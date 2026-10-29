/**
 * Sessions Management & Event Sourcing API Bridge
 * Connects sidebar session list, history replay, and turn control to the daemon.
 */

import { callRpc } from './rpc.js';

function formatTimeAgo(epochMs) {
  if (!epochMs) return 'Just now';
  const deltaSec = Math.floor((Date.now() - epochMs) / 1000);
  if (deltaSec < 60) return 'Just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

function categorizeSession(epochMs) {
  if (!epochMs) return 'today';
  const now = new Date();
  const date = new Date(epochMs);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'previous7';
  if (diffDays <= 30) return 'previous30';
  return 'older';
}

const TITLES_KEY = 'dsh_session_titles';

function getSavedTitles() {
  try {
    const raw = localStorage.getItem(TITLES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSessionTitle(sessionId, title) {
  try {
    const map = getSavedTitles();
    map[sessionId] = title;
    localStorage.setItem(TITLES_KEY, JSON.stringify(map));
  } catch {}
}

export async function listSessions() {
  try {
    const res = await callRpc('session', 'list', { _request: {} });
    if (res && Array.isArray(res.items)) {
      const savedTitles = getSavedTitles();
      // Exclude blank sessions so sidebar stays clean
      const validSessions = res.items.filter(item => !item.blank);
      return validSessions.map((item) => {
        const customTitle = savedTitles[item.sessionId];
        const serverTitle = item.title && item.title !== 'Untitled Session' && item.title !== 'Conversation' ? item.title : item.projections?.title;
        return {
          id: item.sessionId,
          title: customTitle || serverTitle || 'Conversation',
          category: categorizeSession(item.updatedAt || item.lastActivityTime),
          timestamp: formatTimeAgo(item.updatedAt || item.lastActivityTime),
          workspaceId: item.workspaceId,
          isArchived: !!item.archived
        };
      });
    }
  } catch (err) {
    console.warn('Sessions: list failed:', err);
  }
  return [];
}

export async function createSession(workspaceId) {
  const inner = (workspaceId && workspaceId !== 'default') ? { workspaceId } : {};
  const res = await callRpc('session', 'create', { request: inner });
  return {
    id: res.sessionId,
    title: 'New conversation',
    category: 'today',
    timestamp: 'Just now'
  };
}

export async function loadSessionHistory(sessionId) {
  try {
    const res = await callRpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: 10_000_000,
        maxMessages: 300
      }
    });

    if (!res || !Array.isArray(res.records)) {
      return [];
    }

    return foldHistoryRecords(res.records);
  } catch (err) {
    console.warn('Sessions: loadSessionHistory failed:', err);
    return [];
  }
}

/**
 * Folds append-only SessionHistoryRecord events into presentation message models.
 */
export function foldHistoryRecords(records) {
  const messages = [];
  let currentAssistantMsg = null;

  for (const record of records) {
    const ev = record.event || record;
    if (!ev || !ev.type) continue;

    if (ev.type === 'user/message') {
      // Flush active assistant turn if any
      if (currentAssistantMsg) {
        messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }

      const text = ev.data?.text || (Array.isArray(ev.data?.content) ? ev.data.content.map(c => c.text || '').join('') : '') || '';
      messages.push({
        id: `msg-${ev.seq || crypto.randomUUID()}`,
        role: 'user',
        text,
        timestamp: formatTimeAgo(ev.time)
      });
    } else if (ev.type === 'agent/assistant' || ev.type === 'turn/start' || ev.type === 'reasoning' || ev.type === 'tool/call' || ev.type === 'tool/result') {
      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          id: `msg-asst-${ev.seq || crypto.randomUUID()}`,
          role: 'assistant',
          text: '',
          thinking: '',
          toolCall: null,
          model: 'DeepSeek-V3',
          timestamp: formatTimeAgo(ev.time)
        };
      }

      if (ev.type === 'reasoning') {
        const chunk = ev.data?.delta || ev.data?.text || '';
        currentAssistantMsg.thinking += chunk;
      } else if (ev.type === 'agent/assistant') {
        const chunk = ev.data?.text || (Array.isArray(ev.data?.content) ? ev.data.content.map(c => c.text || '').join('') : '') || '';
        currentAssistantMsg.text += chunk;
      } else if (ev.type === 'tool/call') {
        currentAssistantMsg.toolCall = {
          toolName: ev.data?.toolName || 'bash',
          command: ev.data?.args?.command || ev.data?.args?.cmd || JSON.stringify(ev.data?.args || {}),
          output: '',
          duration: 'running...'
        };
      } else if (ev.type === 'tool/result') {
        if (currentAssistantMsg.toolCall) {
          currentAssistantMsg.toolCall.output = ev.data?.output || ev.data?.stdout || ev.data?.error || '';
          currentAssistantMsg.toolCall.duration = ev.data?.durationMs ? `${(ev.data.durationMs / 1000).toFixed(1)}s` : '0.4s';
        }
      }
    } else if (ev.type === 'turn/end') {
      if (currentAssistantMsg) {
        messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
    }
  }

  if (currentAssistantMsg) {
    messages.push(currentAssistantMsg);
  }

  return messages;
}

export async function renameSession(sessionId, title) {
  saveSessionTitle(sessionId, title);
  return callRpc('session', 'rename', { request: { sessionId, title } });
}

export async function cancelSession(sessionId) {
  return callRpc('session', 'cancel', { request: { sessionId } });
}
