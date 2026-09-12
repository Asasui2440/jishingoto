# フェーズ2：2D地図で体験する避難ルート

地図上のコマを進め、練習用の判断ポイントで行動を選ぶ。実際に外を歩く必要はなく、GPSの連続追跡はしない。Street Viewと地図を同時に表示し、開始地点・停止地点で周囲を確認できる。地図・街路画像をAIに送る処理はない。

## 画面と動作

| パス | 内容 |
|---|---|
| `/evac` | 住所・現在地・地図タップから出発点を指定し、避難場所を選ぶ |
| `/evac/routes` | 候補経路を比較し（APIが1本だけ返す場合も続行可能）、考える時間（10秒・20秒・なし）を設定する |
| `/evac/walk` | Street Viewと2D地図を同時表示。番号の地点で停止して判断する |
| `/evac/report` | 全地点の判断後、通った道と行動をまとめて振り返る |

- 地図には予定の経路を破線、通った道を濃い実線、現在地を黄色の矢印で表示する。
- 「コマを進める」で自動進行。「一時停止」と「次の判断ポイントへ」も利用できる。早送りでも未回答の地点を飛ばさない。
- 固定問題では塀・落下物・通行止め、地理データ＋AIでは地形に基づく想定と3択を表示する。自作の想定イラストを開いて状況を確認できる。
- API版は上にStreet View、下に地図を常時表示する。開始地点と停止地点で風景を更新し、高速移動中は直前の停止地点を表示する。モック版は自作の風景イラストと模式図を表示する。「周りを見渡す」で移動・回答・タイマーを停止し、「体験に戻る」で回答を再開する。
- 時間切れでも自動で行動を選ばない。本人が選び、時間を過ぎたことだけ記録する。
- 選択直後は記録または経路変更の通知だけ。解説・利点・注意点は最後の画面にまとめる。点数、安全度、正誤判定は表示しない。
- 迂回は現在地から引き直す。完了済みのシナリオは再出題せず、最初の経路を含め1体験で最大3問を扱う。AI候補が0件でも補充しない。
- 実経路の迂回取得に失敗したら、その地点に留めて再試行か別の選択を案内する。無関係な別経路へ飛ばさない。
- レポートの番号をタップすると、対応する行動の記録が開く。最後に平常時に確かめたいことをひとつ選ぶ。
- リロードしても同じタブでは進捗を復元する。新しい体験を始めると前の回答・進捗を消す。

## 地図データと表示の区別

入口でAPI版を選び、キーを設定した場合は Google Maps の2D道路地図を使用する。地図自体のStreet Viewと地図種別切り替えのコントロールは無効。独立したStreet Viewビューアを地図の上に常時表示し、開始地点・停止地点で位置を更新する。地図の帰属表示の上に操作パネルを置かない。

モック版では「模式図・練習用」の図と合成ルートを使用する。キーが設定済みでも外部APIは呼ばない。API版の設定不足は入口で案内し、地図・経路の通信失敗はエラーと再試行を表示する。模式図や合成ルートへ自動で置き換えない。

API版の避難場所は国土地理院の指定緊急避難場所データ（地震）を優先し、取得できなければPlacesの施設候補を使用する。デモ候補はモック版だけで使用する。出典は各カードで表示する。

API版の経路はMaps JSのRoutes Libraryに統一する。地図と同じブラウザキーで `Route.computeRoutes()` を呼び、サーバー用キーは不要。旧Directionsへのフォールバックはない。キーの設定方法は [MAPS_SETUP.md](MAPS_SETUP.md) と `.env.example` を参照。

地図の番号は練習用の配置であり、現地の被害や道路の安全性を判定したものではない。実際の避難時に使うナビゲーションではないことを画面で伝える。

## バックエンドとの境界

既存の `src/lib/evac-api.ts` を差し替え窓口とする。

```ts
fetchShelters(near: LatLng, mode: "mock" | "api"): Promise<Shelter[]>
fetchRoutes(home: LatLng, shelter: Shelter, mode: "mock" | "api"): Promise<RouteOption[]>
fetchDetourFrom(from: LatLng, shelter: Shelter, mode: "mock" | "api"): Promise<RouteOption | null>
fetchDecisionPoints(route: RouteOption, options?: {source: "geo-ai" | "sample"; signal?: AbortSignal; excludedEventIds?: string[]; maxPoints?: number}): Promise<DecisionPoint[]>
```

- `RouteOption.path` は出発点から目的地まで順に並んだ座標列。迂回路の先頭は現在地に接続すること。
- `demo: true` は合成した練習用の経路を示す。デモの迂回も同じ地点から合成し、実道路として扱わない。
- `DecisionPoint` は経路上の割合 `t`（0〜1）、座標、イベントを含む。実被害の観測として扱わない。
- `fetchDecisionPoints` は指定したsourceに従い、固定問題または `/api/evac/analyze` の解析結果を返す。国土地理院の地形分類を東京・文京周辺と横浜駅周辺に収録済み。AI失敗時は再試行または明示的な固定問題への切り替えを案内する。実装・API契約は [PHASE2_AI_BACKEND.md](PHASE2_AI_BACKEND.md) を参照。

## ローカル状態・集計

`jishingoto.evac.v2` / `sessionStorage` に出発点、避難場所、経路、選択、進捗を保持する。画像は保存しない。

