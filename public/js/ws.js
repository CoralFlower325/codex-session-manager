export class WebSocketClient {
  constructor(onMessage) {
    this._onMessage = onMessage;
    this._ws = null;
    this._evtSource = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxDelay = 30000;
    this._shouldReconnect = true;
    this._useSSE = false;
  }

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this._evtSource && this._evtSource.readyState === EventSource.OPEN) {
      return;
    }

    this._shouldReconnect = true;

    // Try WebSocket first
    try {
      this._ws = new WebSocket('ws://localhost:3210/ws');
    } catch (err) {
      console.error('[WS] Failed to create WebSocket, falling back to SSE');
      this._connectSSE();
      return;
    }

    this._ws.onopen = () => {
      console.log('[WS] Connected');
      this._reconnectDelay = 1000;
      if (this._onMessage) {
        this._onMessage({ type: 'ws_connected', data: null });
      }
    };

    this._ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (this._onMessage) {
          this._onMessage(payload);
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    this._ws.onclose = (event) => {
      console.log('[WS] Disconnected', event.code, event.reason);
      // If WS fails quickly (e.g. blocked by browser), fall back to SSE
      if (!this._useSSE && this._shouldReconnect) {
        console.log('[WS] Falling back to SSE');
        this._useSSE = true;
        this._connectSSE();
      } else if (this._onMessage) {
        this._onMessage({ type: 'ws_disconnected', data: null });
      }
      if (!this._useSSE && this._shouldReconnect) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      // WebSocket error often means it's blocked; fall back to SSE
      if (!this._useSSE) {
        this._useSSE = true;
        this._connectSSE();
      }
    };
  }

  _connectSSE() {
    try {
      this._evtSource = new EventSource('http://localhost:3210/api/events');

      this._evtSource.addEventListener('connected', () => {
        console.log('[SSE] Connected');
        this._reconnectDelay = 1000;
        if (this._onMessage) {
          this._onMessage({ type: 'ws_connected', data: null });
        }
      });

      this._evtSource.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (this._onMessage) {
            this._onMessage(payload);
          }
        } catch (err) {
          console.error('[SSE] Failed to parse message:', err);
        }
      });

      this._evtSource.onerror = () => {
        console.error('[SSE] Connection error, trying polling');
        this._pollingActive = true;
        this._connectPolling();
      };
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      if (this._shouldReconnect) {
        this._scheduleReconnect();
      }
    }
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    if (this._evtSource) {
      this._evtSource.close();
      this._evtSource = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this._pollingActive = false;
  }

  isConnected() {
    if (this._useSSE) {
      return this._evtSource !== null && this._evtSource.readyState === EventSource.OPEN;
    }
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }


  _connectPolling() {
    console.log('[Poll] Starting polling fallback');
    this._pollingActive = true;
    this._pollTimestamp = 0;
    if (this._onMessage) {
      this._onMessage({ type: 'ws_connected', data: null });
    }
    this._pollInterval = setInterval(async () => {
      if (!this._pollingActive) return;
      try {
        const res = await fetch('http://localhost:3210/api/poll?since=' + this._pollTimestamp);
        const data = await res.json();
        if (data.changed) {
          this._pollTimestamp = data.timestamp;
          // Refetch sessions to get latest data
          if (this._onMessage) {
            this._onMessage({ type: 'session_updated', data: { _pollRefresh: true } });
          }
        }
      } catch (err) {
        console.error('[Poll] Error:', err);
      }
    }, 3000);
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }
    console.log(`[${this._useSSE ? 'SSE' : 'WS'}] Reconnecting in ${this._reconnectDelay}ms...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxDelay);
  }
}
