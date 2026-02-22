/**
 * service-worker.js
 * ClawLink Chrome拡張のメインロジック
 *
 * Phase 1: 定期Push送信（chrome.alarms）、アクティブタブ変更時の即時送信
 * Phase 2: Relayモード（offscreen経由でWebSocket常時接続）
 */

importScripts('push-sender.js');
importScripts('relay-client.js');
importScripts('command-handlers.js');

const ALARM_PERIODIC = 'clawlink-periodic';
const ALARM_INTERVAL_MINUTES = 30;

// ─── 初期化 ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  setupAlarm();
  // 起動時にRelayが有効だったら再接続
  if (await isRelayActive()) {
    const { gatewayUrl, gatewayToken } = await chrome.storage.sync.get([
      'gatewayUrl',
      'gatewayToken',
    ]);
    if (gatewayUrl) {
      startRelay(gatewayUrl, gatewayToken ?? '').catch(console.error);
    }
  }
});

function setupAlarm() {
  chrome.alarms.get(ALARM_PERIODIC, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_PERIODIC, {
        periodInMinutes: ALARM_INTERVAL_MINUTES,
      });
    }
  });
}

// ─── 定期送信 ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_PERIODIC) return;

  const { gatewayUrl, gatewayToken } = await chrome.storage.sync.get([
    'gatewayUrl',
    'gatewayToken',
  ]);

  if (!gatewayUrl) return;

  try {
    await pushAll(gatewayUrl, gatewayToken ?? '');
    await chrome.storage.sync.set({ lastPush: new Date().toISOString() });
  } catch (err) {
    console.error('[ClawLink] 定期送信エラー:', err);
  }
});

// ─── アクティブタブ変更時 ──────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { gatewayUrl, gatewayToken } = await chrome.storage.sync.get([
    'gatewayUrl',
    'gatewayToken',
  ]);

  if (!gatewayUrl) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    // chrome:// など内部URLはスキップ
    if (!tab.url || tab.url.startsWith('chrome://')) return;

    await pushActiveTab(gatewayUrl, gatewayToken ?? '', tab);
    await chrome.storage.sync.set({ lastPush: new Date().toISOString() });
  } catch (err) {
    console.error('[ClawLink] タブ変更送信エラー:', err);
  }
});

// ─── メッセージ処理 ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // 非同期レスポンスのためtrueを返す
});

async function handleMessage(message) {
  const { gatewayUrl, gatewayToken } = await chrome.storage.sync.get([
    'gatewayUrl',
    'gatewayToken',
  ]);

  switch (message.type) {

    // ── Phase 1 ──────────────────────────────────────────

    case 'SETTINGS_UPDATED':
      // 設定が変わったタイミングで即座に1回送信
      if (gatewayUrl) {
        pushAll(gatewayUrl, gatewayToken ?? '').catch(console.error);
      }
      return { success: true };

    case 'TEST_CONNECTION':
      if (!gatewayUrl) {
        return { success: false, error: 'Gateway URLが設定されていません' };
      }
      try {
        await testConnection(gatewayUrl, gatewayToken ?? '');
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }

    case 'PUSH_NOW':
      if (!gatewayUrl) {
        return { success: false, error: 'Gateway URLが設定されていません' };
      }
      try {
        await pushAll(gatewayUrl, gatewayToken ?? '');
        await chrome.storage.sync.set({ lastPush: new Date().toISOString() });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }

    // ── Phase 2: Relay ───────────────────────────────────

    case 'RELAY_START':
      if (!gatewayUrl) {
        return { success: false, error: 'Gateway URLが設定されていません' };
      }
      try {
        await startRelay(gatewayUrl, gatewayToken ?? '');
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }

    case 'RELAY_STOP':
      try {
        await stopRelay();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }

    case 'RELAY_GET_STATUS':
      return { active: await isRelayActive() };

    // offscreen.js からのコマンド実行依頼
    case 'RELAY_COMMAND':
      try {
        const result = await executeCommand(message.command, message.args ?? {});
        return result;
      } catch (err) {
        throw err; // offscreen側でエラーとして処理
      }

    // offscreen.js からのWS接続状態変化通知
    case 'RELAY_STATUS':
      console.log('[ClawLink] Relay状態:', message.status);
      if (message.status === 'disconnected') {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      } else if (message.status === 'connected') {
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      }
      return { success: true };

    default:
      return { success: false, error: `不明なメッセージ: ${message.type}` };
  }
}
