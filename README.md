# ClawLink

iPhoneとChromeをOpenClawに接続し、センサーデータ・ブラウザ情報をAIに提供するアプリ群。

## コンポーネント

| | 内容 |
|--|------|
| **iOS アプリ** | GPS・歩数・睡眠・心拍等をGatewayに送信 |
| **Chrome拡張** | タブ一覧・閲覧履歴をGatewayに送信 |

## ドキュメント

- [iOS仕様書](./docs/spec.md)
- [Chrome拡張仕様書](./docs/chrome-spec.md)
- [調査項目](./docs/todo.md)

## ディレクトリ構成

```
clawlink/
├── ios/        # iOSアプリ (Xcode)
├── chrome/     # Chrome拡張
└── docs/       # 仕様書
```
