/** ラベルを含む共有用画像を作る。元画像・生成画像は永続保存しない。 */
export async function createAftermathShareFile(url: string): Promise<File> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  const width = Math.min(image.naturalWidth, 1536);
  const height = Math.round(image.naturalHeight * width / image.naturalWidth);
  const footer = Math.round(width * 0.1);
  canvas.width = width;
  canvas.height = height + footer;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, 0, 0, width, height);
  context.fillStyle = "#fff9e5";
  context.fillRect(0, height, width, footer);
  context.fillStyle = "#243444";
  context.font = `bold ${Math.round(width * 0.022)}px sans-serif`;
  context.textAlign = "center";
  context.fillText("AIによる予想図 · 実際の被害写真ではありません", width / 2, height + footer * 0.44);
  context.font = `${Math.round(width * 0.018)}px sans-serif`;
  context.fillText("ジシンゴト｜地震への備えを考えるシミュレーション", width / 2, height + footer * 0.78);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("export failed")), "image/png"));
  return new File([blob], "jishingoto-ai-room.png", { type: "image/png" });
}
