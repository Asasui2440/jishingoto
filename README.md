# ジシンゴト

部屋の写真・動画と避難経路のシミュレーションで、地震への備えを学ぶWebアプリ。子供向け・大人向けの表示に対応しています。

- **室内体験**：写真・動画 → 家具と対策の確認 → 行動クイズ → 振り返り
- **避難体験**：出発地点・避難先の選択 → Street Viewで行動判断 → 振り返り
- **保存マップ（試作）**：リザルトから地図と徒歩経路を保存。ホームの一覧から開き、圏外でも現在地を確認

保存マップは最大5件で、同じマップの再保存は更新します。初回の準備・保存には通信が、現在地表示には位置情報の許可が必要です。災害時の通行止め・避難所の開設状況は反映しません。

## 起動

Node.js 20.9以上・npmが必要です。

```bash
npm ci
cp .env.example .env.local  # 初回のみ。既存ファイルは上書きしない
```

`.env.local` に以下を設定します。任意の設定・キー制限は [.env.example](.env.example) を参照してください。キーや `.env.local` はGitに追加しないでください。

| 変数 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 部屋の画像解析・予想図生成 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 地図・Street View |

```bash
npm run dev
```

[localhost:3000](http://localhost:3000) を開きます。環境変数の変更後は再起動してください。

APIなしで試す場合は、室内体験の [/test-room](http://localhost:3000/test-room) または避難体験の「遊び方・設定」からモック版を使えます。

## 開発・公開

Next.js / React / TypeScript / Tailwind CSS。依存バージョンは [package.json](package.json) を参照してください。

```bash
npm run lint
npm test
npm run build
npm start  # ビルド済みアプリを起動
```

VercelのProduction Branchは `main` を指定します。自動デプロイ設定は [vercel.json](vercel.json)、公開範囲はVercelのDeployment Protectionで管理します。

## 詳細

- [室内体験・写真の扱い](docs/APP_GUIDE.md)
- [避難体験・出題と振り返り](docs/EVAC_GUIDE.md)
- [保存マップ・オフライン対応・制約・検証結果](docs/OFFLINE_EVAC.md)
- [開発ルール](AGENTS.md)
