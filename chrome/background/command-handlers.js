/**
 * command-handlers.js
 * GatewayからのRelayコマンドを実行するハンドラ群
 *
 * コマンド一覧:
 *   tabs.list            - 全タブのURL・タイトル一覧
 *   tabs.active.get      - アクティブタブのURL・タイトル
 *   tabs.active.content  - ページ本文テキスト（要ユーザー許可=Relayモード中のみ）
 *   tabs.screenshot      - アクティブタブのスクリーンショット（base64）
 */

/**
 * コマンドを受け取り結果を返す
 * @param {string} command
 * @param {object} args
 * @returns {Promise<object>}
 */
async function executeCommand(command, args) {
  switch (command) {
    case 'tabs.list':
      return tabsList();
    case 'tabs.active.get':
      return tabsActiveGet();
    case 'tabs.active.content':
      return tabsActiveContent();
    case 'tabs.screenshot':
      return tabsScreenshot(args);
    default:
      throw new Error(`未知のコマンド: ${command}`);
  }
}

// ─── tabs.list ────────────────────────────────────────────

async function tabsList() {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      windowId: t.windowId,
    })),
  };
}

// ─── tabs.active.get ─────────────────────────────────────

async function tabsActiveGet() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('アクティブタブが見つかりません');
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    windowId: tab.windowId,
  };
}

// ─── tabs.active.content ─────────────────────────────────

async function tabsActiveContent() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('アクティブタブが見つかりません');
  if (!tab.id) throw new Error('タブIDが取得できません');
  // chrome:// 等は scripting 不可
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    throw new Error(`chrome内部ページはコンテンツ取得不可: ${tab.url}`);
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageContent,
  });

  const content = results?.[0]?.result ?? '';
  return {
    url: tab.url,
    title: tab.title,
    content,
  };
}

/** タブ内で実行するページ本文抽出関数（シリアライズされて注入される） */
function extractPageContent() {
  // <script>, <style>, <noscript> を除いたテキストを取得
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
  return clone.innerText.replace(/\s+/g, ' ').trim().slice(0, 10000);
}

// ─── tabs.screenshot ─────────────────────────────────────

async function tabsScreenshot(args) {
  const format = args?.format ?? 'jpeg';
  const quality = args?.quality ?? 80;

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format, quality });
  return {
    dataUrl, // "data:image/jpeg;base64,..."
    format,
  };
}
