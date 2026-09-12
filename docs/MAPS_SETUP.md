# フェーズ2：モック版とAPI版

フェーズ1の `/test-room` にある固定データ / 実APIの分岐を参考に、フェーズ2の入口 `/evac` で明示的に選べるようにした。通常の初回はモック版。選択は同じタブ内で保持し、変更すると場所・経路・回答・歩行進捗をリセットする。キーを設定してもモック版は自動でAPI版には変わらない。

|  | モック版 | API版 |
|---|---|---|
| 直接開くURL | `/evac?mode=mock` | `/evac?mode=api` |
| 地図 | 練習用の模式図 | Google Mapsの2D道路地図 |
| 避難場所 | 固定のサンプル | 国土地理院の指定緊急避難場所、取得できなければPlacesの施設候補 |
| 経路・迂回 | 合成したサンプル経路 | Maps JSのRoutes Libraryで取得する徒歩ルート |
| Street View | 自作の風景イラストを地図と同時表示。外部リンクでサンプル座標周辺を開ける | 地図と同時に常時表示。開始地点・停止地点で更新 |
| キー | 不要。設定済みでもGoogle SDK・GSI・Routes APIは呼ばない | 地図は共通のブラウザキー1つ。AI解析は別途OpenAIキー |
| 通信失敗 | サンプルの体験を続けられる | 再試行・場所変更を案内。模式図や合成ルートへ自動で置き換えない |

どちらも途中の問題は練習用の想定。実在する危険の検出結果ではない。Street View画像はAIへ送信・加工・保存しない。

## キーを貼り付ける箇所

接続処理は実装済みで、コード変更は不要。Google Cloud側で請求先と使用APIを有効にしたキーを設定する。

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=取得したGoogle_Mapsのキー
```

- ローカル：`.env.local` の上記1項目に貼り付け、開発サーバーを再起動。
- Vercel：`jishingoto → Settings → Environment Variables` の同名項目に貼り付け、`Production` を対象に再デプロイ。`NEXT_PUBLIC_` はビルド時に埋め込まれる。
- `/evac?mode=api` を開いて体験する。未設定なら、キーの値を表示せず不足項目と手順を案内する。

## Google Cloud側の初回準備

| 有効にするAPI | 用途 | キー |
|---|---|---|
| Maps JavaScript API | 2D地図・Street View | ブラウザ用 |
| Geocoding API | 住所や駅名の検索 | ブラウザ用 |
| Places API (New) | 公的データで候補が得られない場合の施設検索 | ブラウザ用 |
| Routes API | 徒歩経路と現在地からの迂回 | 同じブラウザ用キー |

ブラウザ用キーのアプリケーション制限は「ウェブサイト」、API制限は上表の4つ。許可URL例：

```text
https://jishingoto.vercel.app/*
http://localhost:3000/*
http://127.0.0.1:3100/*
```

地図・徒歩経路・住所検索・施設検索・Street Viewで同じキーを使う。以前の `GOOGLE_MAPS_SERVER_KEY` は不要で、値が残っていても使用しない。Street View Static APIや旧Directions APIも不要。

**キーは1つでも、使うAPIの有効化は機能ごとに必要。** Maps JavaScript APIだけでは徒歩ルートを取得できない。Google Cloudの「APIとサービス → ライブラリ」でRoutes APIも有効にし、キーのAPI制限にも追加する。住所検索にはGeocoding API、施設候補の補助検索にはPlaces API (New)を有効にする。

ローカル用のキー設定はVercelへ自動で反映されない。公開版でも使う場合はVercelの環境変数にも登録する。

## 接続と動作確認

1. モック版で最後まで体験する。APIキーの有無に関係なく同じサンプルを使用する。
2. API版で地図をタップ、住所検索、または現在地から出発地点を選ぶ。
3. 候補の避難場所を選び、実際の徒歩ルートを取得する。1本だけの場合は1本で続行できる。
4. Street Viewと地図が上下に同時表示される。「周りを見渡す」で移動・回答・タイマーを止め、「体験に戻る」で同じ地点から回答を再開する。
5. 迂回・回答を終え、最後にまとめてふりかえる。結果にもモードを表示する。

入口の設定確認は `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` の有無だけを見る。サーバーの設定確認APIは呼ばない。値の存在はGoogle側の有効性や請求先設定の検証を意味しない。実接続は地図・検索・経路の取得時に行い、失敗は画面に表示する。

徒歩ルートは `google.maps.importLibrary("routes")` から `Route.computeRoutes()` を呼ぶ。`travelMode: "WALKING"`、`fields: ["path", "distanceMeters", "durationMillis", "legs"]` を指定し、距離・経路の座標列・移動時間を取得する。`durationMillis` は1000で割って秒へ変換する。代替ルートが1本も返らなくても元の1本で体験でき、迂回では停止地点をoriginとして経由地点を指定する。リクエストの待機は20秒で終了し、再試行を案内する。

旧 `POST /api/routes` と `GET /api/maps/status` は削除済み。RESTへブラウザキーを転送する処理や、サーバー用キーへのフォールバックはない。SDKの結果に有効な座標・距離・時間がなければ実道路の経路を作らない。

API版でも地図や撮影風景は現在の災害・通行可否を示すものではない。Street Viewに周辺画像がなければGoogleマップの外部リンクか判断に戻る操作を使える。

公式資料：[Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/get-api-key)、[Street View](https://developers.google.com/maps/documentation/javascript/streetview)、[Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)、[Routes Libraryの設定](https://developers.google.com/maps/documentation/javascript/routes/start)。

「地理データ＋AI」は東京・文京周辺と横浜駅周辺の収録データから注意候補を選ぶ。`OPENAI_API_KEY` の設定も必要。Googleキーだけで体験するときは「固定の練習問題」を選ぶ。データの更新方法と実装済みAPIは [PHASE2_AI_BACKEND.md](PHASE2_AI_BACKEND.md) を参照。
