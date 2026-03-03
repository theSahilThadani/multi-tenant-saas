import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getTokensFromSession } from '../utils/authSession';

const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
};

const PRESET_ACTIONS = [
  { label: 'Custom', value: '' },
  { label: 'ticket.read', value: 'ticket.read', payload: '{"ticket_id":"123"}' },
  { label: 'ticket.list', value: 'ticket.list', payload: '{"page":1,"limit":10}' },
  { label: 'ticket.create', value: 'ticket.create', payload: '{"subject":"New ticket","description":"Details here"}' },
  { label: 'ticket.update', value: 'ticket.update', payload: '{"ticket_id":"123","status":"resolved"}' },
  { label: 'user.info', value: 'user.info', payload: '{"user_id":"abc"}' },
  { label: 'ping', value: 'ping', payload: '{}' },
];

function generateRequestId() {
  return crypto.randomUUID();
}

function formatTimestamp(date) {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function getMessageType(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type === 'event') return 'event';
    if (parsed.type === 'response') return 'response';
    if (parsed.type === 'error') return 'error';
    if (parsed.message === 'Connected' || parsed.message === 'Disconnected') return 'status';
    if (parsed.requestId || parsed.request_id) return 'response';
    return 'event';
  } catch {
    return 'event';
  }
}

function extractMessageMeta(msg) {
  if (msg.direction === 'sent') {
    try {
      const parsed = JSON.parse(msg.raw);
      return {
        action: parsed.action || null,
        requestId: parsed.request_id || null,
      };
    } catch {
      return { action: null, requestId: null };
    }
  }

  try {
    const parsed = JSON.parse(msg.raw);
    return {
      action: parsed.action || null,
      requestId: parsed.request_id || parsed.requestId || null,
    };
  } catch {
    return { action: null, requestId: null };
  }
}

