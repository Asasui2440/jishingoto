import { DetailSheet } from "@/components/ui/DetailSheet";
import Image from "next/image";
import { Furigana } from "@/components/ui/Furigana";

export function EvacuationGuide() {
  return <section className="space-y-3 rounded-panel bg-secondary-soft p-4">
    <h2 className="text-lg font-bold"><Furigana text="避難[ひなん]を判断[はんだん]するポイント" /></h2>
    <div>
      <Image src="/illustrations/textbook/actions/school-evacuation-v2.webp" alt="ヘルメットを着用した親子が、真剣な表情で近所の小学校の避難所へ向かう様子" width={1536} height={1024} className="mx-auto h-auto max-h-56 w-auto max-w-[88%] rounded-field object-contain" />
      <p className="my-3 text-sm font-bold text-secondary-ink"><Furigana text="家[いえ]の安全[あんぜん]と、生活[せいかつ]できるかを確認[かくにん]しよう。" /></p>
      <DetailSheet title="いつ・どこへ避難する？">
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-relaxed">
        <li><Furigana text="建物が倒[たお]れそう、火が近い → まず危険[きけん]から離[はな]れ、安全な避難場所[ひなんばしょ]へ。" adult="倒壊や火災の危険がある場合は、まず安全を確保できる避難場所へ移動します。" /></li>
        <li><Furigana text="家で生活できない → 開いている避難所[ひなんじょ]や、安全な親戚の家などを確認[かくにん]しよう。" adult="自宅で生活を続けられない場合は、開設済みの避難所や安全な親族宅などを検討します。" /></li>
        <li><Furigana text="家が安全で、水・食料・トイレも確保[かくほ]できる → 自宅で過[す]ごす方法もあるよ。自治体[じちたい]からの避難情報[ひなんじょうほう]も確認[かくにん]しよう。" adult="自宅の安全と水・食料・トイレを確保できる場合は、在宅避難も選択肢です。自治体の避難情報を確認してください。" /></li>
      </ol>
      <Image src="/illustrations/textbook/actions/coast-evacuate-v2.webp" alt="防災用のバッグを持ち、海から離れて高台へ急いで避難する親子" width={1536} height={1024} className="mx-auto mt-4 h-auto max-h-56 w-auto max-w-[88%] rounded-field object-contain" />
      <p className="mt-3 text-base font-bold leading-relaxed"><Furigana text="海の近くで強い揺[ゆ]れや長い揺[ゆ]れを感じたら、警報[けいほう]を待たず高い安全な場所へ。" adult="海の近くで強い揺れや長く続く揺れを感じたら、津波警報を待たず高台など安全な場所へ避難してください。" /></p>
      <p className="mt-3 text-base leading-relaxed"><Furigana text="安全に取り出せるなら、ヘルメットをかぶって頭を守ろう。探すために逃[に]げ遅[おく]れないようにしよう。" adult="安全に取り出せる場合はヘルメットで頭を保護します。探すために避難を遅らせないでください。" /></p>
      </DetailSheet>
    </div>
    <a href="https://www.tfd.metro.tokyo.lg.jp/lfe/bou_topic/jisin/point10.html" target="_blank" rel="noopener noreferrer" className="block text-sm underline"><Furigana text={"参考：東京消防庁 地震その時10のポイント ↗"} /></a>
  </section>;
}
