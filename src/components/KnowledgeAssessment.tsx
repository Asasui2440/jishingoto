import type { RoomAssessment } from "@/lib/content";
import { Furigana } from "@/components/ui/Furigana";

export function KnowledgeAssessment({ assessment }: { assessment: RoomAssessment }) {
  return <section aria-label="写真と資料から考える備え" className="mt-3 rounded-field bg-canvas p-3 text-13 leading-relaxed">
    <h3 className="font-bold"><Furigana text="写真[しゃしん]と資料[しりょう]から考[かんが]える備[そな]え" /></h3>
    <p className="mt-1 text-xs text-ink-muted"><Furigana text="強[つよ]いゆれを想定[そうてい]した説明[せつめい]です。実際[じっさい]の被害[ひがい]を決[き]めるものではありません。" /></p>
    <dl className="mt-3 space-y-3">
      {[
        ["写真[しゃしん]で見[み]えること", assessment.observation],
        ["起[お]こり得[う]ること・条件[じょうけん]", assessment.scenario],
        ["今[いま]のうちにできること", assessment.preparation],
      ].map(([label, text]) => <div key={label}>
        <dt className="font-bold"><Furigana text={label} /></dt>
        <dd className="mt-1"><Furigana text={text} /></dd>
      </div>)}
      {assessment.unknowns.length > 0 && <div>
        <dt className="font-bold"><Furigana text="確認[かくにん]したいこと" /></dt>
        <dd><ul className="mt-1 list-disc space-y-1 pl-5">{assessment.unknowns.map((text, index) => <li key={index}><Furigana text={text} /></li>)}</ul></dd>
      </div>}
    </dl>
    <details className="mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer py-2 font-bold"><Furigana text="根拠[こんきょ]の資料[しりょう]を見[み]る" /></summary>
      <ul className="space-y-3">
        {assessment.references.map(reference => <li key={reference.id}>
          <p className="font-bold"><Furigana text={reference.title} /></p>
          <p className="text-xs text-ink-muted">資料の確認日：{reference.checkedAt}</p>
          {reference.sources.filter(source => source.url.startsWith("https://")).map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block break-words py-2 text-secondary-ink underline">{source.title}（原典・別タブ）</a>)}
        </li>)}
      </ul>
    </details>
  </section>;
}
