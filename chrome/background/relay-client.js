/**
 * relay-client.js
 * Relayモードの管理:
 * - offscreenドキュメントのライフサイクル管理
 * - バッジON/OFF
 * - Relay状態の永続化（chrome.storage.local）
 */

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

// ─── Relay 開始 ───────────────────────────────────────────

async function startRelay(gatewayUrl, gatewayToken) {
  await ensureOffscreenDocument();

  await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_CONNECT',
    gatewayUrl,
    gatewayToken: gatewayToken ?? '',
  });

  // Relay許可タブを記録（現在のアクティブタブ）
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const relayTabId = activeTab?.id ?? null;

  await chrome.storage.local.set({ relayActive: true, relayTabId });
  await setBadge(true);
}

// ─── Relay 停止 ───────────────────────────────────────────

async function stopRelay() {
  // offscreenが存在する場合のみ送信
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  });

  if (contexts.length > 0) {
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_DISCONNECT' });
    await chrome.offscreen.closeDocument();
  }

  await chrome.storage.local.set({ relayActive: false, relayTabId: null });
  await setBadge(false);
}

// ─── Relay 状態取得 ───────────────────────────────────────

async function isRelayActive() {
  const { relayActive } = await chrome.storage.local.get('relayActive');
  return !!relayActive;
}

async function getRelayTabId() {
  const { relayTabId } = await chrome.storage.local.get('relayTabId');
  return relayTabId ?? null;
}

// ─── offscreen ドキュメント管理 ───────────────────────────

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  });

  if (contexts.length > 0) return; // 既に存在する

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['WEBSOCKET'],
    justification: 'OpenClaw GatewayとのWebSocket接続を維持するため',
  });
}

// ─── バッジ ───────────────────────────────────────────────

async function setBadge(active) {
  if (active) {
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}
