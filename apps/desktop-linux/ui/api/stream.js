/**
 * Multiplexed WebSocket Carrier for DeepSeek Harness Remote Streams
 * Connects to /api/remote.mux and delivers live event frames, assistant text deltas, and tool updates.
 */

import { apiClient } from './client.js';

class StreamMuxClient {
  constructor() {
    this.ws = null;
    this.streams = new Map(); // streamId -> { onItem, onError, onEnd }
    this.pendingOpens = [];
    this.connected = false;
    this.reconnectTimer = null;
  }

  ensureConnected() {
    if (this.connected) return;

    // Use Tauri native WebSocket bridge if in desktop shell
    if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.core) {
      this.connected = true;
      window.__TAURI__.event.listen('dsh://ws-message', (event) => {
        try {
          const raw = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
          const msg = JSON.parse(raw);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('StreamMux: failed to parse incoming Tauri WS message:', e);
        }
      });

      window.__TAURI__.core.invoke('cmd_ws_ensure_connected').catch(e => {
        console.warn('StreamMux: cmd_ws_ensure_connected warning:', e);
      });

      while (this.pendingOpens.length > 0) {
        const msg = this.pendingOpens.shift();
        this.sendWireMessage(msg);
      }
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = apiClient.getWsUrl('/api/remote.mux');
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        // Flush any pending open requests
        while (this.pendingOpens.length > 0) {
          const msg = this.pendingOpens.shift();
          this.sendWireMessage(msg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('StreamMux: failed to parse incoming message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('StreamMux WebSocket error:', err);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        // Auto-reconnect after 2 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.streams.size > 0) {
              this.ensureConnected();
            }
          }, 2000);
        }
      };
    } catch (e) {
      console.error('StreamMux: failed to initiate WebSocket connection:', e);
    }
  }

  sendWireMessage(msg) {
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('cmd_ws_send', { message: JSON.stringify(msg) })
        .catch(err => console.error('StreamMux: cmd_ws_send failed:', err));
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  handleServerMessage(msg) {
    if (!msg || !msg.streamId) return;
    const stream = this.streams.get(msg.streamId);
    if (!stream) return;

    if (msg.type === 'item') {
      if (stream.onItem) stream.onItem(msg.value);
    } else if (msg.type === 'error') {
      if (stream.onError) stream.onError(msg.error);
      this.streams.delete(msg.streamId);
    } else if (msg.type === 'end') {
      if (stream.onEnd) stream.onEnd();
      this.streams.delete(msg.streamId);
    }
  }

  openStream(endpoint, payload, callbacks = {}) {
    const streamId = crypto.randomUUID();
    this.streams.set(streamId, callbacks);

    // Typert Gateway requires payload to be exactly { args: { ... } }
    const formattedPayload = (payload && typeof payload === 'object' && Object.keys(payload).length === 1 && Object.hasOwn(payload, 'args'))
      ? payload
      : { args: payload };

    const openMsg = {
      type: 'open',
      streamId,
      endpoint,
      payload: formattedPayload
    };

    if (window.__TAURI__ && window.__TAURI__.core) {
      this.ensureConnected();
      this.sendWireMessage(openMsg);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWireMessage(openMsg);
    } else {
      this.pendingOpens.push(openMsg);
      this.ensureConnected();
    }

    return {
      streamId,
      cancel: () => {
        this.cancelStream(streamId);
      }
    };
  }

  cancelStream(streamId) {
    if (this.streams.has(streamId)) {
      this.streams.delete(streamId);
      this.sendWireMessage({ type: 'cancel', streamId });
    }
  }

  /**
   * Follow a session's live event and assistant stream.
   * Delivers opening snapshot, live reasoning/text tokens, and tool results.
   */
  followSession(sessionId, { onSnapshot, onTextDelta, onReasoningDelta, onToolCall, onToolResult, onApprovalAsked, onQuestionAsked, onTurnEnd, onError } = {}) {
    return this.openStream('session/follow', {
      request: {
        address: { kind: 'session', sessionId },
        assistantStream: true
      }
    }, {
      onItem: (item) => {
        if (!item) return;

        // 1. Initial snapshot of past history
        if (item.type === 'snapshot') {
          if (onSnapshot) onSnapshot(item);
          return;
        }

        // 2. Process-local assistant presentation stream (streaming reasoning & text deltas)
        if (item.type === 'assistant-stream' && item.frame) {
          const frame = item.frame;
          if (frame.type === 'chunk' && frame.chunk) {
            const ch = frame.chunk;
            if (ch.type === 'text-delta') {
              if (onTextDelta) onTextDelta(ch.text || '');
            } else if (ch.type === 'reasoning-delta') {
              if (onReasoningDelta) onReasoningDelta(ch.text || '');
            } else if (ch.type === 'text-chunks' && Array.isArray(ch.texts)) {
              if (onTextDelta) onTextDelta(ch.texts.join(''));
            } else if (ch.type === 'reasoning-chunks' && Array.isArray(ch.texts)) {
              if (onReasoningDelta) onReasoningDelta(ch.texts.join(''));
            } else if (ch.type === 'finish') {
              if (ch.reason && ch.reason.kind === 'error') {
                const failure = ch.reason.failure || {};
                const err = new Error(failure.message || 'Assistant stream finished with error');
                err.code = failure.code;
                if (onError) onError(err);
              }
            }
          } else if (frame.type === 'text-delta' || frame.delta) {
            if (onTextDelta) onTextDelta(frame.delta || frame.text || '');
          } else if (frame.type === 'reasoning-delta' || frame.reasoning) {
            if (onReasoningDelta) onReasoningDelta(frame.delta || frame.text || frame.reasoning || '');
          }
          return;
        }

        // 3. Durable journal event entries
        const ev = item.event || item;
        if (ev.type === 'reasoning') {
          if (onReasoningDelta) onReasoningDelta(ev.data?.delta || ev.data?.text || '');
        } else if (ev.type === 'agent/assistant') {
          if (onTextDelta) onTextDelta(ev.data?.delta || ev.data?.text || '');
        } else if (ev.type === 'assistant/attempt') {
          const streamArr = ev.data?.stream;
          if (Array.isArray(streamArr)) {
            for (const itemChunk of streamArr) {
              if (itemChunk?.chunk?.type === 'finish' && itemChunk.chunk.reason?.kind === 'error') {
                const failure = itemChunk.chunk.reason.failure || {};
                const err = new Error(failure.message || 'Assistant attempt failed');
                err.code = failure.code;
                if (onError) onError(err);
              }
            }
          }
        } else if (ev.type === 'tool/call') {
          let parsedArgs = ev.data?.arguments;
          if (typeof parsedArgs === 'string') {
            try { parsedArgs = JSON.parse(parsedArgs); } catch {}
          }
          if (onToolCall) onToolCall({ toolName: ev.data?.name || 'bash', args: parsedArgs });
        } else if (ev.type === 'tool/result') {
          if (onToolResult) onToolResult(ev.data);
        } else if (ev.type === 'command/run') {
          if (onToolCall) onToolCall({ toolName: ev.data?.name || 'bash', args: { command: ev.data?.args } });
        } else if (ev.type === 'command/done') {
          if (onToolResult) onToolResult({ output: ev.data?.text, isError: ev.data?.kind === 'error' });
        } else if (ev.type === 'approval/asked') {
          if (onApprovalAsked) onApprovalAsked(ev.data);
        } else if (ev.type === 'question/asked') {
          if (onQuestionAsked) onQuestionAsked(ev.data);
        } else if (ev.type === 'turn/end') {
          if (ev.data?.reason?.kind === 'error') {
            const errObj = ev.data.reason.error || {};
            const err = new Error(errObj.message || 'Turn ended with error');
            err.code = errObj.code;
            if (onError) onError(err);
          } else {
            if (onTurnEnd) onTurnEnd(ev.data);
          }
        }
      },
      onError: (err) => {
        if (onError) onError(err);
      },
      onEnd: () => {
        if (onTurnEnd) onTurnEnd();
      }
    });
  }
}

export const streamMux = new StreamMuxClient();
