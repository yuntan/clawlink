# ClawLink 仕様書

iPhoneをOpenClawのNodeとして登録し、HealthKit・GPS等のセンサーデータをOpenClawに送信するiOSアプリ。

---

## 概要

| 項目 | 内容 |
|------|------|
| アプリ名 | ClawLink |
| プラットフォーム | iOS (iPhone) |
| 接続方式 | WebSocket (OpenClaw Gateway Protocol v3) |
| ロール | `node` |
| 開発言語 | Swift (SwiftUI) |

---

## アーキテクチャ

```
iPhone (ClawLink)
  └─ WebSocket ──→ OpenClaw Gateway
       role: "node"
       caps: [location, health, camera, screen]
       commands: [location.get, health.steps, health.sleep, ...]
```

- OpenClawのNodeとして接続し、AIから `node.invoke` でコマンドを呼び出せる
- データはAIからのリクエスト時（pull型）に返す
- 定期送信（push型）もバックグラウンドタスクとして実装予定

---

## 実装するコマンド

### location.get
CoreLocationからGPS座標を取得して返す。

```json
// Response
{
  "lat": 34.693,
  "lon": 135.502,
  "accuracy": 10.0,
  "timestamp": "2026-02-21T12:00:00Z"
}
```

### health.steps
HealthKitから当日の歩数を返す。

```json
// Response
{ "steps": 3200, "date": "2026-02-21" }
```

### health.sleep
HealthKitから直近の睡眠記録を返す。

```json
// Response
{
  "date": "2026-02-21",
  "bedtime": "2026-02-20T23:30:00Z",
  "wakeup": "2026-02-21T07:00:00Z",
  "durationHours": 7.5
}
```

### health.heartRate
HealthKitから直近の心拍数を返す。

```json
// Response
{ "bpm": 68, "timestamp": "2026-02-21T11:45:00Z" }
```

### health.summary
上記すべてをまとめて返す（便利コマンド）。

### camera.snap *(将来実装)*
iPhoneのカメラで写真を撮る。

### screen.record *(将来実装)*
画面収録。

---

## OpenClaw Gatewayとの接続

### 接続フロー

1. GatewayからWS challenge受信
2. `connect` リクエスト送信（role: "node"、caps・commandsを宣言）
3. `hello-ok` 受信 → `deviceToken` を永続化
4. 以降はdeviceTokenで再接続

### connect パラメータ

```json
{
  "type": "req",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "clawlink-ios",
      "version": "1.0.0",
      "platform": "ios",
      "mode": "node"
    },
    "role": "node",
    "scopes": [],
    "caps": ["location", "health"],
    "commands": ["location.get", "health.steps", "health.sleep", "health.heartRate", "health.summary"],
    "permissions": {
      "location": true,
      "health": true
    },
    "auth": { "token": "GATEWAY_TOKEN" }
  }
}
```

### コマンド受信

GatewayからのInvokeはこの形式で届く：

```json
{
  "type": "event",
  "event": "node.invoke",
  "payload": {
    "requestId": "...",
    "command": "location.get",
    "params": {}
  }
}
```

レスポンスはこの形式で返す：

```json
{
  "type": "req",
  "method": "node.invoke.reply",
  "params": {
    "requestId": "...",
    "ok": true,
    "payload": { ... }
  }
}
```

---

## 必要なiOS権限・Framework

| Framework | 用途 | Plist Key |
|-----------|------|-----------|
| CoreLocation | GPS位置情報 | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| HealthKit | 歩数・睡眠・心拍 | `NSHealthShareUsageDescription` |
| Network | WebSocket接続 | - |
| BackgroundTasks | バックグラウンド定期送信 | `BGTaskSchedulerPermittedIdentifiers` |

---

## Xcodeプロジェクト構成

```
ClawLink/
├── ClawLinkApp.swift          # エントリポイント
├── ContentView.swift          # メイン画面（接続状態・最新データ表示）
├── Gateway/
│   ├── GatewayClient.swift    # WebSocket接続・Protocol実装
│   └── GatewayProtocol.swift  # JSON型定義（Codable）
├── Commands/
│   ├── LocationCommand.swift  # location.get実装
│   └── HealthCommand.swift    # health.* 実装
├── Sensors/
│   ├── LocationManager.swift  # CoreLocation wrapper
│   └── HealthKitManager.swift # HealthKit wrapper
└── Storage/
    └── Keychain.swift         # deviceToken永続化
```

---

## 作業プラン

### Phase 1: 接続基盤（優先）
- [ ] Xcodeプロジェクト作成（SwiftUI）
- [ ] WebSocket接続実装（`URLSessionWebSocketTask`）
- [ ] Gatewayハンドシェイク・pairing実装
- [ ] deviceToken永続化（Keychain）
- [ ] 接続状態をUIに表示

### Phase 2: センサーコマンド
- [ ] CoreLocation統合（`location.get`）
- [ ] HealthKit統合（`health.steps`, `health.sleep`, `health.heartRate`）
- [ ] コマンドルーティング実装

### Phase 3: バックグラウンド
- [ ] BackgroundTasksでの定期データ送信
- [ ] バッテリー最適化

### Phase 4: 将来拡張
- [ ] `camera.snap`
- [ ] `screen.record`
- [ ] CoreMotion（加速度・活動状態）
- [ ] ネットワーク種別・バッテリー残量

---

## 未決定事項

1. **Gatewayへの接続設定UI**: IPアドレス・ポート・Tokenをアプリ内で入力？ QRコードスキャン？
2. **プッシュ型送信**: 定期的に自動送信するか、AIからのpullのみにするか
3. **ローカルネットワーク vs リモート**: 自宅LAN内のみ？外出先からも繋ぐ？
   → 外出先対応ならGatewayの公開設定が必要（ngrok or VPS）

---

*作成: 2026-02-22*
