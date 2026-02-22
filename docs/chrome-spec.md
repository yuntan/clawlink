# ClawLink Chrome拡張 仕様書

閲覧中のタブ一覧と履歴をOpenClaw Gatewayに送信するChrome拡張。

---

## 概要

| 項目 | 内容 |
|------|------|
| Manifest | V3 |
| 送信データ | タブ一覧・閲覧履歴 |
| 接続方式 | HTTP POST（Push型）+ WebSocket（Pull型、将来） |
| 認証 | Bearer Token |

---

## アーキテクチャ

iOSと同様の2モード構成。

### Push型（常時）

```
Chrome (ClawLink Extension)
  └─ Service Worker
       ├─ chrome.alarms（定期実行）──→ POST /tools/invoke（タブ一覧）
       └─ chrome.tabs.onActivated ──→ POST /tools/invoke（タブ変化イベント）
```

- 定期送信（5〜30分毎）: タブ一覧 + 直近の履歴
- イベント駆動送信: アクティブタブ変更時に即時送信

### Pull型（将来）

- WebSocketでNodeとして接続
- AIから `tabs.list`、`history.search` を呼び出せる
- Manifest V3のService Workerは非永続なのでWSの常時維持は困難
  → まずはPush型のみ実装

---

## 送信データ

### タブ一覧（`chrome.tabs.query`）

```json
{
  "type": "tabs",
  "timestamp": "2026-02-22T08:00:00Z",
  "tabs": [
    {
      "id": 1,
      "url": "https://github.com/yuntan/clawlink",
      "title": "ClawLink - GitHub",
      "active": true,
      "windowId": 1,
      "pinned": false
    }
  ],
  "activeTab": {
    "url": "https://github.com/yuntan/clawlink",
    "title": "ClawLink - GitHub"
  }
}
```

### 閲覧履歴（`chrome.history.search`）

```json
{
  "type": "history",
  "timestamp": "2026-02-22T08:00:00Z",
  "history": [
    {
      "url": "https://github.com/yuntan/clawlink",
      "title": "ClawLink - GitHub",
      "lastVisitTime": "2026-02-22T08:00:00Z",
      "visitCount": 5
    }
  ]
}
```

---

## Gateway送信形式

```
POST http://<gateway-host>:<port>/tools/invoke
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "tool": "cron",
  "action": "wake",
  "args": {
    "text": "【ClawLink Browser】タブ更新\nアクティブ: GitHub - ClawLink\n開いているタブ: 5件\n直近の履歴: ...",
    "mode": "next-heartbeat"
  },
  "sessionKey": "main"
}
```

---

## 送信タイミング

| トリガー | 送信内容 |
|----------|----------|
| 定期（30分毎） | タブ一覧 + 直近1時間の履歴 |
| アクティブタブ変更 | 新しいアクティブタブのURLとタイトル |
| タブが閉じられた | （送信しない、次の定期送信で反映） |
| 拡張アイコンクリック | 手動で即時送信 |

---

## 拡張の構成

```
chrome/
├── manifest.json
├── background/
│   └── service-worker.js    # メインロジック（アラーム・タブ監視・送信）
├── popup/
│   ├── popup.html           # 接続状態・設定・手動送信ボタン
│   ├── popup.js
│   └── popup.css
└── icons/
    ├── icon16.png
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
    "alarms"
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

### 必要なpermissions

| Permission | 用途 |
|------------|------|
| `tabs` | タブ一覧取得・タブ変化監視 |
| `history` | 閲覧履歴取得 |
| `storage` | 接続設定の保存 |
| `alarms` | 定期実行 |

---

## 設定（popup UI）

ユーザーが設定するもの：
- Gateway URL
- Gateway Token
- 送信間隔（5 / 15 / 30 / 60分）
- 履歴送信ON/OFF
- プライベートウィンドウのタブを含めるか（デフォルトOFF）

---

## 作業プラン

### Phase 1: 基盤
- [ ] manifest.json作成
- [ ] Popup UI（設定画面・接続状態表示）
- [ ] `chrome.storage.sync` で設定を保存
- [ ] HTTP送信ロジック（`/tools/invoke`への疎通確認）

### Phase 2: データ送信
- [ ] `chrome.tabs.query` でタブ一覧取得・送信
- [ ] `chrome.history.search` で履歴取得・送信
- [ ] `chrome.alarms` で定期送信
- [ ] `chrome.tabs.onActivated` でイベント送信

### Phase 3: UX改善
- [ ] 送信状態・最終送信時刻をpopupに表示
- [ ] 手動送信ボタン
- [ ] エラー時のリトライ

### Phase 4: 将来
- [ ] WebSocket Pull型（`tabs.list`、`history.search` コマンド）
- [ ] ページ内容の要約送信（`chrome.scripting`）
- [ ] Firefox対応（WebExtensions API）

---

## iOSとの共通点・違い

| | iOS | Chrome拡張 |
|--|-----|-----------|
| バックグラウンド実行 | BGAppRefreshTask（OS依存） | `chrome.alarms`（確実） |
| Push送信 | HTTP /tools/invoke | 同左 |
| Pull型 | WebSocket Node | 将来実装 |
| 設定保存 | Keychain | chrome.storage.sync |
| 開発環境 | Xcode | VSCode等、ブラウザでデバッグ |

---

*作成: 2026-02-22*
