# 2026年9月14日 イラストと製品リンクの確認

台所・足元・沿岸避難の画像は既存の `actions/glass-film-v14.png` を絵柄の参照に使用。各画像は生成後に目視確認しました。差し替え前の候補はPRに含めず、現在使う画像を記録します。

生成方法：Codex内蔵の画像生成ツール（既存画像を絵柄参照にした編集モード）。

## v20 差し替え

### cooktop-storage-v20

出力: `public/illustrations/actions/cooktop-storage-v20.png`

```text
Landscape 3:2 Japanese hand-drawn anime educational illustration, matching the attached reference style: warm natural wooden interior, soft watercolor shading, crisp dark-brown outlines, realistic adult proportions, detailed casual clothing with a subtle stripe pattern, no text, no watermark. BEFORE an earthquake in an ordinary Japanese kitchen. An adult opens an UPPER kitchen cabinet above the countertop and clearly puts folded dishcloths and a small paper bag inside it, away from the gas stove. A deep lower drawer is also open with a kitchen-paper roll stored inside. Show the gas stove clearly on the other side of the counter, burners off, with the area immediately around it clear. The action must read as moving light combustible kitchen items into normal built-in upper cabinets or drawers, not a freestanding pantry. Natural hands and pose.
```

### cooktop-off-v20

出力: `public/illustrations/actions/cooktop-off-v20.png`

```text
Landscape 3:2 Japanese hand-drawn anime educational illustration, matching the attached reference style: warm natural wooden interior, soft watercolor shading, crisp dark-brown outlines, realistic adult proportions, detailed patterned casual clothing, no text, no watermark. AFTER earthquake shaking has stopped in a Japanese kitchen. The room visibly shows earthquake effects: some cabinet doors and drawers open, light containers, a towel and a few kitchen items fallen and scattered on the floor and counter, while a clear safe patch remains by the stove. A serious adult wearing sturdy closed shoes carefully looks down to check the floor and surrounding safety while extending one hand to turn the gas stove control knob OFF. Show a small visible burner flame just before it is extinguished so the action is unmistakable. The person approaches from the clear side, keeps balance, does not step on debris, and does not reach over hot cookware. No active shaking, no injury, no smile.
```

### coast-evacuate-v20

出力: `public/illustrations/actions/coast-evacuate-v20.png`

```text
Landscape 3:2 Japanese hand-drawn anime educational illustration matching the attached reference style: warm watercolor shading, crisp dark-brown outlines, realistic proportions, detailed varied outdoor clothing, no text, no watermark. After strong earthquake shaking has stopped in a coastal Japanese neighborhood, one adult and one upper-elementary child urgently evacuate on foot UPHILL AWAY FROM THE SEA. Sea and coastal houses are clearly behind and below them. Give the two people clearly DIFFERENT natural dynamic postures and stride phases: the adult is turning slightly to check and guide the child with one arm extended while moving uphill; the child leans forward in a brisk run, gripping one backpack strap. Both have serious focused expressions and securely fitted helmets. The adult carries a small cross-body emergency pouch; the child carries a compact practical backpack, neither overloaded. Natural varied clothing with patterns, seams and layers. No matching poses, no empty hands, no smile, no tsunami visible, no phone, no car.
```

3点とも生成後に目視し、指定した収納先、散乱した台所での安全確認、持ち物と異なる避難姿勢が描かれていることを確認しました。

### gas-shutoff-v21

出力: `public/illustrations/actions/gas-shutoff-v21.png`

```text
Use case: earthquake safety educational illustration for a Japanese web app. Create one landscape 3:2 Japanese hand-drawn anime illustration matching the attached reference image exactly in visual language: warm natural wooden interior, soft watercolor shading, crisp dark-brown outlines, realistic adult proportions, detailed varied casual clothing with seams and subtle pattern, serious focused expression, no text, no labels, no watermark. AFTER earthquake shaking has stopped in an ordinary Japanese kitchen. Some lightweight containers and kitchen items are visibly scattered, but there is a clear safe patch to stand. A responsible adult wearing sturdy closed shoes first checks the floor and surroundings, then carefully closes the clearly visible GAS SHUTOFF VALVE on the gas pipe beneath the counter beside the stove. The hand must clearly grip and rotate the valve handle to the closed position. The gas stove is visible nearby with every burner already off and no flame. Natural balanced posture, no reaching across hazards, no active shaking, no smoke, no injury, no smile. Make this visually distinct from turning off a stove knob: the focus is the separate gas pipe shutoff valve.
```

生成後に目視し、コンロのつまみではなく独立したガス管の元栓を閉めていること、火が消えていること、足元の散乱と安全な立ち位置が描かれていることを確認しました。

## floor-protection-v19

`public/illustrations/actions/floor-protection-v19.png`：地震後の散乱した床と、手元にあった履物で足を守る行動の例。靴を取りに破片の上を歩くことは勧めません。

## 防災説明の参照

- [東京消防庁・地震その時10のポイント](https://www.tfd.metro.tokyo.lg.jp/lfe/bou_topic/jisin/point10.html)：揺れが収まってから火元を確認し、室内の破片に注意。
- [東京消防庁・地震に対する10の備え](https://www.tfd.metro.tokyo.lg.jp/lfe/bou_topic/jisin/sonae10.html)：履物の備え。画像は履物が手元にある場合の例で、靴を取りに裸足で破片を渡ることは勧めません。
- [気象庁・津波から身を守る](https://www.jma.go.jp/jma/kishou/know/jishin/tsunami_bosai/index.html)：海の近くで強い揺れや長い揺れを感じたら、警報を待たず避難。

## Amazonの確認

2026年9月14日に検索結果と商品ページの名称・型番をブラウザーで照合。検索結果には無関係な広告が混ざるため、型番付き製品は以下の直接リンクに変更しました。価格・在庫・出品者は変動します。メーカー仕様のページも照合しました。

| 型番 | 商品ページ |
|---|---|
| TS-F001 | [Amazon](https://www.amazon.co.jp/dp/B07W1JQQC5) |
| KTB-30R | [Amazon](https://www.amazon.co.jp/dp/B0DF75BK4N) |
| TS-001N2 | [Amazon](https://www.amazon.co.jp/dp/B079VX74FP) |
| M6120 | [Amazon](https://www.amazon.co.jp/dp/B001NA0E2K) |
| M6130 | [Amazon](https://www.amazon.co.jp/dp/B0011EZ7U2) |

## 予想図の画風

- `room-style-reference.jpeg`：利用者提供の「部屋イラスト.jpeg」。生成時に絵柄のみ参照し、部屋の配置や物はコピーしない指示にしています。

## 落ち着いた配色と追加問題（v22）

- `aftermath-sample-v3.png`：元のサンプルの構図を保ち、青・ピンクを抑えてグレージュ・オリーブ・木の茶色へ変更。現在の代替表示に使用。
- `open-exit-v22.png`：揺れが収まったあと、室内からドアを開けて出口を確認する場面。
- `family-check-v22.png`：安全な場所から家族に声をかけ、返事を確かめる場面。
- `damaged-exit-v22.png`：傾いた家から離れ、開けた場所へ向かう場面。

追加3場面は既存の机の下のイラストを絵柄の参考にし、落ち着いた配色で生成。設問への割り当てと画像ファイルの存在は室内フローのテストで確認します。
