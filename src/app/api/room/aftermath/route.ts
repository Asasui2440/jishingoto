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
  if (!apiKey) return Response.json({ error: "openai-not-configured" }, { status: 503 });

  let body: { image?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  const file = typeof body.image === "string" ? imageFile(body.image) : null;
  if (!file) return Response.json({ error: "bad-request" }, { status: 400 });

  const form = new FormData();
  form.set("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2");
  form.set("image", file);
  form.set("size", "1536x1024");
  form.set("quality", "medium");
  form.set("prompt", [
    "入力写真を参考に、強い地震の直後を想像した教育用の、はっきりと手描きに見える2Dイラストを描いてください。日本の2Dアニメの背景・アニメ教材の一コマのような、アニメ調を強く出した全年齢向けの画風にしてください。太く明快な輪郭線、色面を大胆に整理したセル塗り、2段階のくっきりした影を画面全体に徹底し、写真の質感を残さないでください。",
    "画面全体を描き直し、家具や小物にはくっきりした少し太めの輪郭線、単純化した形、やわらかい色のベタ塗り、1〜2段階のセル塗りの影を使ってください。壁・床・家具も同じイラスト調に統一し、木目や布目などの細かな質感は省略してください。写実的なアニメ背景、写真の加工風、フォトリアル、3Dレンダリング、リアルな反射や照明、細密なテクスチャ、被写界深度は避けてください。",
    "入力写真と同じ部屋・同じ視点・家具の元の位置関係を手がかりに、元の部屋だとわかる構図と主な色を保ってください。写真に実際に見える家具や物だけを使い、転倒・落下、割れものの破損、物による通路のふさがりが起こりうる様子を描いてください。",
    "写っていない家具や窓、危険物を追加しないでください。マスクで隠された領域は無地のまま保ち、内容を推測・復元しないでください。人物、文字、ロゴ、炎、流血、けが人は描かないでください。固定状態や実際の被害は写真では断定できません。これは被害の予測ではなく、備えを考えるための一例です。",
  ].join("\n"));

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  } catch {
    return Response.json({ error: "openai-unreachable" }, { status: 502 });
  }
  if (!upstream.ok) return Response.json({ error: "openai-error" }, { status: 502 });
  const json = await upstream.json() as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  const imageUrl = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
  if (!imageUrl) return Response.json({ error: "missing-image" }, { status: 502 });
  return Response.json({ imageUrl });
}
