import { aftermathObjects } from "./aftermath-plan";
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
import { roomObjectType, isCooktop, fallSource, EXIT_EXPLANATION } from "./room-guidance";
import { HOME_KITCHEN_AFTER, SCENARIOS, shuffleChoices, type RoomSetting } from "./scenarios";
import type { RoomView } from "./room-views";
import { AFTER_SHAKING_QUESTIONS } from "./after-shaking-questions";
import { adultQuestion } from "./adult-questions";
import type { Audience } from "./settings";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BlurRegion = { id: string; x: number; y: number; w: number; h: number; shape: "rect" | "circle" };

export async function detectBlurRegions(_photo?: Blob): Promise<BlurRegion[]> {
  await wait(350);
  return [];
}

export type RoomAnalysis = { risks: Risk[]; source: "ai" | "demo"; warning?: string };

/** 撮影した部屋を OpenAI の画像理解モデルで解析する。 */
export async function analyzeRoom(photoUrl: string | null, views: RoomView[] = []): Promise<RoomAnalysis> {
  if (!photoUrl?.startsWith("data:image/")) {
    return { risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "写真がないため、サンプルの解析結果を表示しています。" };
  }
  try {
    const response = await fetch("/api/room/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(views.length ? { views } : { image: photoUrl }) });
    if (!response.ok) throw new Error("analysis failed");
    const body = (await response.json()) as { risks?: Risk[]; source?: RoomAnalysis["source"]; warning?: string };
    if (!Array.isArray(body.risks)) throw new Error("invalid analysis");
    return { risks: body.risks, source: body.source === "demo" ? "demo" : "ai", warning: body.warning };
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
  if (isCooktop(risk)) return { ...HOME_KITCHEN_AFTER, ...common, id: HOME_KITCHEN_AFTER.id, seconds: 12 };
  if (type === "desk") return { ...common, axis: "initial", category: "瞬間[しゅんかん]判断[はんだん]", situation: `強[つよ]いゆれが来[き]ました。近[ちか]くに${risk.name}があります。`, choices: SIMPLE_CHOICES.desk };
  if (type === "elevated_objects") return { ...common, axis: "initial", category: "落下物に注意", situation: `強い揺れで、${risk.name}が${fallSource(risk)}落ちそうです。`, choices: SIMPLE_CHOICES.move };
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
  // 条件付きの出題原稿は結果画面でもそのまま振り返る。
  if (question.challenge) return question;
  if (question.id === HOME_KITCHEN_AFTER.id) return question;
  const name = adultText(risk.adultName ?? risk.name);
  const type = roomObjectType(risk);
  let adultSituation = `${name}の近くで強い揺れが始まりました。どのように行動しますか。`;
  if (type === "desk") adultSituation = `強い揺れが発生しました。近くに${name}があります。どのように身を守りますか。`;
  if (type === "loose_objects" || risk.kind === "block") adultSituation = `揺れが収まりました。${name}の近くに物が散乱しています。どのように行動しますか。`;
  if (type === "doorway") adultSituation = `揺れが収まりました。${name}の近くに物が散乱しています。どのように行動しますか。`;
  if (type === "tv") adultSituation = `${name}の近くで強い揺れが始まりました。どのように行動しますか。`;
  if (type === "hanging_object") adultSituation = `${name}が大きく揺れており、落下する恐れがあります。どのように行動しますか。`;
  if (question.axis === "evacuation") adultSituation = `揺れが収まりました。${name}の近くの床に物が散乱し、通りにくくなった場面を想定してください。どのように行動しますか。`;
  if (type === "elevated_objects") adultSituation = `強い揺れで、${name}が${fallSource(risk)}落ちそうな場面です。どのように身を守りますか。`;
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

/** 写真で確認したコンロだけ火の元の問題を出す。 */
export async function fetchQuestions(risks: Risk[], _setting: RoomSetting = "home", random = Math.random, audience: Audience = "child"): Promise<Question[]> {
  const roomQuestions = risks.filter((risk) => risk.confirmed).map((risk, index) => withAdultSituation(questionForRisk(risk, index), risk));
  const desk = roomQuestions.find((q) => q.choices.some((choice) => choice.id === "under-desk"));
  // 確認した別の家具でも身の守り方を考えられるよう、最大2問にする。
  const duringPool = roomQuestions.filter((q) => q.axis === "initial");
  const during: Question[] = desk
    ? [desk, ...pickMany(duringPool.filter(q => q.sourceRiskId !== desk.sourceRiskId), 1, random)]
    : pickMany(duringPool, 2, random);
  if (!during.length) during.push({ id: "initial-common", axis: "initial", category: "瞬間[しゅんかん]判断[はんだん]", situation: "強[つよ]いゆれが始[はじ]まりました。まずどうする？", adultSituation: "強い揺れが発生しました。まず、どのように身を守りますか。", seconds: 10, choices: SIMPLE_CHOICES.protect });
  const kitchen = roomQuestions.find(q => q.id === HOME_KITCHEN_AFTER.id);
  const afterRoom = pickMany(roomQuestions.filter((q) => q.axis !== "initial" && q.id !== HOME_KITCHEN_AFTER.id), 1, random);
  const after = [...afterRoom, ...(kitchen ? [kitchen] : [])];
  const shelter = pickMany(SCENARIOS.filter(q => q.id === "shelter-home" || q.id === "shelter-damaged"), 1, random)
    .map(q => ({ ...q, seconds: 15,
      situation: q.id === "shelter-home" ? "家と周りの安全は確認できました。水と食べ物があり、トイレも使えます。避難の指示はありません。どうする？" : q.situation,
      adultSituation: q.id === "shelter-damaged" ? "揺れが収まり、現在いる建物が傾いています。避難所は未開設です。まずどのように行動しますか。" : q.adultSituation,
    }));
  const floor: Question = { id: "floor-common", axis: "evacuation", category: "足元の確認", situation: "揺れが収まり、床にガラスや物が散らばっています。玄関へ行く前に、どうする？", adultSituation: "揺れが収まり、床にガラス片や物が散乱しています。玄関に向かう前に、どのように行動しますか。", seconds: 12, choices: SIMPLE_CHOICES.exit };
  const pool = [...AFTER_SHAKING_QUESTIONS, ...shelter, ...(afterRoom.length ? [] : [floor])];
  after.push(...pickMany(pool, 5 - during.length - after.length, random));
  return during.map((q): Question => ({ ...q, phase: "during" }))
    .concat(after.map((q): Question => ({ ...q, phase: "after" })))
    .map((q) => shuffleChoices(audience === "adult" ? adultQuestion(q) : q, random));
}

export type Aftermath = { imageUrl: string | null; events: { riskId: string; text: string; adultText: string }[]; source: "ai" | "preview" | "test"; verification?: "checked" | "unavailable"; error?: string };
const AFTERMATH_TEXT: Record<Risk["kind"], string> = { fall: "たおれたり落[お]ちたりして、人[ひと]に当[あ]たるかもしれない", break: "われて、床[ゆか]に破片[はへん]が散[ち]らばるかもしれない", block: "動[うご]いたりくずれたりして、床[ゆか]の通[とお]り道[みち]をふさぐかもしれない" };

export function aftermathEvents(risks: Risk[]): Aftermath["events"] {
  const confirmed = risks.filter((risk) => risk.confirmed);
  return confirmed.map((risk) => ({
    riskId: risk.id,
    text: roomObjectType(risk) === "elevated_objects" ? `${risk.name}が${fallSource(risk)}落ち、人に当たったり近くの床に散らばったりするかもしれません。` : `${risk.name}が${AFTERMATH_TEXT[risk.kind]}`,
    adultText: roomObjectType(risk) === "elevated_objects" ? `${risk.adultName ?? adultText(risk.name)}が${fallSource(risk)}落下し、人に当たったり床の通行を妨げたりする可能性があります。` : {
      fall: `${risk.adultName ?? adultText(risk.name)}が転倒・落下し、避難経路を塞ぐ可能性があります。`,
      break: `${risk.adultName ?? adultText(risk.name)}が破損し、床に破片が散乱する可能性があります。`,
      block: `${risk.adultName ?? adultText(risk.name)}の周囲で物が崩れ、通行できなくなる可能性があります。`,
    }[risk.kind],
  }));
}

export async function generateAftermath(photo: string | null, risks: Risk[] = []): Promise<Aftermath> {
  const events: Aftermath["events"] = [];
  if (!photo?.startsWith("data:image/")) return { imageUrl: null, events, source: "preview", error: "写真がありません。写真を選び直してください。" };
  try {
    if (photo.length > 4_000_000) return { imageUrl: null, events, source: "preview", error: "写真のデータが大きすぎます。写真を選び直してください。" };
    const response = await fetch("/api/room/aftermath", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo, objects: aftermathObjects(risks) }), signal: AbortSignal.timeout(225_000) });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: string };
      const messages: Record<string, string> = {
        "room-image-mismatch": "元の部屋と大きく異なる画像になったため、表示を見送りました。もう一度作成できます。",
        "openai-not-configured": "画像生成の設定がまだ完了していません。",
        "openai-rate-limit": "画像生成が混み合っているか、利用上限に達しています。時間をおいて試してください。",
        "openai-timeout": "画像生成に時間がかかりすぎました。時間をおいて、もう一度試してください。",
        "openai-quota": "画像生成の利用上限に達しています。管理者によるAPIの利用設定の確認が必要です。",
        "image-too-large": "写真のデータが大きすぎます。写真を選び直してください。",
        "generated-image-too-large": "生成した画像のデータが大きすぎました。もう一度試してください。",
        "openai-unreachable": "画像生成サービスに接続できませんでした。時間をおいて試してください。",
      };
      return { imageUrl: null, events, source: "preview", error: messages[failure.error ?? ""] ?? (response.status === 504 ? messages["openai-timeout"] : response.status === 413 ? messages["image-too-large"] : "予想図を生成できませんでした。もう一度試してください。") };
    }
    const body = (await response.json()) as { imageUrl?: string; source?: Aftermath["source"]; verification?: Aftermath["verification"] };
    return { imageUrl: body.imageUrl ?? null, events, verification: body.verification, source: body.source === "test" ? "test" : body.imageUrl ? "ai" : "preview" };
  } catch (error) {
    return { imageUrl: null, events, source: "preview", error: error instanceof Error && error.name === "TimeoutError" ? "画像生成に時間がかかりすぎました。時間をおいて、もう一度試してください。" : "通信できませんでした。接続を確認して、もう一度試してください。" };
  }
}