- `walk: { routeId, steps, index } | null`：現在の経路、迂回前を含む地点列、到達位置。
- `EvacDecision.position`：判断した座標。旧データには無いことがある。
- `timedOut`：制限時間を過ぎてから回答したか。
- `WalkStep.travelSeconds`：前地点からの想定移動時間。移動距離と時間は到達済みの部分から集計する。
- 迂回の所要時間は新しい経路に含める。従来の固定追加時間を重ねて加算しない。待つ等の行動に伴う追加時間は別に加算する。

## 主なファイル

| ファイル | 役割 |
|---|---|
| `components/evac/EvacMap.tsx` | Googleの2D地図／模式図、現在地・軌跡・判断番号 |
| `components/evac/RouteLegend.tsx` | 予定と実際に通った道の凡例 |
| `components/evac/StreetViewPanel.tsx` | 停止地点のStreet View常時表示・モック風景・画像なし時の案内 |
| `components/evac/EventSheet.tsx` | 3択・制限時間・想定イラスト |
| `lib/use-evac-walk.ts` | 進行・停止・選択・迂回取得と保存 |
| `lib/evac-walk.ts` | 早送りの停止位置、迂回時の履歴連結、距離集計 |
| `lib/evac-api.ts` | 地点／経路データの取得、曲がり角を含む歩行地点の生成 |
| `lib/evac.ts` | 保存状態・所要時間集計 |

検証：`node --test tests/evac-map.test.cjs`、`npm run lint`、`npm run build`。

## Street Viewの扱い

- API版の歩行画面でSDKを読み込み、地図と風景を同時表示する。`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` を地図と共用し、追加の専用キーは不要。
- 開始地点・停止地点から60m以内の最寄りの屋外パノラマを検索する。表示される撮影位置と判断地点は厳密には一致しない。
- モック版は自作の街路イラストを表示し、利用者が外部リンクを押した場合だけサンプル座標周辺のGoogleマップを開く。
- 画像なし・読み込み失敗時も地図は表示を続ける。再試行、Googleマップへの外部リンク、問題の回答を利用できる。画面内の取得は12秒で待機を切り上げる。
- 住所・撮影日・Googleの帰属表示を残し、損壊表現や危険マーカーは重ねない。
- ビューアは停止地点が変わっても再利用し、コマの44ms間隔の移動ごとには画像を取得しない。
- 画像を保存・解析・AI送信しない。パノラマIDは表示中だけ使用し、sessionStorageへ保存しない。
- 外部リンクは `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=緯度,経度` の公式Maps URLs形式。APIキーは含めない。

## バージョン選択

`/evac` の入口でモック版/API版を選ぶ。同じタブ内で保持し、変更すると場所・ルート・回答・進捗をリセットする。各画面で選択中のバージョンを表示する。直接共有できるURLは `/evac?mode=mock` と `/evac?mode=api`。

フェーズ1の `/test-room` のfixture/liveの分岐を参考に、`fetchShelters`・`fetchRoutes`・`fetchDetourFrom` にモードを渡す。取得した結果の形は共通なので地図・問題・結果のUIは共用する。

地図表示に必要な設定は `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`。AIで地点を選ぶ場合はサーバーの `OPENAI_API_KEY` も必要。キーの入力は `.env.local` またはVercelの環境変数。Maps JavaScript API・Routes API・Geocoding API・Places API (New)を有効にした同じキーを共用する。入力先・API有効化・再デプロイ手順は [MAPS_SETUP.md](MAPS_SETUP.md) に記載。

経路取得のSDK境界は `src/lib/google-routes.ts`。徒歩モードと取得フィールドを固定し、SDKの`path`を緯度経度オブジェクトへ複製、`durationMillis`を秒へ変換する。外部API失敗・20秒のタイムアウトは再試行を案内する。モック版からこのSDK境界は呼ばない。旧`/api/routes`・`/api/maps/status`は使用しないため削除した。


## フェーズ1からの連続体験

ホームで体験の流れを示し、フェーズ1の結果の最後から「避難ルートへ進む（フェーズ2）」で `/evac?from=room` へ進む。シェア画面からも同じ操作ができる。シェアは任意で、部屋の結果を見たあと直接フェーズ2へ進める。

- `EvacSession.roomFinishedAt` に部屋の完了時刻を保存し、現在の `Session.finishedAt` と一致した場合だけ連続体験として表示する。写真や解析データを別APIへ送る処理は追加しない。
- 同じ部屋の結果から戻った場合は屋外の記録を維持する。新しい部屋の体験から進んだ場合は、前の屋外体験を初期化する。
- 地図のモード変更・経路の選び直しでも部屋との紐づけは維持する。部屋の回答とチェックリストは元のセッションに残す。
- フェーズ2の入口と最後のレポートに、部屋・屋外で体験した場面数と「部屋の結果を見返す」を表示する。点数を合算しない。
- ホームの「避難ルートから体験する」は `/evac?from=standalone`。部屋との紐づけを外し、フェーズ2だけでも体験できる。
- フェーズ1を終えていないタブや、別の部屋を体験し直した場合に、古い部屋の結果を連続体験として表示しない。

表示：`src/components/evac/RoomConnectionSummary.tsx`。状態管理：`src/lib/evac.ts`。


## 移動中の地図表示

Google Mapsのピンと予定経路はIDごとに保持し、変わった属性だけ更新する。コマは同じMarkerの`setPosition`、通った道は同じPolylineの`setPath`で更新する。移動中に線やピンを削除・再作成しない。画角の調整は場所・経路の変更時だけ行い、利用者のズームを移動ごとに戻さない。Street Viewは読込中・成功・失敗で高さを220pxに固定し、読込表示によって下の地図が上下しないようにする。
