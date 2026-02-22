# ClawLink 調査項目 (to-do)

---

## 🔴 アーキテクチャの根本的な疑問

### [1] Nodeへのコマンドはどちら向き？
- **現状理解**: Gateway → Node 方向（GatewayがNodeに `node.invoke` イベントを送る）
- iOSがWSに接続していないと届かない
- → バックグラウンドでWSを維持できなければ、pull型（AI→Phone）はほぼ機能しない
- **要確認**: `node.invoke` の方向・タイミング・再試行の仕組みをプロトコル仕様で確認

### [2] 定期自動送信のアーキテクチャ選択
- **pull型**（現Nodeモデル）: iOSが常時WS接続 → AIからのリクエストに応答
  - メリット: AIから任意タイミングで取得できる
  - デメリット: iOSバックグラウンドでWS維持ができない
- **push型**（代替案）: iOSが定期的にHTTP POSTでGatewayにデータを送る
  - メリット: iOSのバックグラウンドタスクと相性が良い
  - デメリット: AIから能動的に問い合わせできない
- **ハイブリッド型**: フォアグラウンド時はWS接続、バックグラウンドは定期HTTP送信
- **要決定**: どのモデルを採用するか

---

## 🟡 iOSバックグラウンド制約の調査

### [3] URLSessionWebSocketTask のバックグラウンド動作
- WebSocketはバックグラウンドでは即座に切断される（数秒〜数十秒）
- `VoIP` モードを使えばWSを維持できる？（制約・Appleの審査要件を確認）
- **調査**: iOS 16以降のWebSocketバックグラウンド動作

### [4] BGAppRefreshTask / BGProcessingTask
- OSが決めるタイミングで実行（保証は30分〜数時間に1回程度）
- 実行時間制限: BGAppRefreshTask = 30秒, BGProcessingTask = 数分
- バッテリー最適化でユーザーがアプリを使うほど頻度が上がる
- **調査**: 歩数・位置情報を定期取得するのに十分か？

### [5] HealthKit Background Delivery
- `HKObserverQuery` + `enableBackgroundDelivery` でデータ更新時にバックグラウンド起動できる
- ただし実際のデータ取得はHKObserverQueryのコールバック内でやる必要がある
- **調査**: 精度・遅延・Appleの制限

### [6] Silent Push Notification (background push)
- APNs経由でバックグラウンドのアプリを起動できる
- Gatewayから送れる？（Gatewayの機能拡張が必要か）
- 30秒の処理時間制限あり
- **調査**: ClawLinkの用途に適用可能か

### [7] VoIP Push (PushKit)
- バックグラウンドから即座に起動・長時間処理可能
- 本来はVoIP用途向け、通話以外の用途でAppleの審査が通るか不明
- **調査**: 非VoIP用途でAppStore審査が通るか

---

## 🟡 接続・認証の調査

### [8] GatewayのToken要否
- Gateway設定の `gateway.auth.token` がある場合、接続時に必要
- **要確認**: tokenなしでnodeとして接続できるか？（ローカルLAN内の場合）
- → アプリのUI設計に影響（Token入力欄が必要か）

### [9] デバイスペアリングのフロー
- 初回接続時にGateway側で `openclaw nodes pending` → `approve` が必要
- iOSアプリ側はペアリング待機中のUIをどう表示するか
- `deviceToken` 取得後はKeychainに保存して再接続時に使う

### [10] 接続設定UIの設計
- 必要な情報: GatewayのホストアドレスURLポート、Token（任意？）
- **選択肢**:
  - 手入力（シンプル）
  - QRコードスキャン（UX良好）
  - ローカルネットワーク自動検出（mDNS/Bonjour）
- **要決定**: どれを採用するか

### [11] 外出先からの接続
- GatewayがLAN内バインドの場合、外部からは繋がらない
- **接続方法の選択肢**:
  - Tailscale（VPN）
  - ngrok / Cloudflare Tunnel（公開URL）
  - VPSにGatewayをデプロイ
- ClawLinkアプリ側の変更は不要、Gateway設定の問題
- **調査**: 現在のGateway設定で外部公開できるか

---

## 🟢 実装・SDK調査

### [12] OpenClaw Swift Protocol Schema
- `pnpm protocol:gen:swift` でSwiftのCodable型が生成できる模様
- ClawLinkで流用できるか確認
- **調査**: 生成物の場所・使い方

### [13] 既存iOSアプリの参考
- OpenClawの公式iOSアプリがあるなら、Node接続の実装が参考になる
- GitHubで公開されているか確認

### [14] Gatewayへのカスタムデータ送信（push型の場合）
- Gatewayに `/ingest` 的なHTTPエンドポイントがあるか？
- なければ独自エンドポイントを立てる必要がある（将来の機能追加？）
- **調査**: Gateway HTTP APIの仕様

---

## 優先順位

1. **[1] + [2]** アーキテクチャ決定 ← ここが決まらないと何も決まらない
2. **[3] + [4] + [5]** iOSバックグラウンド調査 ← 実現可能性の確認
3. **[8] + [9]** Token・ペアリングのフロー ← 接続実装に必要
4. **[10] + [11]** 接続設定UI ← UX設計
5. **[12] + [13]** SDK調査 ← 実装効率化

---

*作成: 2026-02-22*
