/**
 * Typert RPC Bridge for DeepSeek Harness API Gateway
 * Communicates with POST /api/<namespace>/<method>
 */

import { apiClient } from './client.js';

export class RpcError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Invoke a remote Typert method over HTTP.
 * @param {string} namespace - e.g. 'account', 'workspace', 'agent', 'session'
 * @param {string} method - e.g. 'getState', 'list', 'prompt'
 * @param {object} payload - method arguments
 * @returns {Promise<any>}
 */
export async function callRpc(namespace, method, payload = {}) {
  // Typert Gateway requires payload to be exactly { args: { ... } }
  const formattedPayload = (payload && typeof payload === 'object' && Object.keys(payload).length === 1 && Object.hasOwn(payload, 'args'))
    ? payload
    : { args: payload };

  // Prefer Tauri native loopback bridge (safe from browser CORS and host origin fences)
  if (window.__TAURI__ && window.__TAURI__.core) {
    try {
      return await window.__TAURI__.core.invoke('cmd_call_rpc', {
        namespace,
        method,
        payload: formattedPayload
      });
    } catch (err) {
      const msg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
      throw new RpcError(msg, 'RPC_ERROR', err);
    }
  }

  const rpcId = crypto.randomUUID();
  const fullMethod = `${namespace}/${method}`;

  const body = {
    type: 'client-request',
    rpcId,
    method: fullMethod,
    payload: formattedPayload
  };

  const res = await apiClient.authenticatedFetch(`/api/${namespace}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new RpcError(`HTTP ${res.status} ${res.statusText}: ${text}`, res.status, text);
  }

  const responseJson = await res.json();

  if (responseJson && responseJson.result) {
    if (responseJson.result.ok === true) {
      return responseJson.result.value;
    } else {
      const err = responseJson.result.error || 'Unknown RPC failure';
      const msg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
      throw new RpcError(msg, responseJson.result.code || 'RPC_ERROR', err);
    }
  }

  return responseJson;
}
