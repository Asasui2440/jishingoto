# バックエンド連携仕様

フロントエンド（このリポジトリ）とバックエンドのつなぎ方をまとめたもの。

**フロント側でさわるのは `src/lib/api.ts` の中身だけ。** 型とシグネチャは
すでに決まっているので、モックの中身を `fetch` に置き換えれば繋がる。
画面のコードは一切変更しなくていい。

---

## 1. 全体像

```
[ /camera ]  写真を撮る
     │
     ├─→ POST /blur-regions   … 顔・個人情報をぼかす場所を返す
     ↓
[ /privacy ] ぼかしを確認・追加
     ↓
[ /analyzing ]
     ├─→ POST /analyze        … 部屋の危険を検出する
     ↓
[ /risks ]   ユーザーが危険を確認・追加・削除
     ↓
     ├─→ POST /questions      … 確認した危険に応じた設問を返す
     ↓
[ /quiz ]    5問に回答（途中で結果は出さない）
     ↓
[ /result ]
     └─→ POST /aftermath      … 「もし地震がきたら」の予想図を生成
```

エンドポイントのパスは仮。実際のパスは `src/lib/api.ts` の中だけで決まるので、
バックエンド側の都合に合わせて自由に決めてよい。

---

## 2. 共通の型

TypeScript の定義は `src/lib/content.ts` と `src/lib/api.ts` が正。
JSON としては下記のとおり。

### RiskKind — 危険の種類

| 値 | 意味 | 画面での表示 |
|---|---|---|
| `"fall"` | 倒れてくる（家具など） | たおれるかも |
| `"break"` | 割れる（ガラスなど） | われるかも |
| `"block"` | 通路をふさぐ | ふさがるかも |

**この3種類は増やさないでほしい。** 画面の色分け・設問の紐づけ・
チェックリストの出し分けが、すべてこの3値に対応している。
増やす場合はフロント側の対応が必要。

### Risk — 危険ポイント

```jsonc
{
  "id": "bookshelf",      // 一意ならなんでもよい
  "name": "大きな本棚",     // 画面に出る名前。ふりがな記法が使える（後述）
  "kind": "fall",
  "confidence": 0.9,      // 0–1。省略可（ユーザーが自分で足したものは無し）
  "x": 16,                // 写真上の位置。％。左上が (0, 0)
  "y": 30,
  "confirmed": false      // 必ず false で返す（ユーザーが画面で選ぶ）
}
```

- `x` / `y` は **ピクセルではなく写真に対する％**。写真の表示サイズが端末で変わるため。
- `confirmed` はユーザーの操作で決まる値なので、**バックエンドからは常に `false`** で返す。

### Axis — リザルトの4軸

`"initial"`（初動たいおう）/ `"judgement"`（はんだん力）/
`"room"`（部屋のそなえ）/ `"evacuation"`（ひなん安全性）

### Choice — 選択肢

```jsonc
{
  "id": "cover",
  "label": "本棚からはなれて頭をまもる",     // 選択肢の見出し
  "detail": "ひくい姿勢をとって、かくれる",   // 補足の一行
  "safety": 0.95,                          // 0–1。この行動の安全度
  "explanation": [                          // 段落の配列。リザルトで出す
    "たおれてくるものから離れ、低い姿勢で頭を守るのは…",
    "机の下にもぐれるならなお安心。脚をしっかりつかんで…"
  ]
}
```

**`safety` は画面に数値としても帯としても出さない。** 使い道は2つだけ:

1. リザルトの4軸スコアの集計（軸ごとに平均して 0–5 に丸める）
2. 「できたこと」に載せるかの判定（`safety >= 0.7` のものだけ）

仕様の「正解をはっきり出すのは良くない」に沿って、
1問ごとの正誤は画面に出さない設計にしている。
**明らかな正解を1つだけ作るのではなく、0.1〜0.95 のグラデーションで付けてほしい。**

### Question — 設問

