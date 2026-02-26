// 設定を読み込んでUIに反映
async function loadSettings() {
  const { gatewayUrl, gatewayToken, lastPush } = await chrome.storage.sync.get([
    'gatewayUrl',
    'gatewayToken',
    'lastPush',
  ]);

  if (gatewayUrl) document.getElementById('gateway-url').value = gatewayUrl;
  if (gatewayToken) document.getElementById('gateway-token').value = gatewayToken;

  const lastPushEl = document.getElementById('last-push');
  if (lastPush) {
    lastPushEl.textContent = new Date(lastPush).toLocaleString('ja-JP');
  }
}

// 設定を保存
document.getElementById('save-btn').addEventListener('click', async () => {
  const gatewayUrl = document.getElementById('gateway-url').value.trim();
  const gatewayToken = document.getElementById('gateway-token').value.trim();

  await chrome.storage.sync.set({ gatewayUrl, gatewayToken });

  // service workerに設定変更を通知
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });

  const btn = document.getElementById('save-btn');
  btn.textContent = '保存しました';
  setTimeout(() => { btn.textContent = '保存'; }, 1500);
});

// 接続テスト
document.getElementById('test-btn').addEventListener('click', async () => {
  const resultEl = document.getElementById('test-result');
  resultEl.textContent = '確認中...';
  resultEl.className = 'test-result';

  const response = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' });

  if (response.success) {
    resultEl.textContent = '接続成功';
    resultEl.className = 'test-result success';
    document.getElementById('status-badge').textContent = '接続済み';
    document.getElementById('status-badge').className = 'badge badge-connected';
  } else {
    resultEl.textContent = `エラー: ${response.error}`;
    resultEl.className = 'test-result error';
    document.getElementById('status-badge').textContent = 'エラー';
    document.getElementById('status-badge').className = 'badge badge-error';
  }
});

// 今すぐ送信
document.getElementById('push-now-btn').addEventListener('click', async () => {
  const btn = document.getElementById('push-now-btn');
  btn.textContent = '送信中...';
  btn.disabled = true;

  const response = await chrome.runtime.sendMessage({ type: 'PUSH_NOW' });

  if (response.success) {
    const now = new Date();
    document.getElementById('last-push').textContent = now.toLocaleString('ja-JP');
    await chrome.storage.sync.set({ lastPush: now.toISOString() });
  }

  btn.textContent = response.success ? '送信しました' : `失敗: ${response.error}`;
  setTimeout(() => {
    btn.textContent = '今すぐ送信';
    btn.disabled = false;
  }, 2000);
});

// ─── Relay ON/OFF ─────────────────────────────────────────

const relayToggle = document.getElementById('relay-toggle');
const relayLabel = document.getElementById('relay-label');
const relayStatus = document.getElementById('relay-status');

async function loadRelayStatus() {
  const { active } = await chrome.runtime.sendMessage({ type: 'RELAY_GET_STATUS' });
  setRelayUI(active);
}

function setRelayUI(active) {
  relayToggle.checked = active;
  relayLabel.textContent = active ? 'ON' : 'OFF';
  if (active) {
    relayStatus.textContent = '接続中: AIがこのタブの内容を参照できます';
    relayStatus.className = 'relay-status on';
  } else {
    relayStatus.textContent = '';
    relayStatus.className = 'relay-status';
  }
}

relayToggle.addEventListener('change', async () => {
  const active = relayToggle.checked;

  relayLabel.textContent = active ? '接続中...' : '切断中...';
  relayToggle.disabled = true;

  const type = active ? 'RELAY_START' : 'RELAY_STOP';
  const response = await chrome.runtime.sendMessage({ type });

  relayToggle.disabled = false;

  if (response.success) {
    setRelayUI(active);
  } else {
    // 失敗時は元に戻す
    relayToggle.checked = !active;
    relayLabel.textContent = !active ? 'ON' : 'OFF';
    relayStatus.textContent = `エラー: ${response.error}`;
    relayStatus.className = 'relay-status error';
  }
});

loadSettings();
loadRelayStatus();
