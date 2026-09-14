import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";
import path from "node:path";
import { explicitReadings, hasKanji, type ReadingToken } from "./furigana-tokens";

let loading: Promise<Tokenizer<IpadicFeatures>> | undefined;
function tokenizer() {
  if (!loading) {
    loading = new Promise<Tokenizer<IpadicFeatures>>((resolve, reject) => {
      kuromoji.builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") }).build((error, value) => error ? reject(error) : resolve(value));
    }).catch((error) => { loading = undefined; throw error; });
  }
  return loading;
}
const COMPOUNDS: Record<string, string> = { "食器棚": "しょっきだな", "自分事": "じぶんごと", "防災": "ぼうさい", "飛散": "ひさん" };
const hiragana = (text: string) => text.replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60));

/** 写真・外部AIを使わず、同梱した日本語辞書で読みを補う。 */
export async function japaneseReadings(text: string): Promise<ReadingToken[]> {
  const analyzer = await tokenizer();
  return explicitReadings(text).flatMap((part) => {
    if (part.reading || !hasKanji(part.text)) return [part];
    return part.text.split(/(食器棚|自分事|防災|飛散)/).filter(Boolean).flatMap((chunk): ReadingToken[] => COMPOUNDS[chunk] ? [{ text: chunk, reading: COMPOUNDS[chunk] }] : analyzer.tokenize(chunk).map((token) => ({
      text: token.surface_form,
      ...(hasKanji(token.surface_form) && token.reading ? { reading: hiragana(token.reading) } : {}),
    })));
  });
}
