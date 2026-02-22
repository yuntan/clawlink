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

※ 公式と重複する機能は「やらない」ではなく「優先度を下げる」方針。

| 機能 | 重複？ | ClawLinkの差別化・方針 |
|------|--------|----------------------|
| `location.get` | △ 重複 | 公式はフォアグラウンド必須。ClawLinkはバックグラウンドPushで継続送信できる。**優先度: 高** |
| Talk mode | △ 重複 | **Apple Watch版として独自実装**（Watchだけで音声会話完結）。**優先度: 高** |
| カメラ | △ 重複 | 公式と同等機能のため**優先度: 低** |
| Canvas | △ 重複 | ClawLinkのスコープ外。**優先度: 最低** |
| Voice wake | △ 重複 | Watch版クイックアクションで代替。**優先度: 低** |

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

### 方針：UIはWatch完結、技術経路は2パターンを自動切替

ユーザーはWatchだけで操作が完結する。技術的な経路はどちらでもよい。
**Yutoが使っているのはWi-FiモデルのApple Watch。**

#### 接続経路の比較

| | Option A: iPhone relay | Option B: Wi-Fi直接 |
|--|------------------------|---------------------|
| 経路 | Watch → WatchConnectivity → iPhone ClawLink → Gateway | Watch → URLSession → Gateway |
| 前提 | iPhoneが近く（BT圏内）+ ClawLink起動中 | WatchがGatewayと同一Wi-Fi |
| 自宅 | ✅ | ✅（iPhoneなしでも動く） |
| 外出先 | ✅ | ❌（Wi-Fiなし） |
| Gateway公開 | 不要（LAN内でOK） | 不要（同一LAN） |
| 実装難度 | 低 | 中 |

#### 自動切替ロジック

```swift
if WCSession.default.isReachable {
    // Option A: iPhone経由
    WCSession.default.sendMessage(["text": transcribedText], ...)
} else if watchIsOnSameNetworkAsGateway {
    // Option B: Wi-Fi直接
    URLSession.shared.dataTask(with: gatewayRequest)
} else {
    // 接続不可
    showError("Gatewayに接続できません")
}
```

#### 実装優先順位
1. **Option A**（iPhone relay）→ 外出先もカバー、先に作りやすい。MVP
2. **Option B**（Wi-Fi直接）→ 自宅での独立動作（iPhoneを別室に置いてても使える）。後から追加

#### 音声会話フロー（UI = Watch完結）

```
Watch のマイク
  └─ SFSpeechRecognizer（テキスト化）
       └─ [Option A] WatchConnectivity → iPhone → POST /tools/invoke
          [Option B] URLSession → POST /tools/invoke
               └─ AI返答
                    └─ AVSpeechSynthesizer（読み上げ）
```

### 実装アイデア（難易度別）

#### 🟢 比較的簡単

**音声コマンド送信（dictation UI経由）**
- Watchのボタン長押し → `presentTextInputController` でdictation UI
- テキスト → Watch上でHTTP POST → Gateway → AIセッションにwake event注入
- AI返答 → `AVSpeechSynthesizer` で読み上げ or Watch通知

**クイックアクション**
- 定型コマンドボタン:「今日の歩数」「体調記録」「今どこ？」
- タップ → POST /tools/invoke

#### 🟡 中程度

**マイク直接録音 → Watch上でSpeech Recognition**
- `AVAudioEngine` + `SFSpeechRecognizer` で音声→テキストをWatch上で処理
- dictation UIより自由度が高い（録音UIをカスタムできる）
- watchOS 7以降でSFSpeechRecognizer利用可

**Watch単体Talk mode（音声会話ループ）**
- 録音 → テキスト化 → POST to Gateway → AI返答取得 → 読み上げ → 録音…
- HTTPポーリング or SSE（Server-Sent Events）でAI返答を受け取る
- システムTTS（AVSpeechSynthesizer）でOK。ElevenLabsは将来対応

**コンプリケーション（文字盤）**
- 接続状態・最終送信時刻・当日歩数・心拍をリアルタイム表示

#### 🔴 将来・難しい

**WebSocket接続（Watch直接Node化）**
- watchOSはURLSessionのWebSocketTaskをサポート（watchOS 6+）
- Watchが直接NodeとしてGatewayに接続できる
- バックグラウンドでのWS維持はwatchOSでも困難

**AI返答のストリーミング読み上げ**
- SSEでトークンを受け取りながら段階的に読み上げ

**Siriショートカット連携**
- App Intentsで「Hey Siri → ClawLinkに送って」

### Apple Watch技術メモ

| 項目 | 内容 |
|------|------|
| ネットワーク | `URLSession`でWi-Fi/LTE直接接続（watchOS 7+）。iPhoneなしでGatewayに接続可 |
| 音声入力 | `presentTextInputController`（dictation）or `SFSpeechRecognizer`（カスタム） |
| 音声出力 | `AVSpeechSynthesizer`（システムTTS）|
| iPhone連携 | `WatchConnectivity`（オフライン時フォールバック） |
| 文字盤 | `WidgetKit` + `CLKComplication` |
| 制約 | バックグラウンド処理は非常に制限的。会話はフォアグラウンド前提 |

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
