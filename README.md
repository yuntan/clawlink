# ClawLink

iPhoneとChromeをOpenClawに接続し、センサーデータ・ブラウザ情報をAIに提供するアプリ群。

## コンポーネント

| | 内容 |
|--|------|
| **iOS アプリ** | GPS・歩数・睡眠・心拍等をGatewayに送信 |
| **Apple Watch** | Watch単体で音声会話（音声入力→AI→読み上げ） |
| **Chrome拡張** | タブ一覧・閲覧履歴をGatewayに送信、Relayモード |

## ドキュメント

- [iOS仕様書](./docs/ios-spec.md)
- [Chrome拡張仕様書](./docs/chrome-spec.md)
- [調査項目](./docs/todo.md)
- [リサーチメモ（公式比較・Watch連携）](./docs/research.md)

## ディレクトリ構成

```
clawlink/
├── ios/        # iOSアプリ (Xcode)
├── chrome/     # Chrome拡張
└── docs/       # 仕様書
```
