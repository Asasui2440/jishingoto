# 行動の振り返りイラスト

imagegenスキル・内蔵image_genで各場面を別々に生成。確認後960×640 WebPへ軽量化。
毎回の生成やアプリのOpenAI API呼び出しは不要。選んだ行動の再現ではなく、推奨行動の例として表示。
火の始末の問題は頭を守る画像に専用の見出し・タイミングを付け、揺れの最中の行動に限定。

## 保存先

- `public/illustrations/review/shelter.webp`
- `public/illustrations/review/protect-head.webp`
- `public/illustrations/review/safe-exit.webp`
- `public/illustrations/review/check-information.webp`

## 最終プロンプト（共通部分＋各場面）

Use case: illustration-story. Asset: earthquake learning mobile app feedback illustration, landscape 3:2. Friendly Japanese anime editorial style, clean rounded outlines, soft warm white and wood colors, teal and yellow accents. One young person with short dark hair wearing yellow top, anatomically natural, clear pose readable on a small screen. Sparse room details. No text, lettering, logos, watermark, injuries or blood. Depict ONLY the recommended safe action. 

### shelter

During shaking: person crouched fully under a sturdy wooden table, head and body below table top, one forearm protecting head and neck and other hand gripping a table leg. Open side view makes protective position unambiguous. No objects on table, no windows or tall furniture near the person.

### protect-head

During shaking: person crouching low on clear floor, both forearms protecting head and neck. A bookshelf and window are far away in the background with clearly visible open space separating the person from these hazards. Person is NOT holding furniture, NOT running, NOT leaning against glass. Calm purposeful face.

### safe-exit

After shaking has stopped: person wearing closed-toe sturdy sneakers and holding a flashlight, checking a clear floor path to an open interior door. A few small broken pieces lie well off to the side and do not touch shoes or the walking path. Not handling debris, not climbing over furniture, no motion lines. Emphasize protecting feet and looking at path before walking.

### check-information

After shaking has stopped: person sitting calmly beside a trusted adult in teal, looking together at a smartphone with a simple neutral weather/earthquake information interface drawn with abstract blocks and a small map, NO readable text or logos. Quiet uncluttered room. Emphasize checking information together instead of immediately sharing a frightening rumor. No disaster in background.

