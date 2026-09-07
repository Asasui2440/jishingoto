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

## 構成

```
src/
  app/            各画面（すべてクライアントコンポーネント）
  components/
    icons.tsx     Figma から書き出した SVG（自動生成・直接編集しない）
    ui/           Screen / Button / Card / Furigana など共通パーツ
    SettingsSheet.tsx
  lib/
    api.ts        バックエンドとの境界（同一オリジンのAPI）
    content.ts    設問・危険の種類・チェックリストなどの文言データ
    session.tsx   体験1回ぶんの状態と集計
    settings.tsx  ふりがな・文字サイズ・音の設定
    store.ts      sessionStorage / localStorage を外部ストアとして扱う土台
    camera.ts     MediaDevices のラッパー
    audio.ts      Web Audio による地鳴り・効果音
    share-card.ts Canvas でのシェア画像生成
public/figma/     Figma から書き出した画像とアイコン
```

## OpenAIバックエンド

部屋の画像認識と、確認した危険に基づく地震後の想定画像生成を実装済み。
Next.js内のAPIなので `npm run dev` でフロントとバックエンドが起動する。

有料APIは初期状態で無効。利用するときだけ `OPENAI_ENABLED=true` を明示的に設定する。
`.env.local` の `OPENAI_API_KEY=` にキーを設定して起動する。キーはサーバーだけで使用し、Gitには保存しない。
画像認識は `OPENAI_VISION_MODEL`（既定 `gpt-5.4`）、画像生成は `OPENAI_IMAGE_MODEL`（既定 `gpt-image-2`）で変更できる。

撮影 → 端末内で個人情報を隠す → OpenAIへの送信に同意 → 画像解析 → 危険を確認 → クイズ → 有料の生成ボタン → 想定画像生成、の流れ。
サンプルモードはAPIを呼ばない。AIの出力は学習用の想定であり、実際の被害予測・耐震診断ではない。

詳細な入出力、エラー、公開前の制約は [docs/BACKEND_API.md](docs/BACKEND_API.md)。
`npm test` でバックエンドの自動テストを実行できる。

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

画像は **バックエンドのOpenAI APIで生成**し、`api.ts` の `generateAftermath()` が
`{ imageUrl, events }` を返す。`imageUrl` が入ればそれを表示し、
生成失敗時はエラーと元の写真を表示して再試行できる。サンプルモードは生成しない。

### ふりがな・多言語・年齢層
- `content.ts` の文言は `漢字[かんじ]` 記法で書く。`<Furigana>` が `<ruby>` に変換し、
  表示の有無は `:root[data-furigana]` で切り替わる（再レンダー不要）。
- 文字サイズはルートの `font-size` を変える方式。
  そのため画面側の文字サイズは px ではなく rem ベースの
  `text-11` / `text-13` / `text-15` などを使うこと（`--text-*` は `globals.css` で定義）。
- 多言語は `Settings.locale` に口だけ用意してある（`ja` / `easy` / `en`）。
  文言の辞書はまだ入れていない。

## まだ入っていないもの

- 3D（Three.js / React Three Fiber / Drei / GLTF）を使った部屋の再現と演出
- Geolocation / Google Maps を使った避難ルート
- 多言語の文言辞書（`Settings.locale` の受け口だけある）
- 顔・個人情報の自動検出（現在は送信前に手動で範囲を選択）
- 公開運用向けのユーザー認証と利用枠管理
