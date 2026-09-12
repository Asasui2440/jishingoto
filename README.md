# ジシンゴト

地震を「知識」から「自分事の行動」へ変える、スマートフォン向けの防災シミュレーション。
部屋の写真を撮って危ないところを見つけ、地震のときの動きを試してから、
その部屋に合わせたチェックリストを持ち帰る、という流れの Web アプリ。

Figma:
[Codex祭](https://www.figma.com/design/rWWLKU9N8JD4mtaRojBL94/Codex%E7%A5%AD?node-id=8-8&m=dev)

## 動かす

```bash
npm run dev
```

Phase 1 の実画像解析とアニメ予想図を使うには、`.env.local` にサーバー用キーを設定する。
キーは Route Handler の中だけで使用し、ブラウザには配布しない。

```text
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-5.6-luna # 任意
OPENAI_IMAGE_MODEL=gpt-image-2   # 任意
```

写真はブラウザで最大 1280px に縮小し、プライバシー確認画面で指定した領域を
画像データ自体からマスクしてから OpenAI API へ送る。写真は Web Storage へ保存しない。

フェーズ2は `/evac` の入口で **モック版 / API版** を選べる。
モック版はキー不要で、固定のサンプル地図・経路を使用する。
API版はGoogle Cloudで使用APIを有効にした後、以下の1つを `.env.local`（公開版はVercelの環境変数）へ設定し、再起動・再デプロイする。

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

Maps JavaScript API・Routes API・Geocoding API・Places API (New)を同じプロジェクトで有効にし、共通のブラウザキーを使う。サーバー用キーは不要。

**[キー設定とバージョンの違い](docs/MAPS_SETUP.md)** に手順を記載。
直接開くURLは `/evac?mode=mock` と `/evac?mode=api`。API版は設定不足や通信失敗を表示し、モックに自動で切り替わらない。
フェーズ1の固定データ / 実APIのテスト入口は `/test-room`。

http://localhost:3000 をスマホ幅（〜402px）で開くのが想定。
PC のブラウザでも中央に寄せて表示される。

## 画面の流れ

| ルート | Figma のフレーム | 内容 |
|---|---|---|
| `/` | `onboarding` (8:8) | タイトル・体験の説明・表示設定 |
| `/camera` | `camera-guide` (8:47) | 撮影ガイドとカメラプレビュー |
| `/privacy` | `privacy-blur` (8:95) | 顔や個人情報のぼかし確認 |
| `/analyzing` | `analysis-loading` (8:137) | 解析中の演出と豆知識 |
| `/risks` | `risk-confirmation` (8:185) | 見つかった危険の確認・追加・削除 |
| `/quiz` | `simulation-question` (8:398) | 出題。5問を続けて出す（途中で結果は出さない） |
| `/result` | `result-checklist` (8:509) | 4軸の評価とチェックリスト |
| `/share` | `share-card` (8:592) | シェアカードの生成と共有 |

### フェーズ2（ひなん経路シミュレーション）

| ルート | 内容 |
|---|---|
| `/evac` | 住所・現在地・地図タップで自宅付近を指定し、近くの避難場所を確認 |
| `/evac/routes` | 取得できた徒歩経路の比較・制限時間の設定 |
| `/evac/walk` | 2D地図でコマを進め、途中で判断（2〜3件） |
| `/evac/report` | 結果レポート |

入口はトップの「ひなん経路をためす（フェーズ2）」。
**→ 詳しくは [docs/PHASE2.md](docs/PHASE2.md)**（API・安全表現・保存方針）

## 構成

```
src/
  app/            各画面（すべてクライアントコンポーネント）
    evac/         フェーズ2（ひなん経路シミュレーション）
  components/
    icons.tsx     Figma から書き出した SVG（自動生成・直接編集しない）
    ui/           Screen / Button / Card / Furigana など共通パーツ
    SettingsSheet.tsx
    evac/         フェーズ2の2D地図・判断シート・想定イラスト
  lib/
    api.ts        ★ OpenAI Route Handler と画面の境界（失敗時はデモへフォールバック）
    content.ts    設問・危険の種類・チェックリストなどの文言データ
    session.tsx   体験1回ぶんの状態と集計
    settings.tsx  ふりがな・文字サイズ・音の設定
    store.ts      sessionStorage / localStorage を外部ストアとして扱う土台
    camera.ts     MediaDevices のラッパー
    audio.ts      Web Audio による地鳴り・効果音
    share-card.ts Canvas でのシェア画像生成
    gmaps.ts      Maps JavaScript API のローダー（キーが無ければ読み込まない）
    google-routes.ts Maps JS Routes Libraryの徒歩ルート取得（地図と同じキー）
    evac-api.ts   ★ フェーズ2のバックエンド境界（避難場所・経路・判断地点）
    evac-content.ts フェーズ2の避難場所・判断イベント・文言
    evac.ts       フェーズ2の状態と集計
public/figma/     Figma から書き出した画像とアイコン
```

## バックエンドをつなぐとき

**→ 詳しい仕様は [docs/BACKEND_API.md](docs/BACKEND_API.md)**
（エンドポイントごとの入出力、JSON の形、CORS、つなぎこみ手順）

差し替えるのは **`src/lib/api.ts` の中身だけ** でいいようにしてある。
シグネチャはそのままに、`fetch` に置き換える。

```ts
export async function analyzeRoom(photo?: Blob): Promise<Risk[]>
export async function detectBlurRegions(photo?: Blob): Promise<BlurRegion[]>
export async function fetchQuestions(risks: Risk[]): Promise<Question[]>
export async function generateAftermath(photo: string | null, risks: Risk[]): Promise<Aftermath>
```

- `Risk` / `Question` / `BlurRegion` の型は `src/lib/content.ts` と `src/lib/api.ts` にある。
- 体験1回ぶんの状態は `sessionStorage`（`jishingoto.session.v1`）に入る。
  撮影した写真だけは `blob:` URL なので保存対象から外している。
- 設問データはいま `content.ts` にベタ書きだが、`fetchQuestions` が
  同じ形を返せばそのまま差し替えられる。

## 実装メモ

### デザイン
- 色・角丸・文字サイズは `src/app/globals.css` の `@theme` にまとめてある。
- **配色は黄色基調**。Figma では操作系が青だったが、仕様の「黄色調」に合わせて置き換えた。
  黄は明るいので、載せるものによって濃さを変えないと読めなくなる（`#ffcc00` に白文字は
  コントラスト比 **1.5:1**、WCAG AA の 4.5:1 に遠く届かない）。そのため4段階に分けている:

  | トークン | 値 | 用途 | コントラスト |
  |---|---|---|---|
  | `--color-primary` | `#ffcc00` | 塗り（ボタン・マーカー） | 上に `--color-ink` を載せて 10.8:1 |
  | `--color-primary-mid` | `#b87d00` | バー・枠線 | 明るい面に対して 3.2:1 |
  | `--color-primary-ink` | `#8a5a00` | 明るい面に置く文字・アイコン | 白地に対して 5.9:1 |
  | `--color-primary-soft` | `#fff6d6` | 淡い面（チップの背景など） | 上に `primary-ink` を載せて 5.5:1 |

  **黄の塗りの上に白文字を置かないこと。** ボタンの文字は `text-ink` を使う。
- `--color-accent` はロゴタイプ専用。Figma のブランド表現をそのまま残している。
- アイコンは Figma の書き出しをそのまま React 化したもの。
  差し替えるときは `public/figma/icons/` に SVG を置いて
  `node scripts/generate-icons.mjs` を叩く。手で `src/components/icons.tsx` を触らない。
  Figma の書き出しは色が焼き込まれているので、置かれる面に応じて濃さを変えたいアイコンは
  `scripts/generate-icons.mjs` の `RECOLOR` に登録して `currentColor` に変換し、
  使う側で `text-ink` / `text-primary-ink` などを指定する。

### 端末 API
- **カメラ**（`MediaDevices`）は、権限が降りない・HTTPS でない・PC などの場合に
  自動でサンプル写真かファイル選択に切り替わる。PC でも一通り触れる。
- **音**（Web Audio）は音源ファイルを持たず、ブラウンノイズを合成して地鳴りを作っている。
- **振動**（`navigator.vibrate`）と音は設定でまとめて切れる。
- `prefers-reduced-motion` が有効なときは、揺れを含むアニメーションを止める。

### リザルトの見せかた
仕様の「リザルトはまとめて」「正解をはっきり出すのは良くない」に合わせている。

- **1問ごとのフィードバックは出さない。** 5問を続けて出題し、
  全部終わってから `/result` でまとめて見せる。
  Figma の `simulation-feedback` (8:457) にあった安全度スケールは、この方針のため使っていない。
- 回答したときの音と振動は、**選んだ内容によらず同じ**にしてある。
  違えてしまうと、その場で正解・不正解が分かってしまうため。
- 選択肢は内部的に `safety: 0–1` を持つが、**画面には数値も帯も出さない**。
  使うのは4軸の集計と、リザルトの「ふりかえり」の並び順だけ。
- リザルトの「ふりかえり」は、選んだ行動と解説を折りたたみで並べる。評価はつけない。
- 出題されなかった軸は「今回はなし」と表示する（点をでっちあげない）。
- 「できたこと」は安全度の高かった選択だけを拾い、低い選択を名指ししない。
- 時間切れで自動送りになった場合は「時間切れ」と明示する。

### 部屋の危険と設問のひもづけ
`/risks` で「あぶない」とチェックした場所が、そのまま次の問題になる。

- `Question.riskKind`（`fall` / `break` / `block`）が、部屋で見つかる危険の種類に対応する。
- `fetchQuestions(risks)` が、チェック済みの危険にひもづく設問を先に並べ、
  そのあと共通の設問を足す。
- 設問を増やすときは `content.ts` の `QUESTIONS` に足し、
  部屋の場所に紐づくものなら `riskKind` と `place` を書く。

### 地震の演出
揺れ（`animate-quake` + 地鳴り + 振動）は **最初の1問だけ**。
毎問やると体験が間延びするため、`QuestionView` に `shake` を渡して制御している。

### 「もし地震がきたら」の予想図
リザルトの先頭に、部屋がどうなるかの予想図を出す（`src/components/AftermathCard.tsx`）。

画像は **バックエンドで AI に生成してもらう想定**で、`api.ts` の `generateAftermath()` が
`{ imageUrl, events }` を返す。`imageUrl` が入ればそれを表示し、
いまは `null` なので元の写真に「何がどうなったか」のマーカーを重ねて代用している。

### ふりがな・多言語・年齢層
- `content.ts` の文言は `漢字[かんじ]` 記法で書く。`<Furigana>` が `<ruby>` に変換し、
  表示の有無は `:root[data-furigana]` で切り替わる（再レンダー不要）。
- 文字サイズはルートの `font-size` を変える方式。
  そのため画面側の文字サイズは px ではなく rem ベースの
  `text-11` / `text-13` / `text-15` などを使うこと（`--text-*` は `globals.css` で定義）。
- 多言語は `Settings.locale` に口だけ用意してある（`ja` / `easy` / `en`）。
  文言の辞書はまだ入れていない。

### フェーズ2の安全表現
実在の場所を題材にするぶん、断定しない書き方を徹底している。詳細は
[docs/PHASE2.md](docs/PHASE2.md) にまとめたが、要点は3つ。

- 危険はすべて「〜した想定」。画面上部に「想定シナリオ」の帯を常時出す。
- 2D地図に予定の道、通った道、判断ポイントを表示する。番号は練習用の配置であり、実際の被害を示さない。
- 経路に「安全です」と書かない。距離・時間・練習用のイベント数などを並べる。
- 判断地点ではStreet Viewで周囲を確認できる。閲覧中はタイマーを止める。画像をAIへ送る処理はない。キー設定は [docs/MAPS_SETUP.md](docs/MAPS_SETUP.md) を参照。
- 途中では選択の記録だけを伝え、すべての判断が終わってから通った道と行動をまとめて振り返る。点数や行動の安全度は表示しない。

## まだ入っていないもの

- 3D（Three.js / React Three Fiber / Drei / GLTF）を使った部屋の再現と演出
- 多言語の文言辞書（`Settings.locale` の受け口だけある）
- ハザードマップの重ね合わせ、夜間・雨天の想定（フェーズ2）

### フェーズ2の地域限定AI解析

東京・文京周辺と横浜駅周辺の国土地理院の地形分類を収録し、AIによる0〜3件の注意候補選定・出題・最後の根拠表示まで実装済み。API版の入口で「地理データ＋AI」を選び、サーバーの `OPENAI_API_KEY` を設定する。Googleキーだけなら「固定の練習問題」を選べる。

データの更新・地域追加・API契約・検証は [docs/PHASE2_AI_BACKEND.md](docs/PHASE2_AI_BACKEND.md) を参照。GoogleマップとStreet Viewは `/evac/walk` に同時表示する。画像やGoogleの経路をOpenAIへ送信する処理はない。


### フェーズ1 → フェーズ2の流れ

部屋の全問題が終わった結果画面で「避難ルートへ進む（フェーズ2）」を選ぶと、部屋の記録を残したまま屋外の体験へ続けられる。シェア画面からも進める。フェーズ2の最後には両フェーズの場面数を表示し、部屋の結果へ戻れる。ホームからフェーズ2だけを始めることもできる。
