# ClawLink Chrome拡張 仕様書

閲覧中のタブ一覧・履歴を自動送信し、ボタン押下でGatewayがブラウザを参照できるChrome拡張。

---

## 概要

| 項目 | 内容 |
|------|------|
| Manifest | V3 |
| 認証 | Bearer Token |

---

## 2つのモード

### モード1: 自動Push（常時・許可不要）

- タブ一覧・閲覧履歴を定期的にGatewayに送信
- `chrome.alarms` で30分毎 + タブ変化時に即時送信
- ユーザーの操作不要、バックグラウンドで動作

### モード2: Relay（ボタン押下・明示的許可）

- ユーザーが拡張アイコンをクリック → そのタブが「接続済み」になる（バッジON）
- GatewayがWebSocket経由でタブを操作・参照できる
- AIから `tabs.active.content`（ページ本文）や `tabs.screenshot` を呼び出せる
- バッジOFFで解除

---

## アーキテクチャ

```
┌─────────────────────────────────────┐
│ Chrome (ClawLink Extension)          │
│                                      │
│  Service Worker                      │
│  ├─ 自動Push（alarms）               │──→ POST /tools/invoke（タブ一覧・履歴）
│  └─ Relay mode（WS接続）             │←→ WebSocket: Gateway（node.invoke）
│       └─ コマンドハンドラ             │
│            tabs.list                 │
│            tabs.active.get           │
│            tabs.active.content ◀要許可│
│            tabs.screenshot   ◀要許可 │
└─────────────────────────────────────┘
```

---

## 自動Push仕様

### 送信タイミング

| トリガー | 送信内容 |
|----------|----------|
| 定期（30分毎） | タブ一覧 + 直近1時間の履歴 |
| アクティブタブ変更 | 新しいアクティブタブのURL・タイトル |

### 送信データ例

```json
// タブ一覧
{
  "type": "tabs",
  "timestamp": "2026-02-22T08:00:00Z",
  "tabs": [
    { "url": "https://github.com/yuntan/clawlink", "title": "ClawLink", "active": true }
  ]
}

// 履歴
{
  "type": "history",
  "since": "2026-02-22T07:00:00Z",
  "history": [
    { "url": "https://github.com", "title": "GitHub", "lastVisitTime": "...", "visitCount": 3 }
  ]
}
```

### Gateway送信形式

```
POST /tools/invoke
Authorization: Bearer <token>

{
  "tool": "cron",
  "action": "wake",
  "args": {
    "text": "【ClawLink Browser】\nアクティブ: GitHub - ClawLink\nタブ数: 5件",
    "mode": "next-heartbeat"
  },
  "sessionKey": "main"
}
```

---

## Relay mode仕様

### 接続フロー

1. ユーザーが拡張アイコンをクリック
2. popupで「このタブをGatewayに接続」ボタン → バッジON（🟢）
3. Service WorkerがWebSocket接続（role: "node"）
4. GatewayからのコマンドをService Workerが受け取り、`chrome.tabs.*` / `chrome.scripting` で実行
5. アイコン再クリック or ページ離脱 → 接続解除（バッジOFF）

### 実装するコマンド

| コマンド | 内容 | 許可 |
|----------|------|------|
| `tabs.list` | 全タブのURL・タイトル一覧 | 不要 |
| `tabs.active.get` | アクティブタブのURL・タイトル | 不要 |
| `tabs.active.content` | ページ本文テキスト（DOMから抽出） | **要ユーザー許可** |
| `tabs.screenshot` | アクティブタブのスクリーンショット | **要ユーザー許可** |

### 許可モデル

- `tabs.active.content` / `tabs.screenshot`: ユーザーがRelayモードをONにしたタブのみ有効
  - Relayモード = 「このタブの内容をAIが参照することに同意した」という明示的な操作
- それ以外のコマンド（tabs.list等）: Relay接続中は常に応答

### Service Workerの常時稼働問題（Manifest V3）

Manifest V3のService WorkerはアイドルでSuspendされる。Relay中は以下で回避：
- `chrome.offscreen` で永続的なオフスクリーンドキュメントを持ち、そちらでWS接続を維持（**採用**）
- ~~`chrome.alarms` で25秒毎にpingを発火してService Workerを起こす~~

---

## Gateway WebSocket プロトコル（公式仕様）

