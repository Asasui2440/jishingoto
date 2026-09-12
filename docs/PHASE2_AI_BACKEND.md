# フェーズ2：地域限定の地理データ＋AI解析

地理データの取り込み、AIによる注意候補の選定、出題、最後の振り返りまで実装済み。Google Mapsは人が地図・Street Viewを見るために使用し、AIには別途取得した国土地理院の地形分類だけを渡す。

## 最初に使うデータと対応範囲

[国土地理院の地形分類](https://www.gsi.go.jp/bousaichiri/lfc_index.html)を採用した。自然地形の分類・成り立ち・一般的な災害リスクを含み、斜面、低地、液状化などを考える根拠になる。[公式GeoJSONタイル](https://github.com/gsi-cyberjapan/experimental_landformclassification)の詳細形状があるズーム14を利用している。

| 地域ID | 画面の名称 | 開始地点の緯度・経度 | 収録範囲 |
|---|---|---|---|
| `tokyo-bunkyo` | 東京・文京周辺 | 35.7186, 139.7237 | z14のx14550–14551、y6448–6449 |
| `kanagawa-yokohama` | 神奈川・横浜駅周辺 | 35.4658, 139.6223 | z14のx14546–14547、y6462–6463 |

合計8タイル、353地物、約964KBのJSON。各地域は連続する4タイルの長方形で、東京都・神奈川県・各自治体の全域を収録したものではない。APIが返す`bounds`が実際の利用可能範囲。経路全体が同じ収録地域に入っている必要があり、部分対応での解析は行わない。

現状は**地形分類のみ**。建物の高さ・築年、道路幅、塀の存在、実際の被害、通行止めは分からない。PLATEAUや自治体の道路・土砂災害データはまだ取り込んでいない。これらは出典と利用条件を確認したうえで追加できる。

### 取り込みと更新

```sh
python3 scripts/import-evac-geo.py
```

Python標準ライブラリだけを使用し、公式タイルと分類定義を取得して`src/data/evac-geo/regions.json`を生成する。外部JavaScriptは実行せず、分類表の配列だけを読み取る。新地域はスクリプトの地域定義へ連続するタイル座標を追加する。

保存内容：地物ID、分類コード、分類名、成り立ち、原典のリスク説明、ポリゴン、境界、許容する出題観点、取得日時、タイルURL・SHA-256、データ版。`downloadedAt`は取得日であり現地調査日ではない。原典の更新日は特定できないため`sourceUpdatedAt:null`。

画面と結果に出典を表示する。データを加工して使っていることと利用条件は[国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)を参照。

## キー設定

既存の`.env.local`へ設定し、開発サーバーを再起動する。

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=Googleのブラウザ用キー
OPENAI_API_KEY=OpenAIのサーバー用キー
EVAC_AI_MODEL=gpt-4.1-mini
```

`EVAC_AI_MODEL`は省略可。GoogleキーとAIキーは別。Phase1も`OPENAI_API_KEY`を共用するが、フェーズ2のモデルは上記変数で独立して選べる。OpenAIキーに`NEXT_PUBLIC_`を付けない。公開版はVercelにも設定して再デプロイする。

AIキーなしでも「モック版」または「API版 → 固定の練習問題」で体験できる。地理データ＋AIを選んでキーがなければ設定待ちを案内し、固定問題へは利用者が明示的に切り替える。

## 処理の流れ

1. ブラウザでGoogleの徒歩ルートを取得する。
2. 候補経路をまとめて`POST /api/evac/assess`へ送り、AIを使わずに収録地形・距離・時間を決定論的に比較する。
3. 選択した経路を自前バックエンドへ送り、AI出題候補を解析する。
4. サーバーで対応範囲を検証する。経路を約20m間隔で調べ、50m以内の地形ポリゴンを最大32地物まで抽出する。ポリゴンの穴も考慮する。
5. OpenAI Responses APIへ独立した地形の属性を送り、0〜3件の注意候補と観点をAIに選ばせる。分類ごとの候補観点は前処理で制限するが、どの地物を採用するかはAIが決める。
6. Structured OutputsのJSONをサーバーで再検証する。存在する地物ID・許容観点・文字数・件数・重複を確認する。
7. サーバーが経路上の停止座標と割合`t`、残距離・残時間を計算する。AIに座標を作らせない。35m以内の候補は重複としてまとめる。
8. 検証済みの観点に固定の学習用3択を割り当てる。注意候補が0件でも架空の問題を足さない。
9. 全問題が終わった結果画面で、行動、利点・注意点、地理データの分類、AIの補足、不明点、出典を表示する。点数・安全度・明確な正誤は表示しない。

AIへの入力は`featureId / code / classification / formation / sourceRiskDescription / availableCategories / geographicBounds`のみ。Googleの地図・Street View画像、Googleの説明文、経路座標列、ユーザーの住所はOpenAIへ送らない。経路は自前サーバー内での地物抽出に使用する。Responses APIには`store:false`を指定している。自前サーバーで経路や解析結果をDBへ保存する処理はない。

途中の迂回では、その地点から新経路を取得して再解析する。体験済みの地物は観点が異なっても除外し、1体験の問題は最大3件。範囲外や解析失敗の場合は現在の問題に留まり、再試行または別の行動を選べる。

## API契約

### `POST /api/evac/assess`

Google Routes Libraryから得た1〜4本の候補をまとめて送る。座標は2〜2000点、経路は20km以内、リクエストは320KBまで。サーバーは約20m間隔で地形分類と照合する。

```json
{
  "routes": [
    {
      "id": "short-820-0",
      "path": [{"lat":35.7186,"lng":139.7237},{"lat":35.711,"lng":139.7237}],
      "distanceM": 820,
      "durationS": 690
    }
  ]
}
```

レスポンスの`comparisonScore`と`rank`はtraining-v1をGoogle候補へ適用した教育用の比較値で、安全度・生存率・実被害の予測ではない。到達30点、地形20点、距離10点、Google所要時間10点、未収録の道路幅・建物項目を暫定15点として比較する。画面には数値を出さず、候補内順位と根拠だけを表示する。

地形の各区間長は独立集計なので合計しない。収録範囲外でもHTTP 200で`coverage:"outside"`を返し、Googleの距離・時間による比較は継続する。API失敗時もGoogle経路は破棄せず、地形比較が未取得であることを明示する。レスポンスは`Cache-Control:no-store`。

### `GET /api/evac/regions`

```ts
type Response = {
  aiConfigured: boolean;
  source: { name: string; url: string; licenseUrl: string };
  regions: {
    id: string; name: string; center: {lat:number;lng:number};
    bounds: number[]; // [西端経度,南端緯度,東端経度,北端緯度]
    version: string; downloadedAt: string; featureCount: number;
  }[];
};
```

キーの値や全地物データは返さない。`aiConfigured`は設定の有無であり、課金枠やキーの有効性の接続試験ではない。

### `POST /api/evac/analyze`

同じオリジンからJSONで送る。非同期ジョブやポーリングは使用せず、1リクエストで結果を返す。

```json
{
  "route": {
    "id": "route-1",
    "path": [
      {"lat":35.7186,"lng":139.7237},
      {"lat":35.711,"lng":139.7237}
    ],
    "durationS": 480
  },
  "excludedEventIds": []
}
```

入力上限：160KB、座標2〜2000点、経路20km、所要時間24時間、除外ID30件。数値は有限値のみ。エンドポイントはOriginが付く場合に同一オリジンを検証する。ユーザー認証・ユーザー別課金枠・耐久性のあるレート制限はまだ実装していない。

```ts
type Response = {
  source: "geo-ai";
  regionIds: string[];
  points: {
    id: string; // geo:{featureId}:{category}
    t: number;
    position: {lat:number;lng:number};
    heading: number; remainingM: number; remainingS: number;
    event: HazardEvent; // kind: "terrain"、3択とevidenceを含む
  }[];
  note: string;
};
```

`event.evidence`：`featureId / code / classification / regionId / datasetVersion / downloadedAt / sourceName / sourceUrl / aiReason / uncertainties`。AIが返すURLは使わず、サーバー側の出典を使う。pointsは経路順。残時間はGoogleの経路所要時間と進捗割合から計算する。

| HTTP | code | 意味 |
|---|---|---|
| 400 | `invalid_request`, `route_too_long` | 入力不正・上限超過 |
| 403 | `invalid_origin` | 別オリジンからの要求 |
| 413 | `request_too_large` | リクエストサイズ超過 |
| 422 | `outside_coverage` | 経路の一部または全部が収録範囲外 |
| 503 | `ai_not_configured` | AIキー未設定 |
| 502 | `analysis_timeout`, `ai_unavailable`, `invalid_analysis`, `ungrounded_analysis`, `analysis_failed` | 通信・モデル・結果の検証失敗 |
| 499 | `cancelled` | クライアントによる中止 |

エラーは`{code,message}`。上流の応答本文や秘密情報は返さない。候補0件はHTTP200であり安全確認を意味しない。HTTP応答は`Cache-Control:no-store`。

時間制限：OpenAI35秒、フロント45秒、Vercel関数60秒。経路変更・画面離脱で初期解析を中止し、古い応答は適用しない。

## 画面と接続箇所

- `/evac`：モック／API、AI／固定問題、対応地域を選ぶ。
- `/evac/routes`：AI解析前の問題数は「AI解析後に表示」。
- `/evac/walk`：AI解析中・失敗・再試行・明示的な固定問題への切り替え。上にStreet View、下に2D地図を常時表示する。
- `/evac/report`：動的な問題と根拠を復元して最後にまとめる。

Street Viewは開始・停止地点で更新し、44msごとの高速移動中は直前の停止地点を表示する。ビューアを再利用する。「周りを見渡す」でコマとタイマーを止める。画像がない場合も地図で継続できる。モックは自作イラストを使い、外部通信しない。

主な実装：`scripts/import-evac-geo.py`、`src/lib/server/geo-analysis.ts`、`src/lib/geo-events.ts`、`src/lib/geo-types.ts`、`src/app/api/evac/`、`src/lib/evac-api.ts`、`src/lib/use-evac-walk.ts`、`src/components/evac/GeoAnalysisSettings.tsx`。

## 検証

```sh
npm run lint
npx tsc --noEmit
node --test tests/geo-analysis.test.cjs tests/evac-map.test.cjs tests/room-flow.test.cjs
npm run build
```

実際のGSIデータ、範囲外、ポリゴンの穴、入力上限、AI入力の分離、存在しない地物、重複、候補0件、キー未設定、プロバイダー失敗、HTTPエラーを自動テストする。OpenAI応答は注入したスタブを利用するため、実API接続の確認には有効な`OPENAI_API_KEY`が必要。

公式仕様：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[gpt-4.1-mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[Google Maps Street View](https://developers.google.com/maps/documentation/javascript/streetview)。