export default function WebSocketConsolePage() {
  const [wsUrl, setWsUrl] = useState('ws://alb-demo-nextgen-533659118.us-east-2.elb.amazonaws.com:8080/ws');
  const [authToken, setAuthToken] = useState(() => getTokensFromSession().idToken);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [authState, setAuthState] = useState('none'); // none | sending | authenticated | failed
  const [messages, setMessages] = useState([]);
  const [action, setAction] = useState('');
  const [requestId, setRequestId] = useState(generateRequestId());
  const [payload, setPayload] = useState('{}');
  const [presetIndex, setPresetIndex] = useState(0);

  const socketRef = useRef(null);
  const messageLogRef = useRef(null);

  useEffect(() => {
    const log = messageLogRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, { ...msg, id: Date.now() + Math.random(), timestamp: new Date() }]);
  }, []);

  const handleConnect = useCallback(() => {
    if (!wsUrl.trim()) return;
    if (socketRef.current) {
      socketRef.current.close();
    }

    setConnectionState(CONNECTION_STATES.CONNECTING);

    const ws = new WebSocket(wsUrl.trim());

    ws.onopen = () => {
      setConnectionState(CONNECTION_STATES.CONNECTED);
      addMessage({
        direction: 'received',
        type: 'status',
        raw: JSON.stringify({ message: 'Connected' }),
        label: 'ws.connected',
      });

      // Auto-send authentication with sessionStorage idToken on connect
      const token = (getTokensFromSession().idToken || '').trim();
      setAuthToken(token);
      if (token) {
        setAuthState('sending');
        const authMsg = JSON.stringify({ action: 'authentication', token });
        ws.send(authMsg);
        addMessage({
          direction: 'sent',
          type: 'request',
          raw: authMsg,
          label: 'authentication',
        });
      } else {
        setAuthState('failed');
        addMessage({
          direction: 'received',
          type: 'error',
          raw: JSON.stringify({ message: 'No idToken found in sessionStorage' }),
          label: 'authentication',
        });
      }
    };

    ws.onmessage = (event) => {
      const type = getMessageType(event.data);

      // Detect auth response
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.action === 'authenticated' || parsed.authenticated === true) {
          setAuthState('authenticated');
        } else if (parsed.action === 'auth_failed' || parsed.error === 'Unauthorized') {
          setAuthState('failed');
        }
      } catch {
        // not JSON — ignore
      }

      addMessage({
        direction: 'received',
        type,
        raw: event.data,
        label: null,
      });
    };

    ws.onerror = () => {
      addMessage({
        direction: 'received',
        type: 'error',
        raw: JSON.stringify({ message: 'Connection error' }),
        label: 'ws.error',
      });
    };

    ws.onclose = (event) => {
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
      addMessage({
        direction: 'received',
        type: 'status',
        raw: JSON.stringify({ message: 'Disconnected', code: event.code, reason: event.reason || 'N/A' }),
        label: 'ws.disconnected',
      });
    };

    socketRef.current = ws;
  }, [wsUrl, addMessage]);

  const handleDisconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  const handleSend = useCallback(() => {
    const message = (payload || "").trim() || JSON.stringify({
      action,
      request_id: requestId,
    });

    try {
      if (!socketRef.current) {
        throw new Error("WebSocket is not connected");
      }
      socketRef.current.send(message);
      addMessage({
        direction: 'sent',
        type: 'request',
        raw: message,
        label: action || 'custom',
      });
      setRequestId(generateRequestId());
    } catch (err) {
      addMessage({
        direction: 'received',
        type: 'error',
        raw: JSON.stringify({ message: `Send failed: ${err.message}` }),
        label: 'send.error',
      });
    }
  }, [action, requestId, payload, addMessage]);

  const handlePresetChange = (e) => {
    const idx = Number(e.target.value);
    setPresetIndex(idx);
    const preset = PRESET_ACTIONS[idx];
    if (preset.value) {
      setAction(preset.value);
      setPayload(preset.payload || '{}');
    }
  };

  const isConnected = connectionState === CONNECTION_STATES.CONNECTED;
  const isConnecting = connectionState === CONNECTION_STATES.CONNECTING;

  return (
    <div className="ws-console-wrapper">
      {/* Top Bar */}
      <div className="ws-console-topbar">
        <div className="ws-console-topbar-left">
          <div className="ws-console-topbar-icon">WS</div>
          <span className="ws-console-topbar-title">WebSocket Console</span>
        </div>
        <div className="ws-console-topbar-right">
          <span className={`ws-status-badge ws-status-${connectionState}`}>
            {connectionState === CONNECTION_STATES.CONNECTED
              ? 'Connected'
              : connectionState === CONNECTION_STATES.CONNECTING
                ? 'Connecting...'
                : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Connection Panel */}
      <div className="ws-connection-panel">
        <div className="ws-connection-header">
          <h2>WebSocket Console</h2>
          <p>Realtime interaction with API Gateway WS routes</p>
        </div>
        <div className="ws-connection-controls">
          <span className={`ws-status-dot ws-status-dot-${connectionState}`} />
          <input
            className="form-input ws-url-input"
            type="text"
            placeholder="ws://your-alb.region.elb.amazonaws.com:8080/ws"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isConnected && handleConnect()}
            disabled={isConnected}
          />
          <button
            className="btn ws-btn ws-btn-connect"
            onClick={handleConnect}
            disabled={isConnected || isConnecting || !wsUrl.trim()}
          >
            Connect
          </button>
          <button
            className="btn ws-btn ws-btn-disconnect"
            onClick={handleDisconnect}
            disabled={!isConnected}
          >
            Disconnect
          </button>
          <button
            className="btn ws-btn ws-btn-clear"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        {/* Auth Token */}
        {/* <div className="ws-auth-row">
          <div className="ws-auth-input-wrap">
            <label className="form-label" htmlFor="ws-auth-token">Session idToken</label>
            <input
              id="ws-auth-token"
              className="form-input ws-token-input"
              type="password"
              placeholder="Loaded from sessionStorage.idToken and sent on connect"
              value={authToken}
              readOnly
            />
          </div>
          {authState !== 'none' && (
            <span className={`ws-auth-badge ws-auth-${authState}`}>
              {authState === 'sending' && 'Authenticating...'}
              {authState === 'authenticated' && 'Authenticated'}
              {authState === 'failed' && 'Auth Failed'}
            </span>
          )}
        </div> */}
      </div>

      {/* Main Content */}
      <div className="ws-main">
        {/* Left: Action Builder */}
        <div className="ws-action-builder">
          <div className="ws-panel-card">
            <h3 className="ws-panel-title">Action Builder</h3>

            {/* <div className="form-group">
              <label className="form-label">Preset actions</label>
              <select
                className="form-select"
                value={presetIndex}
                onChange={handlePresetChange}
              >
                {PRESET_ACTIONS.map((preset, idx) => (
                  <option key={preset.label} value={idx}>{preset.label}</option>
                ))}
              </select>
            </div> */}

            {/* <div className="form-group">
              <label className="form-label">Action</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. ticket.read"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div> */}

            {/* <div className="form-group">
              <label className="form-label">request_id</label>
              <input
                className="form-input ws-request-id-input"
                type="text"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
              />
            </div> */}

            <div className="form-group">
              <label className="form-label">Payload JSON</label>
              <textarea
                className="form-input ws-payload-textarea"
                placeholder='{"key": "value"}'
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={8}
              />
            </div>

            <button
              className="btn btn-primary ws-send-btn"
              onClick={handleSend}
            >
              Send
            </button>
          </div>
        </div>

        {/* Right: Message Log */}
        <div className="ws-message-log" ref={messageLogRef}>
          {messages.length === 0 ? (
            <div className="ws-empty-state">
              <div className="ws-empty-icon">&#9889;</div>
              <p>No messages yet</p>
              <span>Connect to a WebSocket server and send a message to see activity here.</span>
            </div>
          ) : (
            messages.map((msg) => {
              const meta = extractMessageMeta(msg);
              return (
                <div key={msg.id} className={`ws-msg ws-msg-${msg.type} ws-msg-${msg.direction}`}>
                  <div className="ws-msg-header">
                    <span className="ws-msg-time">{formatTimestamp(msg.timestamp)}</span>
                    <span className={`ws-msg-type-badge ws-msg-type-${msg.type}`}>
                      type: {msg.type}
                    </span>
                    {msg.direction === 'sent' && (
                      <span className={`ws-msg-type-badge ws-msg-type-request`}>
                        action: {meta.action}
                      </span>
                    )}
                    {meta.action && msg.direction !== 'sent' && (
                      <span className="ws-msg-meta">action: {meta.action}</span>
                    )}
                    {msg.label && msg.direction !== 'sent' && (
                      <span className="ws-msg-meta">action: {msg.label}</span>
                    )}
                    {meta.requestId && (
                      <span className="ws-msg-meta">request_id: {meta.requestId}</span>
                    )}
                  </div>
                  <pre className="ws-msg-body">{formatJson(msg.raw)}</pre>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
