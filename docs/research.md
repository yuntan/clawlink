# ClawLink リサーチメモ

---

## 公式OpenClaw iOSアプリとの機能比較

公式iOSアプリは内部プレビュー段階（非公開）。ドキュメント: `docs/platforms/ios.md`

### 公式アプリが持つ機能

| 機能 | コマンド | 備考 |
|------|----------|------|
| Canvas（WKWebView） | `canvas.navigate`, `canvas.eval`, `canvas.snapshot` | フォアグラウンド必須 |
| カメラ撮影 | `camera.snap` | フォアグラウンド必須 |
| 位置情報 | `location.get` | フォアグラウンド必須 |
| Talk mode | - | 音声→文字起こし→AI→ElevenLabs TTS の会話ループ |
| Voice wake | - | ウェイクワード検知 |
| 自動探索 | - | Bonjour/LAN、Tailnet、手動ホスト/ポート |

### 重複する機能と差別化ポイント

| 機能 | 重複？ | ClawLinkの差別化 |
|------|--------|-----------------|
| `location.get` | △ 重複 | 公式はフォアグラウンド必須。ClawLinkはバックグラウンドPushで継続送信できる |
| カメラ | △ 重複 | 当面は実装しない（Phase 4以降） |
| Canvas | ✗ 不要 | ClawLinkのスコープ外 |
| Talk mode | ✗ 重複 | 実装しない（公式に任せる） |
| Voice wake | ✗ 重複 | Apple Watch経由で代替（後述） |

### ClawLink独自の価値

| 機能 | 内容 |
|------|------|
| **HealthKit** | 歩数・睡眠・心拍・消費カロリー等（公式アプリにない） |
| **バックグラウンドPush** | 定期的な自動送信（公式は常時フォアグラウンド前提） |
| **Apple Watch連携** | watchOS対応なし（後述） |
| **CoreMotion** | 活動状態・加速度（将来） |
| **バッテリー・ネットワーク** | デバイス状態の把握（将来） |

**結論:** ClawLinkの主な独自価値はHealthKitデータとバックグラウンドPush。位置情報も被るが送信方式が異なる。

---

## Apple Watch連携のアイデア

### アーキテクチャ

```
Apple Watch（WatchKit App）
  └─ 音声入力（dictation UI）
  └─ WatchConnectivity
        └─ iPhone (ClawLink)
              └─ POST /tools/invoke → Gateway → AI
              └─ AI返答 → Watch通知
```

### 実装アイデア（難易度別）

#### 🟢 比較的簡単（Phase 2〜3で実装可能）

**音声コマンド送信**
- Watchのボタン長押し → `WKInterfaceController.presentTextInputController(withSuggestions:)` でdictation UI
- テキスト結果 → WatchConnectivity → iPhone → POST /tools/invoke
- AI返答をWatch通知（`UNUserNotificationCenter`）で受け取る

**クイックアクション**
- 定型コマンドをリストから選ぶだけ
  - 「今の気分を記録」「今日の歩数を送って」「今どこにいる？」
- バッジタップでGatewayにコマンド送信

#### 🟡 中程度

**コンプリケーション（文字盤ウィジェット）**
- Gateway接続状態（Connected / Disconnected）
- 最終データ送信時刻
- 当日の歩数・心拍数をリアルタイム表示

**HealthKitデータの直接取得**
- Apple WatchはiPhoneより心拍測定の精度が高い
- Watch → WatchConnectivity → iPhone → Gateway のパイプライン

#### 🔴 難しい・将来

**Watch上でのAI返答読み上げ**
- `AVSpeechSynthesizer` でテキストを音声化
- ElevenLabsは使えないのでシステムTTSになる

**Siriショートカット連携**
- 「Hey Siri、ClawLinkに送って」→ App Intent経由でGatewayに送信
- iOS 16以降のApp Intentsフレームワーク

### Apple Watch技術メモ

| 項目 | 内容 |
|------|------|
| 音声入力 | `WKInterfaceController.presentTextInputController` (dictation) |
| iPhone連携 | `WatchConnectivity` (`WCSession`) |
| 通知 | `UNUserNotificationCenter`（Watch OSが自動中継） |
| 文字盤 | `WidgetKit` + `CLKComplication` |
| バックグラウンド | watchOSのBGタスクは非常に制限的。基本はiPhone側で処理 |

---

## Talk modeの参考実装（公式）

```json5
// ~/.openclaw/openclaw.json
{
  talk: {
    voiceId: "elevenlabs_voice_id",
    modelId: "eleven_v3",
    outputFormat: "pcm_44100",
    apiKey: "elevenlabs_api_key",
    interruptOnSpeech: true,
  },
}
```

Talk modeは「音声 → SFSpeechRecognizer → AI → ElevenLabsストリーミングTTS」のループ。
ClawLinkでは実装しない（公式iOSアプリが担当）。

---

*調査日: 2026-02-22*
