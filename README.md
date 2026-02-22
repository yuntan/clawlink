# ClawLink

iPhoneをOpenClawのNodeとして接続し、HealthKit・GPS等のセンサーデータをAIに提供するiOSアプリ。

## ドキュメント

- [仕様書](./docs/spec.md)

## ディレクトリ構成

```
clawlink/
├── ios/        # iOSアプリ (Xcode)
├── chrome/     # Chrome拡張 (将来)
└── docs/       # 仕様書
```

## 開発メモ

- Xcodeプロジェクトは `ios/` 以下に置く
- `.gitignore` は `gh repo create --gitignore Swift` のテンプレートを使用
