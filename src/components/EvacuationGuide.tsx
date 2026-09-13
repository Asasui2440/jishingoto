import Image from "next/image";
import { Furigana } from "@/components/ui/Furigana";

export function EvacuationGuide() {
  return <section className="space-y-5 rounded-panel bg-primary-soft p-4">
    <h2 className="text-lg font-bold"><Furigana text="避難[ひなん]を判断[はんだん]するポイント" /></h2>
    <div>
      <h3 className="mb-3 text-lg font-bold"><Furigana text="いつ避難所[ひなんじょ]へ行く？" adult="避難先を選ぶ基準" /></h3>
      <Image src="/illustrations/actions/school-evacuation-v11.png" alt="ヘルメットを着用した親子が、真剣な表情で近所の小学校の避難所へ向かう様子" width={1536} height={1024} className="h-auto w-full rounded-field" />
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-relaxed">
        <li><Furigana text="建物が倒[たお]れそう、火が近い → まず危険[きけん]から離[はな]れ、安全な避難場所[ひなんばしょ]へ。" adult="倒壊や火災の危険がある場合は、まず安全を確保できる避難場所へ移動します。" /></li>
        <li><Furigana text="家で生活できない → 開いている避難所[ひなんじょ]や、安全な親戚の家などを確認[かくにん]しよう。" adult="自宅で生活を続けられない場合は、開設済みの避難所や安全な親族宅などを検討します。" /></li>
        <li><Furigana text="家が安全で、水・食料・トイレも確保[かくほ]できる → 自宅で過[す]ごす方法もある。自治体[じちたい]からの避難情報[ひなんじょうほう]も確認[かくにん]しよう。" adult="自宅の安全と水・食料・トイレを確保できる場合は、在宅避難も選択肢です。自治体の避難情報を確認してください。" /></li>
      </ol>
      <p className="mt-3 text-base font-bold leading-relaxed"><Furigana text="海の近くで強い揺[ゆ]れや長い揺[ゆ]れを感じたら、警報[けいほう]を待たず高い安全な場所へ。" adult="海の近くで強い揺れや長く続く揺れを感じたら、津波警報を待たず高台など安全な場所へ避難してください。" /></p>
      <p className="mt-3 text-base leading-relaxed"><Furigana text="安全に取り出せるなら、ヘルメットをかぶって頭を守ろう。探すために逃[に]げ遅[おく]れないようにしよう。" adult="安全に取り出せる場合はヘルメットで頭を保護します。探すために避難を遅らせないでください。" /></p>
    </div>
    <p className="text-xs text-ink-muted">説明のためのイラストです。</p>
    <a href="https://www.tfd.metro.tokyo.lg.jp/lfe/bou_topic/jisin/point10.html" target="_blank" rel="noopener noreferrer" className="block text-sm underline">参考：東京消防庁 地震その時10のポイント ↗</a>
  </section>;
}