```jsonc
{
  "id": "q1",
  "axis": "initial",
  "riskKind": "fall",          // 省略可。省略すると「どの部屋でも共通の設問」
  "place": "大きな本棚",         // riskKind とセット。「きみの部屋の〇〇の話」に使う
  "category": "しゅんかん判断",   // 画面上部の小見出し
  "situation": "強いゆれがはじまり、背の高い本棚のそばにいます。",
  "highlight": {               // 省略可。写真に重ねる枠
    "x": 8, "y": 15, "w": 30, "h": 70,   // すべて％
    "label": "たおれそう！"
  },
  "seconds": 10,               // 制限時間。0 なら無制限
  "choices": [ /* Choice が3つ程度 */ ]
}
```

- 時間切れになると **最後の選択肢** が自動で選ばれる。
  そのため `choices` の最後には、いちばん安全度の低いものを置いてほしい。
- `seconds` は 10〜12 を想定。0 にすると時間制限なし（じっくり考える設問向け）。

---

## 3. エンドポイント

### 3-1. ぼかし領域の検出

```
POST /blur-regions
Content-Type: multipart/form-data
```

| | |
|---|---|
| 呼ばれる場所 | `/camera` で撮影した直後 |
| フロントの関数 | `detectBlurRegions(photo?: Blob)` |
| リクエスト | 撮影した写真（JPEG） |

**レスポンス**

```jsonc
[
  { "id": "b1", "x": 18, "y": 14, "w": 20, "h": 20, "shape": "circle" },
  { "id": "b2", "x": 52, "y": 62, "w": 26, "h": 15, "shape": "rect" }
]
```

- `x` / `y` / `w` / `h` はすべて写真に対する**％**。
- `shape` は `"circle"`（顔向き）か `"rect"`（書類・郵便物向け）。
- ユーザーは画面上でタップして自分で追加・削除できる。
  そのため **完璧でなくてよい**。取りこぼしよりは、多めに返すほうが安全側。

### 3-2. 部屋の解析

```
POST /analyze
Content-Type: multipart/form-data
```

| | |
|---|---|
| 呼ばれる場所 | `/analyzing`（ローディング画面） |
| フロントの関数 | `analyzeRoom(photo?: Blob)` |
| リクエスト | 写真（ぼかし適用後を送る想定） |

**レスポンス**: `Risk[]`（2〜5件程度）

```jsonc
[
  { "id": "bookshelf", "name": "大きな本棚", "kind": "fall",
    "confidence": 0.9, "x": 16, "y": 30, "confirmed": false },
  { "id": "window", "name": "まどガラス", "kind": "break",
    "confidence": 0.7, "x": 50, "y": 20, "confirmed": false }
]
```

- **多すぎると画面が埋まる。** 3〜4件を目安に、確信度の高い順で返してほしい。
- ローディング画面は約4.2秒の演出を入れているので、
  そのくらいまでの応答時間なら体感の待ちは増えない。

### 3-3. 設問の取得

```
POST /questions
Content-Type: application/json
```

| | |
|---|---|
| 呼ばれる場所 | `/quiz` に入った直後 |
| フロントの関数 | `fetchQuestions(risks: Risk[])` |

**リクエスト**: ユーザーが確認・編集したあとの `Risk[]`（`confirmed` が入っている）

**レスポンス**: `Question[]`（5問前後）

出題の考えかたは次のとおり。フロントのモックも同じ順で並べている。

1. `confirmed: true` の危険と同じ `riskKind` を持つ設問を先に置く
   → 「自分の部屋で見つけた場所が、そのまま問題になる」体験にするため
2. そのあとに `riskKind` を持たない共通の設問を置く
3. 確認された危険がひとつもない場合は、`riskKind` 付きの設問を一通り出す

**サーバー側で出題順を決めきって返してほしい。** フロントは並べ替えをしない。

### 3-4. 「もし地震がきたら」の予想図

```
POST /api/room/aftermath
Content-Type: application/json
```

| | |
|---|---|
| 呼ばれる場所 | `/privacy` の OK 後、マスク済み画像の確定直後（解析と並行） |
| フロントの関数 | `prepareRoom(photo)` → `generateAftermath(photo)` |

**リクエスト**: `{ "image": "data:image/jpeg;base64,..." }`（マスク済み写真のみ）。危険候補の解析完了を待たない。

