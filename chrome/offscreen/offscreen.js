/**
 * offscreen.js
 * Service WorkerはMV3でアイドル時にSuspendされるため、
 * offscreenドキュメントでWebSocket接続を常時維持する。
 *
 * OpenClaw Gateway WS プロトコル（実装済み）:
 *   フレーム形式:
 *     req:   { type:"req",   id, method, params }
 *     res:   { type:"res",   id, ok, payload|error }
 *     event: { type:"event", event, payload }
 *
 *   接続フロー:
 *     1. WS open
 *     2. Gateway → { type:"event", event:"connect.challenge", payload:{nonce,ts} }
 *     3. Client → { type:"req", id, method:"connect", params:{...} }
 *     4. Gateway → { type:"res", id, ok:true, payload:{type:"hello-ok",...} }
 *
 *   Nodeコマンド受信:
 *     Gateway → { type:"event", event:"node.invoke.request", payload:{id, nodeId, command, paramsJSON?} }
 *     Client  → { type:"req",   id, method:"node.invoke.result", params:{id, nodeId, ok, payload|error} }
 */

/** @type {WebSocket | null} */
let ws = null;
let reconnectTimer = null;
let gatewayUrl = '';
let gatewayToken = '';
let reconnectDelay = 2000;
let connected = false;

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
      sendResponse({ connected });
      break;
  }
  return false;
});

// ─── ユーティリティ ───────────────────────────────────────

function genId() {
  return crypto.randomUUID();
}

function sendFrame(frame) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(frame));
}

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
  connected = false;

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
    console.log('[ClawLink Offscreen] WS open、connect.challenge を待機中');
    // connect.challenge を受信してから connect を送る（onmessageで処理）
  };

  ws.onmessage = async (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      console.warn('[ClawLink Offscreen] JSONパースエラー:', event.data);
      return;
    }

    await handleFrame(frame);
  };

  ws.onerror = (err) => {
    console.error('[ClawLink Offscreen] WSエラー:', err);
  };

  ws.onclose = (event) => {
    console.log('[ClawLink Offscreen] WS切断:', event.code, event.reason);
    ws = null;
    connected = false;
    chrome.runtime.sendMessage({ type: 'RELAY_STATUS', status: 'disconnected' });
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
  connected = false;
}

function scheduleReconnect() {
  if (!gatewayUrl) return;
  console.log(`[ClawLink Offscreen] ${reconnectDelay}ms後に再接続`);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connect();
  }, reconnectDelay);
}

// ─── フレームハンドリング ─────────────────────────────────

async function handleFrame(frame) {
  if (frame.type === 'event') {
    await handleEvent(frame.event, frame.payload ?? {});
  } else if (frame.type === 'res') {
    handleResponse(frame);
  }
}

// 応答待ちマップ（リクエストIDをキーにresolve/rejectを保持）
const pendingRequests = new Map();

function sendRequest(method, params) {
  const id = genId();
  const frame = { type: 'req', id, method, params };
  sendFrame(frame);
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`タイムアウト: ${method}`));
      }
    }, 10000);
  });
}

function handleResponse(frame) {
  const pending = pendingRequests.get(frame.id);
  if (!pending) return;
  pendingRequests.delete(frame.id);
  if (frame.ok) {
    pending.resolve(frame.payload);
  } else {
    pending.reject(new Error(frame.error?.message ?? 'unknown error'));
  }
}

async function handleEvent(event, payload) {
  switch (event) {
    case 'connect.challenge':
      await sendConnectHandshake(payload.nonce);
      break;

    case 'node.invoke.request':
      await handleNodeInvokeRequest(payload);
      break;

    default:
      // その他のイベントは無視
      break;
  }
}

// ─── 接続 handshake ───────────────────────────────────────

async function sendConnectHandshake(challengeNonce) {
  console.log('[ClawLink Offscreen] connect.challenge受信、connect送信');

  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'node-host',
      version: '1.0.0',
      platform: 'chrome',
      mode: 'node',
    },
    role: 'node',
    caps: ['tabs', 'history'],
    commands: ['tabs.list', 'tabs.active.get', 'tabs.active.content', 'tabs.screenshot'],
    permissions: {},
    locale: navigator.language ?? 'ja-JP',
    userAgent: navigator.userAgent,
  };

  if (gatewayToken) {
    params.auth = { token: gatewayToken };
  }

  try {
    const helloOk = await sendRequest('connect', params);
    console.log('[ClawLink Offscreen] hello-ok受信:', helloOk?.type);
    connected = true;
    chrome.runtime.sendMessage({ type: 'RELAY_STATUS', status: 'connected' });
  } catch (err) {
    console.error('[ClawLink Offscreen] connect失敗:', err);
    chrome.runtime.sendMessage({ type: 'RELAY_STATUS', status: 'error', error: err.message });
  }
}

// ─── node.invoke.request 処理 ─────────────────────────────

async function handleNodeInvokeRequest(payload) {
  const { id, nodeId, command, paramsJSON } = payload;
  let cmdParams = {};
  if (paramsJSON) {
    try {
      cmdParams = JSON.parse(paramsJSON);
    } catch {
      cmdParams = {};
    }
  }

  console.log('[ClawLink Offscreen] node.invoke.request:', command);

  try {
    // コマンド実行をService Workerに委譲（chrome.tabs等のAPIはSWが持つ）
    const result = await chrome.runtime.sendMessage({
      type: 'RELAY_COMMAND',
      command,
      args: cmdParams,
    });

    // 成功レスポンス
    sendFrame({
      type: 'req',
      id: genId(),
      method: 'node.invoke.result',
      params: {
        id,
        nodeId,
        ok: true,
        payload: result,
      },
    });
  } catch (err) {
    console.error('[ClawLink Offscreen] コマンド実行エラー:', err);

    // エラーレスポンス
    sendFrame({
      type: 'req',
      id: genId(),
      method: 'node.invoke.result',
      params: {
        id,
        nodeId,
        ok: false,
        error: { message: err.message },
      },
    });
  }
}
