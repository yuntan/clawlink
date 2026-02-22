# ClawLink 仕様書

iPhoneをOpenClawに接続し、HealthKit・GPS等のセンサーデータをOpenClawに送信するiOSアプリ。

---

## 概要

| 項目 | 内容 |
|------|------|
| アプリ名 | ClawLink |
| プラットフォーム | iOS (iPhone) |
| 開発言語 | Swift (SwiftUI) |

---

## アーキテクチャ方針（決定済み）

**Push型メイン + フォアグラウンド時Pull型**

### バックグラウンド時（Push型）

```
iPhone (ClawLink)
  └─ HTTP POST ──→ Gateway /tools/invoke
       ↓
    cron.wake("センサーデータ: GPS=..., Steps=...")
       ↓
    AIセッションにデータ注入
```

- `BGAppRefreshTask` / `HealthKit Background Delivery` で定期起動
- GatewayのHTTP API（`POST /tools/invoke`）にセンサーデータを送信
- 短時間のHTTPリクエストで完結するためiOSのバックグラウンド制約に適合
- 認証: `Authorization: Bearer <gateway-token>`

### フォアグラウンド時（Pull型）

```
iPhone (ClawLink)
  └─ WebSocket ──→ OpenClaw Gateway
       role: "node"
       ↑ AIからのnode.invokeを受信・応答
```

- アプリ起動中はWebSocket接続でNodeとして動作
- AIから高精度・高頻度でのデータ取得が可能（GPS精度UP、カメラ等）
- フォアグラウンド↔バックグラウンド切り替えでWS接続を自動ON/OFF

---

## データ送信仕様

### Push型（HTTP）

**エンドポイント**

```
POST http://<gateway-host>:<port>/tools/invoke
Authorization: Bearer <token>
Content-Type: application/json
```

**リクエスト例（定期センサーデータ送信）**

```json
{
  "tool": "cron",
  "action": "wake",
  "args": {
    "text": "【ClawLink】センサーデータ更新\n- GPS: 34.693, 135.502 (精度±15m)\n- 歩数: 3,200歩 (本日)\n- 心拍: 68bpm\n- 睡眠: 7.5h",
    "mode": "next-heartbeat"
  },
  "sessionKey": "main"
}
```

### Pull型（WebSocket Node）

**接続パラメータ**

```json
{
  "method": "connect",
  "params": {
    "client": { "id": "clawlink-ios", "platform": "ios", "mode": "node" },
    "role": "node",
    "caps": ["location", "health", "camera"],
    "commands": ["location.get", "health.steps", "health.sleep", "health.heartRate", "health.summary"],
    "auth": { "token": "<gateway-token>" }
  }
}
```

**実装コマンド**

| コマンド | 内容 |
|----------|------|
| `location.get` | GPS座標（高精度, foreground） |
| `health.steps` | 当日の歩数 |
| `health.sleep` | 直近の睡眠記録 |
| `health.heartRate` | 直近の心拍数 |
| `health.summary` | 上記まとめ |
| `camera.snap` | 写真撮影（将来） |
| `screen.record` | 画面収録（将来） |

---

## 送信するデータ

| データ | 取得元 | 頻度（Push） | 精度（Pull） |
|--------|--------|-------------|-------------|
| GPS位置情報 | CoreLocation | 低精度・定期 | 高精度・即時 |
| 歩数 | HealthKit | 30分〜1h毎 | 即時 |
| 睡眠記録 | HealthKit | 起床時 | 即時 |
| 心拍数 | HealthKit | 変化時 | 即時 |
| 活動状態 | CoreMotion | 変化時 | 即時 |
| バッテリー | UIDevice | 定期 | 即時 |
| ネットワーク種別 | NWPathMonitor | 変化時 | 即時 |

---

## Xcodeプロジェクト構成

```
ClawLink.xcodeproj
ClawLink/
├── ClawLinkApp.swift
├── ContentView.swift              # 接続状態・直近データ表示
├── Gateway/
│   ├── GatewayClient.swift        # WebSocket接続（foreground）
│   ├── GatewayHTTPClient.swift    # HTTP /tools/invoke（background）
│   └── GatewayProtocol.swift      # JSON型定義
├── Commands/                      # Pull型コマンドハンドラ
│   ├── LocationCommand.swift
│   └── HealthCommand.swift
├── Sensors/
│   ├── LocationManager.swift      # CoreLocation wrapper
│   ├── HealthKitManager.swift     # HealthKit wrapper
│   └── MotionManager.swift        # CoreMotion wrapper
├── Background/
│   ├── BGTaskManager.swift        # BGAppRefreshTask / BGProcessingTask
│   └── PushSender.swift           # HTTP送信ロジック
└── Storage/
    └── Keychain.swift             # deviceToken・接続設定の永続化
```

---

## 接続設定UI

ユーザーが入力する情報：
- Gateway URL（例: `http://192.168.1.10:18789` または Tailscale URL）
- Gateway Token（設定されている場合）

**接続フロー**
1. URL・Token入力 → 接続テスト（HTTP GET `/health` 等）
2. 初回: WS接続 → Gatewayでペアリング承認（`openclaw nodes approve`）
3. 以降: deviceTokenでの自動再接続

---

## 必要なiOS権限・Framework

| Framework | 用途 | Plist Key |
|-----------|------|-----------|
| CoreLocation | GPS | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| HealthKit | 歩数・睡眠・心拍 | `NSHealthShareUsageDescription` |
| BackgroundTasks | 定期バックグラウンド実行 | `BGTaskSchedulerPermittedIdentifiers` |
| Network | HTTP + WebSocket | - |

---

## 作業プラン

### Phase 1: 基盤・接続設定
- [ ] Xcodeプロジェクト作成（SwiftUI、iOS 17+）
- [ ] 接続設定UI（URL・Token入力、保存）
- [ ] HTTP接続テスト（`/tools/invoke` 疎通確認）
- [ ] WebSocket接続実装（GatewayProtocol handshake）
- [ ] ペアリングフロー実装（初回 + deviceToken保存）
- [ ] フォア/バックグラウンド切り替え（WS ON/OFF）

### Phase 2: センサー取得
- [ ] CoreLocation統合（低精度・常時 + 高精度・foreground）
- [ ] HealthKit統合（歩数・睡眠・心拍）
- [ ] Pull型コマンドルーティング（node.invoke受信→応答）

### Phase 3: 自動Push送信
- [ ] BGAppRefreshTask登録・実装
- [ ] HealthKit Background Delivery（データ変化で起動）
- [ ] HTTP push送信ロジック（/tools/invoke + cron.wake）
- [ ] 送信間隔・内容のカスタマイズ

### Phase 4: 将来拡張
- [ ] `camera.snap`
- [ ] `screen.record`
- [ ] CoreMotion（活動状態・加速度）
- [ ] バッテリー・ネットワーク状態

---

## 未調査事項

- `BGAppRefreshTask` の実際の実行頻度（OS任せのため変動）
- `HealthKit Background Delivery` の遅延・精度
- `cron.wake` でのデータ注入がAIセッションに適切に届くか
- iOS 17+ での `URLSessionWebSocketTask` のバックグラウンド動作の詳細

---

*作成: 2026-02-22 | アーキテクチャ確定: 2026-02-22*
