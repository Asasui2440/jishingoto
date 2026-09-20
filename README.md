# ジシンゴト！

- 部屋の写真・動画から、地震への備えを学ぶ防災体験アプリ。
- **室内体験**：写真を撮る → 部屋の家具などの危険・対策を確認 → 行動クイズ → 予想図と振り返りを保存・共有。
- **避難体験**：経路を比較 → Street Viewで行動クイズ → 振り返り・経路保存。
- **表示設定**：子供向け／大人向け、ふりがな、文字サイズ、音・振動に対応。
- **防災資料**：公的資料や被災者の声を、室内解析・Tips・振り返りに活用。
- **試作機能**：地図・徒歩経路を保存して使うオフライン避難マップ。

## 起動

- Node.js 20.9.0以上・npmを使用。
- `npm ci` → `.env.example` を `.env.local` にコピー → キーを設定 → `npm run dev`。
- [localhost:3000](http://localhost:3000) を開く。環境変数の変更後は再起動。
- 必須キー：室内解析・画像生成は `OPENAI_API_KEY`、地図・Street Viewは `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`。
- 任意設定・キー制限は [.env.example](.env.example) を参照。キーや `.env.local` はGitに追加しない。
- APIなしのデモ：室内は開発環境の `/test-room`、避難は設定のモック版。固定データによる体験。

## 開発

- Next.js / React / TypeScript / Tailwind CSS。
- 検証：`npm run lint`・`npm test`・`npm run build`。ビルド後の起動は `npm start`。
- 被災者の声の更新：`npm run knowledge:build`・`npm run knowledge:check`。
- Vercelの自動デプロイに対応。Production Branchは `main`、閲覧制限はVercel側で設定。

## 制約

- AIの認識・予想図や経路表示は、実際の被害・安全性を保証しない。
- 予想図は震度6強を想定。固定が確認できない家具は未固定と仮定し、転倒・移動・散乱を表現。
- 通常の室内体験はOpenAI APIを利用。写真はマスク後、動画の候補画像はAI選別時にマスク前の状態で送信。
- 写真・生成画像は再読み込みで失われる場合がある。
- オフラインマップは初回保存に通信が必要。災害時の通行止め・避難所の開設状況は反映しない。

## 詳細

- [実装ガイド](docs/APP_GUIDE.md)・[写真認識の対応範囲](docs/ROOM_RECOGNITION_COVERAGE.md)
- [オフライン避難マップ](docs/OFFLINE_EVAC.md)・[生成速度・画面幅の検証](docs/PERFORMANCE_RESPONSIVE.md)
- [防災ナレッジ](knowledge/README.md)・[被災者の声](knowledge/voices/README.md)・[更新手順](docs/KNOWLEDGE_INTEGRATION.md)
