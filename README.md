# ジシンゴト

部屋の写真や動画から地震への備えを考える防災体験アプリ。**小学生向け・大人向け**の表示に対応しています。

| 体験 | 流れ |
|---|---|
| フェーズ1：室内 | 写真・動画の撮影／フォルダから選択 → 画像の確認・マスク → 家具・対策の確認 → 行動クイズ → 振り返り・予想図の共有 |
| フェーズ2：避難経路 | 出発地点・避難場所の選択 → 経路比較 → Street Viewで行動判断 → 振り返り |

ふりがな・文字サイズ・音と振動を設定できます。AIの認識・予想図や経路表示は、実際の被害や安全性を保証するものではありません。

## 起動

**Node.js 20.9.0以上・npm**が必要です。

```bash
npm ci
cp .env.example .env.local  # 初回のみ。既存ファイルは上書きしない
```

`.env.local` にキーを設定して起動します。

```bash
npm run dev
```

[localhost:3000](http://localhost:3000) を開いてください。環境変数を変更したらサーバーを再起動します。

### 環境変数

`.env.local` は `package.json` と同じ階層に、各メンバーが作成します。

| 変数 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 部屋の画像解析・予想図生成。**発行されたキー本体**を設定 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | フェーズ2の地図・Street View |
| `OPENAI_VISION_MODEL` | 任意。解析モデル（既定：`gpt-5.6-luna`） |
| `OPENAI_IMAGE_MODEL` | 任意。生成モデル（既定：`gpt-image-2`） |
| `GOOGLE_MAPS_SERVER_KEY` | 任意。サーバー経由の経路取得 |

OpenAIキーはサーバー専用です。`NEXT_PUBLIC_` を付けず、キーや `.env.local` をGitに追加しないでください。Google MapsのAPI・キー制限の設定は [.env.example](.env.example) を参照してください。

## APIなしで試す

[/test-room](http://localhost:3000/test-room) で、固定の写真・解析結果を使って室内体験を確認できます。OpenAI APIは呼びません。Google Mapsキーがない場合、フェーズ2はデモ表示になります。

`/camera` は「写真」「動画」に分け、それぞれ画面内カメラでの「撮影する」と、保存済みの「写真から選ぶ」「動画から選ぶ」を表示します。動画の場合は端末内でブレの少ない候補を最大8枚切り出し、AIが最大3枚を選び、家具は写真ごとに連続して番号を振り、対応する写真を1枚ずつ表示します（一定の速さで一周15秒が目安、取り込みは1〜60秒・100MBまで）。

通常の写真解析・予想図生成にはOpenAI APIの利用が発生します。写真はマスク後に送信し、動画のAI選別は**マスク前の候補画像**を送り、選択後のマスクは部屋の解析・予想図・共有に反映します。写真と生成画像はWeb Storageに保存しないため、再読み込みで失われる場合があります。

## 開発・検証

Next.js 16.3.4 / React 19.2.8 / TypeScript / Tailwind CSS 4

```bash
npm run lint
node --test tests/*.test.cjs
npm run build
npm start  # ビルド済みアプリを起動
```

## デプロイ

[vercel.json](vercel.json)で自動デプロイを有効にしています。VercelのProduction Branchを `main` に設定し、mainは本番、PR・作業ブランチはプレビューとして公開します。以前の自動デプロイ停止設定が残るブランチは、最新mainを取り込んでください。

閲覧時の「Request Access」は、Vercelの **Settings → Deployment Protection** で管理する別設定です。Standard Protectionでは本番ドメインを公開し、プレビューもログインなしで共有する場合はVercel Authenticationの「Require Log In」をOFFにします。このリポジトリから閲覧制限は変更しません。実際のデプロイと閲覧可否はVercel上で確認してください。

## コード・詳細

- [画面・API](src/app) / [ロジック・文言](src/lib) / [共通UI](src/components)
- [実装ガイド](docs/APP_GUIDE.md)：写真処理、認識対象、クイズ、共有、表示設定
- [作業ルール](AGENTS.md)：push前にREADMEと実装を照合し、必要な更新を含める
