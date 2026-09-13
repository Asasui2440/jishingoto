"use client";

import { upperElementaryText } from "@/lib/reading-level";
import { Fragment, useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import { adultText, plain } from "@/lib/adult-copy";
import { explicitReadings, hasKanji, type ReadingToken } from "@/lib/furigana-tokens";
import { cachedReadings, requestReadings } from "@/lib/furigana-client";
export { plain } from "@/lib/adult-copy";

/** 設定ONでは学年・対象年齢によらず読みを付け、原稿の指定を優先する。 */
export function Furigana({ text, adult }: { text: string; adult?: string }) {
  const { audience, furigana } = useSettings();
  const copy = audience === "adult" ? (adult === undefined ? adultText(text) : adult) : upperElementaryText(text);
  const [loaded, setLoaded] = useState<{ copy: string; tokens: ReadingToken[] } | null>(null);
  useEffect(() => {
    if (!furigana || !hasKanji(copy)) return;
    let alive = true;
    void requestReadings(copy).then((tokens) => { if (alive) setLoaded({ copy, tokens }); }).catch(() => {});
    return () => { alive = false; };
  }, [copy, furigana]);
  if (!furigana) return <span>{plain(copy)}</span>;
  const parts = loaded?.copy === copy ? loaded.tokens : cachedReadings(copy) ?? explicitReadings(copy);
  return <span>{parts.map((part, index) => part.reading
    ? <ruby key={index}>{part.text}<rt>{part.reading}</rt></ruby>
    : <Fragment key={index}>{part.text}</Fragment>)}</span>;
}
