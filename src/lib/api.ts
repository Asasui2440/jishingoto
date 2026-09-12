/** ブラウザからアプリ内 Route Handler を呼ぶための境界。 */
import {
  DETECTED_RISKS,
  QUESTIONS,
  type Choice,
  type Question,
  type Risk,
  type RoomObjectType,
} from "./content";
import { adultText } from "./adult-copy";
import { roomObjectType, EXIT_EXPLANATION } from "./room-guidance";
import { HOME_KITCHEN_AFTER, shuffleChoices, type RoomSetting } from "./scenarios";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BlurRegion = { id: string; x: number; y: number; w: number; h: number; shape: "rect" | "circle" };

export async function detectBlurRegions(_photo?: Blob): Promise<BlurRegion[]> {
  await wait(350);
  return [];
}

export type RoomAnalysis = { risks: Risk[]; source: "ai" | "demo"; warning?: string };

/** 撮影した部屋を OpenAI の画像理解モデルで解析する。 */
export async function analyzeRoom(photoUrl: string | null): Promise<RoomAnalysis> {
  if (!photoUrl?.startsWith("data:image/")) {
    return { risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "写真がないため、サンプルの解析結果を表示しています。" };
  }
  try {
    const response = await fetch("/api/room/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photoUrl }) });
    if (!response.ok) throw new Error("analysis failed");
    const body = (await response.json()) as { risks?: Risk[] };
    if (!Array.isArray(body.risks)) throw new Error("invalid analysis");
    return { risks: body.risks, source: "ai" };
  } catch {
    return { risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "AI解析に接続できなかったため、サンプルの解析結果を表示しています。" };
  }
}

const SIMPLE_CHOICES: Record<"protect" | "move" | "exit" | "desk" | "tidy", Choice[]> = {
  protect: [
    { id: "protect-head", label: "低[ひく]い姿勢[しせい]になり、頭[あたま]と首[くび]を守[まも]る", detail: "無理[むり]に走[はし]らず、その場[ば]で身[み]を守[まも]る", safety: 0.95, explanation: ["強[つよ]いゆれの間[あいだ]は、まず低[ひく]い姿勢[しせい]になり、手[て]や持[も]っている物[もの]で頭[あたま]と首[くび]を守[まも]ります。すぐ近[ちか]くに丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]があれば、その下[した]に入[はい]って脚[あし]を持[も]ちます。", "落[お]ちる・たおれる・動[うご]く物[もの]が近[ちか]いときは、無理[むり]に走[はし]らず、動[うご]ける範囲[はんい]で距離[きょり]をとって、ゆれがおさまるのを待[ま]ちます。"] },
    { id: "run-immediately", label: "ゆれている間[あいだ]に外[そと]へ走[はし]る", detail: "急[いそ]いで建物[たてもの]の外[そと]へ出[で]る", safety: 0.25, explanation: ["強[つよ]いゆれの中[なか]で走[はし]ると、転[ころ]んだり落下物[らっかぶつ]に当[あ]たったりする危険[きけん]があります。", "まずその場[ば]で身[み]を守[まも]り、ゆれがおさまってから周囲[しゅうい]を確認[かくにん]します。"] },
    { id: "stand-and-watch", label: "立[た]ったまま周[まわ]りを見[み]る", detail: "動[うご]かずに様子[ようす]を見[み]る", safety: 0.3, explanation: ["立[た]ったままでは転[ころ]びやすく、頭[あたま]も守[まも]れません。", "低[ひく]い姿勢[しせい]になり、手[て]やかばんなど使[つか]える物[もの]で頭[あたま]を守[まも]ります。"] },
  ],
  move: [
    { id: "move-away", label: "できる範囲[はんい]で離[はな]れ、頭[あたま]と首[くび]を守[まも]る", detail: "無理[むり]に走[はし]らず、低[ひく]い姿勢[しせい]をとる", safety: 0.95, explanation: ["たおれたり落[お]ちたりする物[もの]が近[ちか]いときは、無理[むり]に走[はし]らず、動[うご]ける範囲[はんい]で距離[きょり]をとります。", "低[ひく]い姿勢[しせい]で頭[あたま]と首[くび]を守[まも]り、物[もの]を手[て]で支[ささ]えに行[い]かず、ゆれがおさまるのを待[ま]ちます。"] },
    { id: "hold-object", label: "たおれないように手[て]でおさえる", detail: "その場[ば]で物[もの]を支[ささ]える", safety: 0.15, explanation: ["強[つよ]いゆれの中[なか]で物[もの]を支[ささ]えると、下敷[したじ]きやけがにつながります。", "物[もの]から離[はな]れ、頭[あたま]を守[まも]ってください。"] },
    { id: "run-out", label: "すぐに外[そと]へ走[はし]る", detail: "ゆれている間[あいだ]に出口[でぐち]へ向[む]かう", safety: 0.35, explanation: ["ゆれている間[あいだ]の移動[いどう]は転倒[てんとう]や落下物[らっかぶつ]の危険[きけん]があります。", "まずその場[ば]で身[み]を守[まも]り、ゆれがおさまってから移動[いどう]します。"] },
  ],
  exit: [
    { id: "clear-exit", label: "まず足元[あしもと]を確認[かくにん]し、安全[あんぜん]に通[とお]れる道[みち]を探[さが]す", detail: "あわてて歩[ある]かず、破片[はへん]や倒[たお]れた物[もの]を確認[かくにん]", safety: 0.95, explanation: EXIT_EXPLANATION },
    { id: "climb-over", label: "そのまま物[もの]をまたいで外[そと]へ出[で]る", detail: "急[いそ]いで出口[でぐち]へ", safety: 0.25, explanation: ["散[ち]らばった物[もの]や破片[はへん]で転[ころ]んだり、足[あし]をけがしたりします。", "はきものをはき、足元[あしもと]を確認[かくにん]してください。"] },
    { id: "wait-only", label: "なにもせず部屋[へや]で待[ま]つ", detail: "出口[でぐち]はふさがれたまま", safety: 0.5, explanation: ["すぐ動[うご]かないのは大切[たいせつ]ですが、出口[でぐち]がふさがれたままだと次[つぎ]の避難[ひなん]が難[むずか]しくなります。", "ゆれがおさまったら安全[あんぜん]を確[たし]かめ、逃[に]げ道[みち]をつくりましょう。"] },
  ],
  desk: [
    { id: "under-desk", label: "丈夫[じょうぶ]な机[つくえ]なら下[した]へ。無理[むり]なら頭[あたま]を守[まも]る", detail: "安全[あんぜん]に入[はい]れたら脚[あし]を持[も]つ", safety: 0.95, explanation: ["丈夫[じょうぶ]で、安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]に入り、机[つくえ]が動[うご]かないよう脚[あし]を持[も]ちます。", "ガラスの机[つくえ]、こわれそうな机[つくえ]、離[はな]れた机[つくえ]には無理[むり]に向[む]かわず、その場[ば]で低[ひく]くなって頭[あたま]と首[くび]を守[まも]ります。"] },
    { id: "beside-desk", label: "机[つくえ]の横[よこ]で立[た]ったまま待[ま]つ", detail: "すぐ動[うご]けるようにする", safety: 0.35, explanation: ["立[た]ったままでは転[ころ]びやすく、落下物[らっかぶつ]から頭[あたま]を守[まも]れません。", "まず低[ひく]い姿勢[しせい]で頭[あたま]と首[くび]を守[まも]ります。丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]を使[つか]います。"] },
    { id: "door-desk", label: "ゆれながら出口[でぐち]へ走[はし]る", detail: "机[つくえ]は使[つか]わず逃[に]げる", safety: 0.3, explanation: ["ゆれの最中[さいちゅう]に走[はし]るのは危険[きけん]です。", "まず近[ちか]くの安全[あんぜん]な場所[ばしょ]で身[み]を守[まも]ります。"] },
  ],
  tidy: [
    { id: "tidy-now", label: "床[ゆか]の物[もの]を今[いま]のうちに片[かた]づける", detail: "逃[に]げ道[みち]と足元[あしもと]を空[あ]ける", safety: 0.95, explanation: ["ゆれる前[まえ]に床[ゆか]や出口[でぐち]の物[もの]を片[かた]づけると、転倒[てんとう]や避難[ひなん]の遅[おく]れを減[へ]らせます。", "今日[きょう]すぐできる効果的[こうかてき]な備[そな]えです。"] },
    { id: "leave-floor", label: "いつもの場所[ばしょ]なのでそのままにする", detail: "場所[ばしょ]を覚[おぼ]えていれば大丈夫[だいじょうぶ]", safety: 0.2, explanation: ["暗[くら]い中[なか]や強[つよ]いゆれのあとでは、いつもの場所[ばしょ]でも見[み]えにくくなります。", "通[とお]り道[みち]には物[もの]を置[お]かないようにしましょう。"] },
    { id: "move-higher", label: "床[ゆか]の物[もの]を高[たか]い棚[たな]へ移[うつ]す", detail: "床[ゆか]だけ空[あ]ける", safety: 0.45, explanation: ["床[ゆか]は空[あ]きますが、高[たか]い場所[ばしょ]から落[お]ちる物[もの]が増[ふ]えてしまいます。", "低[ひく]い収納[しゅうのう]にしまい、飛[と]び出[だ]さない工夫[くふう]をします。"] },
  ],
};

const BASE_BY_KIND = { fall: "q1", break: "q6", block: "q3" } as const;

function questionForRisk(risk: Risk, index: number): Question {
  const type: RoomObjectType = roomObjectType(risk);
  const x = Math.max(0, Math.min(100, risk.x - 13));
  const y = Math.max(0, Math.min(100, risk.y - 18));
  const region = risk.bounds ?? { x, y, w: Math.min(26, 100 - x), h: Math.min(36, 100 - y) };
  const common = { id: `room-${risk.id}-${index}`, sourceRiskId: risk.id, riskKind: risk.kind, place: risk.name, highlight: { ...region, label: risk.name }, seconds: 10 };
  if (type === "desk") return { ...common, axis: "initial", category: "しゅんかん判断[はんだん]", situation: `強[つよ]いゆれが来[き]ました。近[ちか]くに${risk.name}があります。`, choices: SIMPLE_CHOICES.desk };
  if (type === "elevated_objects") return { ...common, axis: "initial", category: "落下物に注意", situation: `強い揺れで、${risk.name}が棚から落ちそうです。`, choices: SIMPLE_CHOICES.move };
  if (type === "loose_objects" || risk.kind === "block" || type === "doorway") return { ...common, phase: "after", axis: "evacuation", category: "ゆれがおさまったあと", situation: `ゆれがおさまりました。${risk.name}の近くの床[ゆか]に物[もの]が散[ち]らばり、通[とお]りにくくなった場面[ばめん]を考[かんが]えてね。`, seconds: 12, choices: SIMPLE_CHOICES.exit };
  if (type === "window") {
    const base = QUESTIONS.find((question) => question.id === "q6")!;
    return { ...base, ...common, riskKind: "break", situation: `${risk.name}のすぐそばで、強[つよ]いゆれにあいました。` };
  }
  const base = QUESTIONS.find((question) => question.id === BASE_BY_KIND[risk.kind])!;
  const situation = type === "hanging_object" ? `${risk.name}が大[おお]きくゆれて、落[お]ちそうです。` : `${risk.name}のそばで、強[つよ]いゆれが始[はじ]まりました。`;
  return { ...base, ...common, situation, choices: SIMPLE_CHOICES.move };
}

export function withAdultSituation(question: Question, risk: Risk): Question {
  const name = adultText(risk.adultName ?? risk.name);
  const type = roomObjectType(risk);
  let adultSituation = `${name}の近くで強い揺れが始まりました。どのように行動しますか。`;
  if (type === "desk") adultSituation = `強い揺れが発生しました。近くに${name}があります。どのように身を守りますか。`;
  if (type === "loose_objects" || risk.kind === "block") adultSituation = `揺れが収まりました。${name}の近くに物が散乱しています。どのように行動しますか。`;
  if (type === "doorway") adultSituation = `揺れが収まりました。${name}の近くに物が散乱しています。どのように行動しますか。`;
  if (type === "tv") adultSituation = `${name}の近くで強い揺れが始まりました。どのように行動しますか。`;
  if (type === "hanging_object") adultSituation = `${name}が大きく揺れており、落下する恐れがあります。どのように行動しますか。`;
  if (question.axis === "evacuation") adultSituation = `揺れが収まりました。${name}の近くの床に物が散乱し、通りにくくなった場面を想定してください。どのように行動しますか。`;
  if (type === "elevated_objects") adultSituation = `強い揺れで、${name}が棚から落ちそうな場面です。どのように身を守りますか。`;
  return { ...question, adultPlace: name, adultSituation };
}

function pickMany<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** 写真で見つけた物体を中心に出題。自宅では揺れの後の火の元確認も扱う。 */
export async function fetchQuestions(risks: Risk[], setting: RoomSetting = "home", random = Math.random): Promise<Question[]> {
  const roomQuestions = risks.filter((risk) => risk.confirmed).map((risk, index) => withAdultSituation(questionForRisk(risk, index), risk));
  const desk = roomQuestions.find((q) => q.choices.some((choice) => choice.id === "under-desk"));
  const duringPool = roomQuestions.filter((q) => q.axis === "initial" && q.id !== desk?.id);
  const during: Question[] = [...(desk ? [desk] : []), ...pickMany(duringPool, desk ? 1 : 2, random)];
  if (!during.length) during.push({ id: "initial-common", axis: "initial", category: "しゅんかん判断[はんだん]", situation: "強[つよ]いゆれが始[はじ]まりました。まずどうする？", adultSituation: "強い揺れが発生しました。まず、どのように身を守りますか。", seconds: 10, choices: SIMPLE_CHOICES.protect });
  const afterRoom = pickMany(roomQuestions.filter((q) => q.axis !== "initial"), 1, random);
  const information = QUESTIONS.find((q) => q.id === "q5")!;
  return during.map((q): Question => ({ ...q, phase: "during" }))
    .concat([...afterRoom, ...(setting === "home" ? [HOME_KITCHEN_AFTER] : []), information].map((q): Question => ({ ...q, phase: "after" })))
    .map((q) => shuffleChoices(q, random));
}

export type Aftermath = { imageUrl: string | null; events: { riskId: string; text: string; adultText: string }[]; source: "ai" | "preview" | "test" };
const AFTERMATH_TEXT: Record<Risk["kind"], string> = { fall: "たおれたり落[お]ちたりして、人[ひと]に当[あ]たるかもしれない", break: "われて、床[ゆか]に破片[はへん]が散[ち]らばるかもしれない", block: "動[うご]いたりくずれたりして、床[ゆか]の通[とお]り道[みち]をふさぐかもしれない" };

export function aftermathEvents(risks: Risk[]): Aftermath["events"] {
  const confirmed = risks.filter((risk) => risk.confirmed);
  return confirmed.map((risk) => ({
    riskId: risk.id,
    text: roomObjectType(risk) === "elevated_objects" ? `${risk.name}が棚から落ち、人に当たったり近くの床に散らばったりするかもしれません。` : `${risk.name}が${AFTERMATH_TEXT[risk.kind]}`,
    adultText: roomObjectType(risk) === "elevated_objects" ? `${risk.adultName ?? adultText(risk.name)}が棚から落下し、人に当たったり床の通行を妨げたりする可能性があります。` : {
      fall: `${risk.adultName ?? adultText(risk.name)}が転倒・落下し、避難経路を塞ぐ可能性があります。`,
      break: `${risk.adultName ?? adultText(risk.name)}が破損し、床に破片が散乱する可能性があります。`,
      block: `${risk.adultName ?? adultText(risk.name)}の周囲で物が崩れ、通行できなくなる可能性があります。`,
    }[risk.kind],
  }));
}

export async function generateAftermath(photo: string | null): Promise<Aftermath> {
  const events: Aftermath["events"] = [];
  if (!photo?.startsWith("data:image/")) return { imageUrl: null, events, source: "preview" };
  try {
    const response = await fetch("/api/room/aftermath", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo }) });
    if (!response.ok) throw new Error("generation failed");
    const body = (await response.json()) as { imageUrl?: string };
    return { imageUrl: body.imageUrl ?? null, events, source: body.imageUrl ? "ai" : "preview" };
  } catch {
    return { imageUrl: null, events, source: "preview" };
  }
}