**レスポンス**

```jsonc
{
  "imageUrl": "data:image/png;base64,..."
}
```

- `imageUrl` は写真から想像した地震後の一例。実際の被害を予測・断定しない。
  縦横比は **4:3** で表示する（`object-cover` なので多少ずれても破綻はしない）。
- API失敗時はフロントが `imageUrl: null` に変換し、元写真へのマーカー表示で代用する。
- `events` はフロントで最新の危険候補から組み立てる。画像の描写を説明するものではなく、別途考えられる危険の説明。
- 写真をキーとして生成中のPromise・完了画像をメモリ内で共有し、候補の修正・削除や結果画面の表示で再生成しない。別写真・マスク変更・セッションリセット時は新規生成。
- 生成中はスピナーを表示。API自体の生成時間は残るが、解析待ち時間をなくす。
- 画像編集APIの仕様参考：[OpenAI公式ドキュメント](https://developers.openai.com/api/docs/guides/image-generation)。

---

## 4. ふりがな記法

画面に出す**日本語のテキストはすべて**、この記法が使える。

```
漢字[かんじ]
```

- `[ ]` の直前の**漢字の連なり**が、ふりがなの土台になる。
  `を始[はじ]める` と書けば「始」にだけ「はじ」が振られる。
- ユーザーが設定でふりがなを ON にしたときだけ表示される。OFF なら読みは消える。
- 対象は `Risk.name` / `Question.situation` / `Choice.label` / `Choice.detail` /
  `Choice.explanation` / `Aftermath.events[].text` など、画面に出る文字列すべて。

```jsonc
// 例
{ "name": "大[おお]きな本棚[ほんだな]" }
{ "situation": "強[つよ]いゆれがはじまり、背[せ]の高[たか]い本棚[ほんだな]のそばにいます。" }
```

記法を使わずに普通の日本語を返しても動く（ふりがなが出ないだけ）。

---

## 5. つなぎこみの手順

`src/lib/api.ts` の各関数の中身を差し替えるだけ。

```ts
// before（モック）
export async function analyzeRoom(_photo?: Blob): Promise<Risk[]> {
  await wait(400);
  return DETECTED_RISKS.map((r) => ({ ...r }));
}

// after
export async function analyzeRoom(photo?: Blob): Promise<Risk[]> {
  if (!photo) return DETECTED_RISKS.map((r) => ({ ...r })); // 写真なしのときはサンプルのまま
  const body = new FormData();
  body.append("photo", photo);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analyze`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
}
```

環境変数は `.env.local` に置く（`.gitignore` 済み）。

```
NEXT_PUBLIC_API_BASE=https://api.example.com
```

Vercel にデプロイする場合は、Vercel の Settings → Environment Variables にも同じものを入れる。

### CORS

フロント（Vercel）とバックエンド（Google Cloud）でオリジンが分かれるので、
バックエンド側で CORS を許可する必要がある。

```
Access-Control-Allow-Origin: https://<デプロイ先>.vercel.app
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

プレビューデプロイごとに URL が変わるので、開発中は `*` でもよい。

### エラーのとき

いまのフロントは **エラー処理を入れていない**（モックが失敗しないため）。
つなぎこみのときに、各画面で失敗時の表示を足す必要がある。

- `/analyzing` と `/quiz` … 失敗したら固定データにフォールバックするのが無難
- `/result` の予想図 … `imageUrl: null` を返せば自動でマーカー表示に落ちる

---

## 6. 注意点

- **写真は OpenAI API へ送信する。** ブラウザで縮小し、プライバシー確認画面で
  指定した領域を画像データ自体からマスクしてから、解析と予想図生成に使用する。
- **写真は保存しない。** 写真は `sessionStorage` の対象外で、画面を閉じると破棄される。
  そのほかの体験状態は `sessionStorage`、表示設定は `localStorage` に入る。
  ユーザー登録や履歴を作るなら、`src/lib/session.tsx` の設計から見直しが必要。
- **`confirmed` はユーザーのもの。** 解析結果をそのまま確定にせず、
  必ずユーザーが画面で選ぶ設計にしている。
