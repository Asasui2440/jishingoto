import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mockResponse from "@/data/mock/room-aftermath.json";
export const runtime = "nodejs";
export const maxDuration = 120;

function imageFile(dataUrl: string): File | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 6_000_000) return null;
  return new File([bytes], "room.jpg", { type: match[1] });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const mock = process.env.OPENAI_MOCK_MODE === "true";
  if (!apiKey && !mock) return Response.json({ error: "openai-not-configured" }, { status: 503 });

  let body: { image?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  const file = typeof body.image === "string" ? imageFile(body.image) : null;
  if (!file) return Response.json({ error: "bad-request" }, { status: 400 });

  if (mock) return Response.json(mockResponse, { headers: { "Cache-Control": "no-store" } });

  const form = new FormData();
  form.set("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2");
  form.append("image[]", file);
  try {
    const style = await readFile(join(process.cwd(), "public/illustrations/room-style-reference.jpeg"));
    form.append("image[]", new File([style], "style-reference.jpeg", { type: "image/jpeg" }));
  } catch {
    return Response.json({ error: "style-reference-unavailable" }, { status: 500 });
  }
  form.set("size", "1536x1024");
  form.set("quality", "medium");
  form.set("prompt", [
    "1枚目は利用者が送信した部屋の写真、2枚目は画風だけの参考画像です。部屋の配置や家具・小物は1枚目だけを根拠にし、2枚目の部屋・家具・ぬいぐるみ・キャラクターを移し込まないでください。2枚を並べた画像ではなく、1枚目の部屋だけを描いてください。以下の「入力写真」は1枚目を指します。",
    "1枚目自体が複数視点の写真を並べた一覧の場合のみ、同じパネル配置で各視点をそれぞれイラスト化してください。パネル間を接合して架空の部屋を作らず、空白パネルは空白のままにしてください。",
    "入力写真を参考に、強い地震の直後を想像した教育用2Dイラストを描いてください。2枚目のような平面的な日本のテレビアニメの背景に寄せ、アニメ調を強く出してください。細く少し手描きの揺らぎがある濃色の輪郭線、単純化した形、彩度を抑えた自然な色のベタ塗り、必要最小限の一段階の影を使ってください。立体的なレンダリングではなく、紙に線画を描いて色を塗ったような画面にしてください。",
    "参考画像は線画と平面的な塗り方のみを参照し、かわいらしいパステル配色は真似しないでください。彩度を抑えたグレージュ・木の茶色・くすんだオリーブ・スレートを基調に、生活感のある落ち着いた配色にしてください。鮮やかなピンクや水色、虹色、玩具のような配色を避けてください。暗いホラー調やセピア一色にはせず、明るさと視認性を保ち、入力写真の主な色も落ち着いた色へ置き換えてください。",
    "壁・床・家具を含め画面全体を同じ平面的な絵柄で描き直し、木目・布目などの細かな質感を省略してください。写真の質感、写実的なアニメ背景、フォトリアル、3Dレンダリング、リアルな反射や照明、グラデーションによる立体感、細密なテクスチャ、被写界深度は避けてください。",
    "入力写真と同じ部屋・同じ視点・家具の元の位置関係を手がかりに、元の部屋だとわかる構図を保ち、主な色は彩度を抑えてください。写真に実際に見える家具や物だけを使い、転倒・落下、割れものの破損、物による通路のふさがりが起こりうる様子を描いてください。",
    "散乱の程度ははっきり強く描いてください。写真に見える棚の中身や棚上の物の複数が床へ落ち、元の収納場所が空き、大小の物が床の広い範囲や通路に不規則に散らばった、強い揺れの直後の状態にしてください。数個の小物を整然と床に置くだけにしないでください。見えている割れ物は破片、背の高い家具は傾きや転倒など、物の種類に応じた変化を描いてください。ただし固定されていることが見て取れる家具を無理に倒したり、写真にない物を増やして被害を誇張したりしないでください。",
    "写っていない家具や窓、危険物を追加しないでください。マスクで隠された領域は無地のまま保ち、内容を推測・復元しないでください。人物、文字、ロゴ、炎、流血、けが人は描かないでください。固定状態や実際の被害は写真では断定できません。これは被害の予測ではなく、備えを考えるための一例です。",
  ].join("\n"));

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(110_000) });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.name === "TimeoutError" ? "openai-timeout" : "openai-unreachable" }, { status: 502 });
  }
  if (!upstream.ok) {
    // 写真やAPIキー、上流のエラーメッセージはログに出さない。
    console.error("Room image generation failed", { status: upstream.status, requestId: upstream.headers.get("x-request-id") });
    return Response.json({ error: upstream.status === 429 ? "openai-rate-limit" : "openai-error" }, { status: 502 });
  }
  const json = await upstream.json() as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  const imageUrl = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
  if (!imageUrl) return Response.json({ error: "missing-image" }, { status: 502 });
  return Response.json({ imageUrl });
}