OpenClaw公式ドキュメント（`docs/gateway/protocol.md`）より。

### フレーム形式

```json
// リクエスト
{ "type": "req", "id": "<uuid>", "method": "<method>", "params": {} }

// レスポンス
{ "type": "res", "id": "<uuid>", "ok": true, "payload": {} }
{ "type": "res", "id": "<uuid>", "ok": false, "error": { "code": "...", "message": "..." } }

// イベント
{ "type": "event", "event": "<event-name>", "payload": {} }
```

### 接続フロー

1. WS接続確立
2. Gateway → `{ type:"event", event:"connect.challenge", payload:{ nonce, ts } }`
3. Client → `{ type:"req", id, method:"connect", params:{ minProtocol:3, maxProtocol:3, client:{id:"node-host", version, platform:"chrome", mode:"node"}, role:"node", caps, commands, auth:{ token } } }`
4. Gateway → `{ type:"res", id, ok:true, payload:{ type:"hello-ok", protocol:3, ... } }`

### Nodeコマンド受信・応答

```json
// Gateway → Node（event）
{
  "type": "event",
  "event": "node.invoke.request",
  "payload": { "id": "<id>", "nodeId": "<nodeId>", "command": "tabs.list", "paramsJSON": "{}" }
}

// Node → Gateway（req）
{
  "type": "req", "id": "<new-uuid>", "method": "node.invoke.result",
  "params": { "id": "<同じid>", "nodeId": "<nodeId>", "ok": true, "payload": { ... } }
}
```

### client.id の制約

公式 enum: `"cli" | "webchat" | "openclaw-macos" | "openclaw-ios" | "openclaw-android" | "node-host" | ...`

→ ClawLink Chrome拡張では **`"node-host"`** を使用する。

---

## 拡張の構成

```
chrome/
├── manifest.json
├── background/
│   ├── service-worker.js      # メインロジック
│   ├── push-sender.js         # 自動Push（HTTP /tools/invoke）
│   ├── relay-client.js        # Relay mode（WebSocket Node）
│   └── command-handlers.js    # tabs.*, tabs.screenshot等の実装
├── popup/
│   ├── popup.html             # 接続設定・Relay ON/OFF・状態表示
│   ├── popup.js
│   └── popup.css
└── icons/
    ├── icon16.png             # バッジなし（通常）
    ├── icon16-active.png      # バッジあり（Relay ON）
    ├── icon48.png
    └── icon128.png
```

---

## manifest.json（主要部分）

```json
{
  "manifest_version": 3,
  "name": "ClawLink",
  "version": "1.0.0",
  "permissions": [
    "tabs",
    "history",
    "storage",
    "alarms",
    "activeTab",
    "scripting",
    "offscreen"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  }
}
```

---

## Popup UI

**常時表示**
- 接続状態（Gateway URL・Connected/Disconnected）
- 最終Push送信時刻
- 手動送信ボタン

**Relay mode**
- 「このタブをAIに接続」トグル（ON/OFF）
- Relay中はバッジ表示（🟢）
- 「接続中：AIがこのタブの内容を参照できます」

---

## 作業プラン

### Phase 1: 自動Push
- [ ] manifest.json作成
- [ ] Popup UI（設定・状態表示）
- [ ] `chrome.storage.sync` で設定保存
- [ ] HTTP /tools/invoke 疎通確認
- [ ] `chrome.tabs.query` でタブ一覧取得・送信
- [ ] `chrome.history.search` で履歴取得・送信
- [ ] `chrome.alarms` で定期送信
- [ ] `chrome.tabs.onActivated` でイベント送信

### Phase 2: Relay mode
- [ ] WebSocket接続（GatewayProtocol handshake）
- [ ] `chrome.offscreen` でWS常時接続 or alarmによるService Worker維持
- [ ] コマンドハンドラ実装（`tabs.list`、`tabs.active.get`）
- [ ] `chrome.scripting.executeScript` でページ本文取得（`tabs.active.content`）
- [ ] `chrome.tabs.captureVisibleTab` でスクリーンショット（`tabs.screenshot`）
- [ ] バッジON/OFFの実装
- [ ] Relay ON時のUI（警告・接続状態）

### Phase 3: UX
- [ ] エラー時のリトライ・通知
- [ ] 送信履歴ログ（popup内）

---

*作成: 2026-02-22*
