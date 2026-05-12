export class WebSocketClient {
  constructor(onMessage) {
    this._onMessage = onMessage;
    this._ws = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxDelay = 30000;
    this._shouldReconnect = true;
  }

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._shouldReconnect = true;

    try {
      this._ws = new WebSocket('ws://localhost:3210/ws');
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this._scheduleReconnect();
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
      if (this._onMessage) {
        this._onMessage({ type: 'ws_disconnected', data: null });
      }
      if (this._shouldReconnect) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
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
  }

  isConnected() {
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }
    console.log(`[WS] Reconnecting in ${this._reconnectDelay}ms...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxDelay);
  }
}
