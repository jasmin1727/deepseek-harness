/**
 * Workspaces Management API Bridge
 * Connects UI workspace picker and registry to daemon's workspace controller.
 */

import { callRpc } from './rpc.js';

const STORAGE_KEY = 'dsh_user_workspaces';

function getStoredWorkspaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeWorkspace(ws) {
  try {
    const list = getStoredWorkspaces();
    const existingIdx = list.findIndex(w => w.path === ws.path || w.id === ws.id);
    if (existingIdx >= 0) {
      list[existingIdx] = ws;
    } else {
      list.push(ws);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to persist workspace:', err);
  }
}

export async function listWorkspaces() {
  const workspaces = [];

  // 1. Default workspace initialized from daemon
  try {
    const def = await callRpc('workspace', 'initializeDefault', {});
    if (def && def.workspace) {
      const ws = def.workspace;
      workspaces.push({
        id: ws.workspaceId,
        name: ws.title || ws.path.split('/').filter(Boolean).pop() || 'default-workspace',
        path: ws.path,
        sessionIds: ws.sessionIds || []
      });
    }
  } catch (err) {
    console.warn('Workspace: initializeDefault warning:', err);
  }

  if (workspaces.length === 0) {
    workspaces.push({
      id: 'default',
      name: 'default-workspace',
      path: '~',
      sessionIds: []
    });
  }

  // 2. Append stored user-added workspaces
  const stored = getStoredWorkspaces();
  for (const item of stored) {
    if (!workspaces.some(w => w.path === item.path)) {
      workspaces.push(item);
    }
  }

  return workspaces;
}

export async function createWorkspace(directoryPath) {
  let wsResult = null;
  try {
    const result = await callRpc('workspace', 'create', { request: { path: directoryPath } });
    wsResult = result?.workspace;
  } catch (err) {
    console.warn('workspace.create RPC error, using local registration:', err);
  }

  const baseName = directoryPath.split('/').filter(Boolean).pop() || directoryPath;
  const ws = {
    id: wsResult?.workspaceId || `ws-${Date.now()}`,
    name: wsResult?.title || baseName,
    path: wsResult?.path || directoryPath,
    sessionIds: wsResult?.sessionIds || []
  };

  storeWorkspace(ws);
  return ws;
}

export async function pickAndCreateWorkspace() {
  if (window.__TAURI__ && window.__TAURI__.core) {
    const selectedDir = await window.__TAURI__.core.invoke('cmd_pick_directory');
    if (selectedDir) {
      return createWorkspace(selectedDir);
    }
  }
  return null;
}

export async function renameWorkspace(workspaceId, title) {
  const stored = getStoredWorkspaces();
  const target = stored.find(w => w.id === workspaceId);
  if (target) {
    target.name = title;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }
  return callRpc('workspace', 'rename', { workspaceId, title }).catch(() => {});
}

export async function deleteWorkspace(workspaceId) {
  const stored = getStoredWorkspaces().filter(w => w.id !== workspaceId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return callRpc('workspace', 'delete', { workspaceId }).catch(() => {});
}
