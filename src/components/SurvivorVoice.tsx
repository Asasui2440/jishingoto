"use client";

import { useState } from "react";
import { Furigana } from "@/components/ui/Furigana";
import { relatedVoices, type VoiceMatch, type VoiceRequest } from "@/lib/voice-knowledge";
import styles from "./SurvivorVoice.module.css";

export function SurvivorVoice({ request }: { request: VoiceRequest | null }) {
  const matches = relatedVoices(request);
  if (!request || !matches.length) return null;
  // 回答・問題の変更で、前のカードや開いた詳細を持ち越さない。
  return <VoiceCard key={`${request.surface}:${request.key}:${request.choiceId ?? ""}:${!!request.timedOut}`} matches={matches} />;
}

function VoiceCard({ matches }: { matches: VoiceMatch[] }) {
  const [index, setIndex] = useState(0);
  const { entry, relation, matchedChoice } = matches[index % matches.length];
  return <section className={styles.card} aria-label="被災者の声" data-voice-id={entry.id}>
    <p className={styles.label}><Furigana text="被災者[ひさいしゃ]の声[こえ]（要約[ようやく]）" /></p>
    <h3 className={styles.title}><Furigana text={entry.title} /></h3>
    <p className={styles.event}>{entry.event} · {entry.period} · {entry.location}</p>
    <p className={styles.summary}><Furigana text={entry.summary.child} adult={entry.summary.adult} /></p>
    <div className={styles.connection}>
      <p className={styles.connectionTitle}>{matchedChoice ? "今回選んだ行動とのつながり" : "このテーマとのつながり"}</p>
      <p><Furigana text={relation.child} adult={relation.adult} /></p>
    </div>
    <details key={entry.id} className={styles.details}>
      <summary>経験の背景・出典を読む</summary>
      <p>{entry.context}</p>
      <p><Furigana text={entry.limits.child} adult={entry.limits.adult} /></p>
      <p className={styles.credit}>内閣府「一日前プロジェクト」をもとに、ジシンゴト用にCodexが要約・編集。原典の提供者・本人による要約の承認を示すものではありません。</p>
      <p className={styles.credit}>参照箇所：{entry.source.locator} · 掲載文の確認日：{entry.reviewedAt}</p>
    </details>
    <a className={styles.source} href={entry.source.url} target="_blank" rel="noopener noreferrer">出典：内閣府「{entry.source.title}」<span aria-hidden> ↗</span><span className="sr-only">（新しいタブで開きます）</span></a>
    {matches.length > 1 && <button type="button" className={styles.next} onClick={() => setIndex(value => (value + 1) % matches.length)}>別の経験を読む <span aria-hidden>→</span></button>}
  </section>;
}
