/**
 * push-sender.js
 * タブ一覧・履歴を収集してGateway の /tools/invoke に送信する
 */

/**
 * @param {string} gatewayUrl
 * @param {string} gatewayToken
 * @param {string} text  AIに送るテキスト本文
 */
async function sendToGateway(gatewayUrl, gatewayToken, text) {
  const url = `${gatewayUrl.replace(/\/$/, '')}/tools/invoke`;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (gatewayToken) {
    headers['Authorization'] = `Bearer ${gatewayToken}`;
  }

  const body = JSON.stringify({
    tool: 'cron',
    action: 'wake',
    args: {
      text,
      mode: 'next-heartbeat',
    },
    sessionKey: 'main',
  });

  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res;
}

/**
 * タブ一覧を取得してGatewayに送信する
 */
async function pushTabs(gatewayUrl, gatewayToken) {
  const tabs = await chrome.tabs.query({});
  const tabList = tabs.map(t => `- [${t.active ? 'アクティブ' : '　　'}] ${t.title} (${t.url})`).join('\n');
  const text = `【ClawLink Browser】タブ一覧 (${tabs.length}件)\n${tabList}`;
  await sendToGateway(gatewayUrl, gatewayToken, text);
}

/**
 * 直近1時間の履歴を取得してGatewayに送信する
 */
async function pushHistory(gatewayUrl, gatewayToken) {
  const since = Date.now() - 60 * 60 * 1000; // 1時間前
  const historyItems = await chrome.history.search({
    text: '',
    startTime: since,
    maxResults: 50,
  });

  if (historyItems.length === 0) return;

  const historyList = historyItems
    .slice(0, 20) // 長くなりすぎないよう20件に絞る
    .map(h => `- ${h.title} (${h.url})`)
    .join('\n');
  const text = `【ClawLink Browser】直近の閲覧履歴 (${historyItems.length}件中20件)\n${historyList}`;
  await sendToGateway(gatewayUrl, gatewayToken, text);
}

/**
 * アクティブタブの変化を通知する
 */
async function pushActiveTab(gatewayUrl, gatewayToken, tab) {
  const text = `【ClawLink Browser】アクティブタブ変更\n- ${tab.title}\n- ${tab.url}`;
  await sendToGateway(gatewayUrl, gatewayToken, text);
}

/**
 * タブ一覧 + 履歴を一括送信（定期送信用）
 */
async function pushAll(gatewayUrl, gatewayToken) {
  await pushTabs(gatewayUrl, gatewayToken);
  await pushHistory(gatewayUrl, gatewayToken);
}

/**
 * /health エンドポイントで接続テスト
 * なければ /tools/invoke に空リクエストを試みる
 */
async function testConnection(gatewayUrl, gatewayToken) {
  const url = `${gatewayUrl.replace(/\/$/, '')}/health`;
  const headers = {};
  if (gatewayToken) {
    headers['Authorization'] = `Bearer ${gatewayToken}`;
  }

  const res = await fetch(url, { method: 'GET', headers });
  // 404でもサーバーが応答していれば疎通OK
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}`);
  }
}
