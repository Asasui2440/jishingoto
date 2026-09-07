# OpenAIバックエンド

Next.js Route Handlersとして実装。ブラウザから同じオリジンの `/api/*` を呼び、サーバーだけがOpenAI APIキーを使う。別のバックエンドプロセスやCORS設定は不要。

## 起動

1. `.env.example` を参考に、プロジェクト直下の `.env.local` に `OPENAI_API_KEY` を設定する（Git対象外）。キーを `NEXT_PUBLIC_` の変数にしない。
2. `npm run dev` を実行。環境変数を変更したら再起動する。
3. `/camera` で写真を撮影・選択し、プライバシー画面で隠す範囲を指定して送信に同意する。
4. 解析された候補を確認し、クイズの結果画面で有料の生成ボタンを押すと想定画像の生成が始まる。

設定:

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `OPENAI_ENABLED` | `false` | 管理者が `true` にした場合のみ有料APIを許可 |
| `OPENAI_API_KEY` | なし・必須 | サーバー専用のOpenAI APIキー |
| `OPENAI_VISION_MODEL` | `gpt-5.4` | 画像入力・Structured Outputs対応モデル |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Images Edit API対応モデル |

初期状態ではAPIキーを設定しても有料APIは呼ばない。利用を開始する際に管理者が `OPENAI_ENABLED=true` を設定する。VercelではProject Settingsの環境変数に設定し、再デプロイが必要。

APIの利用権限と利用枠が必要。生成には数分かかる場合がある。タイムアウトは解析90秒、画像生成180秒。デプロイ先もルートの最大実行時間（解析120秒、生成240秒）に対応させる。

## POST /api/analyze

`multipart/form-data` の `photo` に画像ファイルを指定する。4MB以下のJPEG/PNG/WebP。リクエスト全体は5MB以下（Content-Lengthに依存せず制限）。

Responses APIに画像とJSON Schemaを渡す。最大5件の候補を `Risk[]` として返す。

```json
[{"id":"risk-1","name":"本棚","kind":"fall","confidence":0.9,"x":16,"y":30,"confirmed":false}]
```

`kind` は `fall / break / block`。座標は元画像全体の左上を0%、右下を100%とした物体中心。`confirmed` は必ずfalseで、利用者が確定する。confidenceは認識への自信で、被害確率ではない。画像だけから耐震性や建物の安全性は判定しない。候補が見えなければ空配列。

## POST /api/aftermath

`multipart/form-data`:

- `photo`: プライバシー加工後の元画像（解析と同じ条件）
- `risks`: `Risk[]` をJSON文字列にしたもの（最大20件、一意なid、座標0〜100）

確認済みの危険だけを使い、Images Edit APIで元の部屋を編集する。

```json
{"imageUrl":"data:image/jpeg;base64,...","events":[{"riskId":"risk-1","text":"本棚：たおれる想定"}]}
```

生成画像はその場で返し、サーバーのファイルやDBには保存しない。確認済み候補がなければ `imageUrl: null, events: []` で、OpenAIは呼ばない。フロントは直近の生成リクエストと結果をメモリで共有し、Reactの再マウントや結果画面への再訪での重複生成を防ぐ（リロードは対象外）。画像にはAIの想定である旨を画面上でも表示する。

## エラー

```json
{"error":{"message":"利用者向けの説明"}}
```

400: 入力不正、403: 他オリジン、413: リクエスト超過、415: 画像形式、429: 同時実行/利用枠、502: OpenAIの失敗・不正応答・拒否、503: キー未設定、504: 通信・タイムアウト。

OpenAIからの生のエラーやキーは返さない。解析失敗は画面で再試行・撮り直しを選べる。生成失敗は元の写真とエラーを表示し、明示的な再試行で再生成する。失敗をサンプル解析の成功に見せかけない。

## 写真とプライバシー

- 撮影・選択時にブラウザのCanvasで最大辺1600pxのJPEGへ変換し、元ファイルのEXIF等を引き継がない。
- 顔や個人情報の自動検出は未実装。`detectBlurRegions` は空配列を返す互換関数。未加工画像を自動でOpenAIに送らない。
- プライバシー画面は写真の縦横比を保ち、タップ位置と元画像の座標を一致させる。指定範囲をCanvasで不透明に塗りつぶしてから、解析と生成に同じ加工済み写真を使う。
- アプリ側には写真の永続保存・ログ出力を実装していない。Responses APIは `store: false`。OpenAI側のデータ取り扱いまで保存なしを保証するものではない。
- 写真URLはブラウザのメモリに保持。リロードで失われるので、再度撮影が必要。
- 写真を使わない「サンプルで体験」は固定データを使い、API料金は発生しない。画像生成もしない。

## 設問

`fetchQuestions` は既存の設問と採点を維持し、確認済み危険の種類で順序を選ぶ。設問や防災行動の助言をAIで自動生成するエンドポイントは今回追加していない。

## 公開運用

今回の実装はローカル開発用。プロセス内同時実行2件制限とOrigin確認があるが、ユーザー認証・永続的な利用回数制限ではない。インターネット公開前に認証と共有ストアでの利用枠制御を追加する。Originはブラウザ以外のクライアントで偽装できる。大量アクセスの防止をこのチェックだけに依存しない。

## 検証

`npm test`（OpenAI呼び出しをスタブ化）、`npm run lint`、`npm run build`。
実際の認識品質と生成結果は、利用可能なAPIキーを設定して実画像で確認する。

参考: [画像入力](https://developers.openai.com/api/docs/guides/images-vision)、[画像生成・編集](https://developers.openai.com/api/docs/guides/image-generation)。
