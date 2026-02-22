/**
 * offscreen.js
 * Service WorkerはMV3でアイドル時にSuspendされるため、
 * offscreenドキュメントでWebSocket接続を常時維持する。
 *
 * メッセージフロー:
 *   Gateway ──WS──> offscreen ──sendMessage──> SW (RELAY_COMMAND)
 *   SW ──sendResponse──> offscreen ──WS──> Gateway
 */

/** @type {WebSocket | null} */
let ws = null;
let reconnectTimer = null;
let gatewayUrl = '';
let gatewayToken = '';
let reconnectDelay = 2000;

// ─── Service Worker からのメッセージ受信 ─────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'OFFSCREEN_CONNECT':
      gatewayUrl = message.gatewayUrl;
      gatewayToken = message.gatewayToken ?? '';
      connect();
      sendResponse({ success: true });
      break;

    case 'OFFSCREEN_DISCONNECT':
      disconnect();
      sendResponse({ success: true });
      break;

    case 'OFFSCREEN_STATUS':
      sendResponse({ connected: ws !== null && ws.readyState === WebSocket.OPEN });
      break;
  }
  return false;
});

// ─── WebSocket 接続 ───────────────────────────────────────

function connect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // http:// → ws://, https:// → wss://
  const wsUrl = gatewayUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://')
    .replace(/\/$/, '') + '/ws';

  console.log('[ClawLink Offscreen] WS接続:', wsUrl);

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.error('[ClawLink Offscreen] WS作成エラー:', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 2000;
    console.log('[ClawLink Offscreen] WS接続済み、handshake送信');

    const connectMsg = {
      method: 'connect',
      params: {
        client: { id: 'clawlink-chrome', platform: 'chrome', mode: 'node' },
        role: 'node',
        caps: ['tabs', 'history'],
        commands: ['tabs.list', 'tabs.active.get', 'tabs.active.content', 'tabs.screenshot'],
        auth: gatewayToken ? { token: gatewayToken } : undefined,
      },
    };
    ws.send(JSON.stringify(connectMsg));

    chrome.runtime.sendMessage({ type: 'RELAY_STATUS', status: 'connected' });
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('[ClawLink Offscreen] JSONパースエラー:', event.data);
      return;
    }

    if (msg.method === 'node.invoke') {
      const { requestId, command, args } = msg.params ?? {};
      await handleNodeInvoke(requestId, command, args ?? {});
    }
  };

  ws.onerror = (err) => {
    console.error('[ClawLink Offscreen] WSエラー:', err);
  };

  ws.onclose = (event) => {
    console.log('[ClawLink Offscreen] WS切断:', event.code, event.reason);
    ws = null;
    chrome.runtime.sendMessage({ type: 'RELAY_STATUS', status: 'disconnected' });
    // gatewayUrl が残っている場合は再接続を試みる
    if (gatewayUrl) {
      scheduleReconnect();
    }
  };
}

function disconnect() {
  gatewayUrl = '';
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close(1000, 'user requested');
    ws = null;
  }
}

function scheduleReconnect() {
  if (!gatewayUrl) return;
  console.log(`[ClawLink Offscreen] ${reconnectDelay}ms後に再接続`);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connect();
  }, reconnectDelay);
}

// ─── node.invoke 処理 ─────────────────────────────────────

async function handleNodeInvoke(requestId, command, args) {
  try {
    // コマンド実行をService Workerに委譲（chrome.tabs等のAPIはSWが持つ）
    const result = await chrome.runtime.sendMessage({
      type: 'RELAY_COMMAND',
      command,
      args,
    });

    sendResult(requestId, result);
  } catch (err) {
    console.error('[ClawLink Offscreen] コマンド実行エラー:', err);
    sendError(requestId, err.message);
  }
}

function sendResult(requestId, result) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    method: 'node.invoke.result',
    params: { requestId, result },
  }));
}

function sendError(requestId, error) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    method: 'node.invoke.result',
    params: { requestId, error },
  }));
}
