import { Fragment } from "react";

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
 * このコンポーネント自体はサーバーでもクライアントでも使える。
 * ふりがなが off のときは <rt> が消えるだけで、読みは DOM に残る。
 *
 *   <Furigana text="地震[じしん]のときに倒[たお]れる家具[かぐ]" />
 */
export function Furigana({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter(Boolean);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(PARSE);
        if (!match) return <Fragment key={i}>{part}</Fragment>;
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

/** ふりがな記法から読みを取り除いた素のテキスト。aria-label などに使う。 */
export function plain(text: string) {
  return text.replace(/\[[^\]]*\]/g, "");
}
