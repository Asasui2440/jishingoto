import type { Question } from "./content";

const sources = [{ title: "東京消防庁：地震 その時10のポイント", url: "https://www.tfd.metro.tokyo.lg.jp/lfe/bou_topic/jisin/point10.html" }];

/** 写真に写った物を断定せず、揺れの後の条件を示して出題する。 */
export const AFTER_SHAKING_QUESTIONS: Question[] = [
  {
    id: "after-open-exit", axis: "evacuation", category: "出口を確かめる", seconds: 12,
    situation: "揺れが収まりました。足元を確かめ、ドアまで安全に近づけます。次にどうする？",
    adultSituation: "揺れが収まり、ドアまで安全に近づけることを確認しました。次にどのように行動しますか。",
    choices: [
      { id: "open-exit", label: "ドアを開け、出口を確かめる", detail: "あわてて外へ飛び出さない", safety: 0.95, explanation: ["揺れが収まったら、足元や周りを確かめてからドアを開けよう。外へ飛び出さず、必要な時に逃げられる道を確かめることが大切だよ。"] },
      { id: "rush-through-exit", label: "ドアを開け、外へ走り出す", detail: "外の様子は見ずに進む", safety: 0.2, explanation: ["外でも窓ガラスや看板などが落ちてくることがあるよ。出口を開けても、あわてて飛び出さないようにしよう。"] },
      { id: "ignore-exit", label: "ドアが開くかは確かめずにおく", detail: "逃げる必要が出た時に考える", safety: 0.4, explanation: ["後で逃げようとしても、ドアが開かないことがあるよ。安全に近づけるうちに、出口を確かめよう。"] },
    ], sources,
  },
  {
    id: "after-family-check", axis: "judgement", category: "家族の様子を確かめる", seconds: 12,
    situation: "揺れが収まり、自分の周りの安全を確かめました。同じ家にいる家族の様子が分かりません。どうする？",
    adultSituation: "揺れが収まり、自身と周囲の安全を確認しました。同じ家にいる家族の安否が分かりません。どのように確認しますか。",
    choices: [
      { id: "check-family", label: "声をかけ、けががないか確かめる", detail: "物が散らばる所には無理に入らない", safety: 0.95, explanation: ["自分の安全を確かめたら、家族に声をかけてけががないか確認しよう。助けが必要でも、一人で重い家具を動かさず、周りの人に知らせよう。"] },
      { id: "run-to-family", label: "足元を見ずに家族を探して走る", detail: "急いで全部の部屋へ行く", safety: 0.2, explanation: ["床の破片や倒れた家具でけがをすることがあるよ。声をかけ、移動する時は足元と通り道を確かめよう。"] },
      { id: "assume-family", label: "返事がなくても無事だと思って待つ", detail: "家族の様子は確かめない", safety: 0.4, explanation: ["助けが必要な人がいるかもしれないよ。自分の安全を守りながら声をかけ、返事がなければ周りの人に知らせよう。"] },
    ], sources,
  },
];
