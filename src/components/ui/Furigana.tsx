"use client";

import { needsReading, upperElementaryText } from "@/lib/reading-level";
import { Fragment } from "react";
import { useSettings } from "@/lib/settings";
import { adultText, plain } from "@/lib/adult-copy";
export { plain } from "@/lib/adult-copy";

/**
 * ふりがなの土台になれる文字（漢字と、々ヶヵ のような繰り返し・助数記号）。
 * ひらがな・カタカナを含めると `を始[はじ]める` の「を」まで巻きこんでしまうので、
 * ここは漢字だけに絞っている。
 */
const BASE = "[\\u4E00-\\u9FFF\\u3400-\\u4DBF\\u3005\\u3006\\u30F6\\u30F5]+";
const TOKEN = new RegExp(`(${BASE}\\[[^\\]]*\\])`, "g");
const PARSE = new RegExp(`^(${BASE})\\[([^\\]]*)\\]$`);

/**
 * `漢字[かんじ]` という記法をふりがな付きテキストに変換する。
 *
 * 表示するかどうかは CSS（`:root[data-furigana="on"]`）で切り替えるので、
 * 大人向けでは完全文の原稿を使用する。
 * ふりがなが off のときは <rt> が消えるだけで、読みは DOM に残る。
 *
 *   <Furigana text="地震[じしん]のときに倒[たお]れる家具[かぐ]" />
 */
export function Furigana({ text, adult }: { text: string; adult?: string }) {
  const { audience } = useSettings();
  if (audience === "adult") return <>{adult === undefined ? adultText(text) : plain(adult)}</>;

  const parts = upperElementaryText(text).split(TOKEN).filter(Boolean);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(PARSE);
        if (!match) return <Fragment key={i}>{part}</Fragment>;
        if (!needsReading(match[1])) return <Fragment key={i}>{match[1]}</Fragment>;
        return (
          // rp（非対応ブラウザ用の括弧）は入れていない。
          // textContent に「(かんじ)」が混ざって、ボタンの読み上げ名が
          // 読みにくくなるほうの害が大きいため。
          <ruby key={i}>
            {match[1]}
            <rt>{match[2]}</rt>
          </ruby>
        );
      })}
    </>
  );
}
