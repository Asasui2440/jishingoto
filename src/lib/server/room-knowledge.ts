import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { KnowledgeReference } from "../content";

// 室内の地震解析で確認済みの資料だけを使用する。証言・下書きの追加で自動的に変わらない。
const ROOM_NOTES = [
  "earthquake/eq-001-intensity.md",
  "earthquake/eq-002-long-period-motion.md",
  "earthquake/eq-003-furniture-layout.md",
  "earthquake/eq-004-appliances.md",
  "earthquake/eq-006-electrical-fire.md",
  "cases/case-001-kumamoto-2016.md",
  "cases/case-002-e-defense-2008.md",
];

export type RoomKnowledge = { revision: string; notes: { reference: KnowledgeReference; text: string }[] };

/** 同じリクエストの入力と出典検証には、同じ版のMDを使う。 */
export async function loadRoomKnowledge(root = join(process.cwd(), "knowledge")): Promise<RoomKnowledge> {
  const [sources, ...documents] = await Promise.all([
    readFile(join(root, "SOURCES.md"), "utf8"),
    ...ROOM_NOTES.map(file => readFile(join(root, file), "utf8")),
  ]);
  const registry = new Map<string, { title: string; url: string }>();
  for (const line of sources.split("\n")) {
    const match = line.match(/^\| (S-[A-Z0-9-]+) \| ([^|]+) \|/);
    const link = match?.[2].match(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/);
    if (match && link) registry.set(match[1], { title: link[1], url: link[2] });
  }
  const notes = documents.map((document) => {
    const parts = document.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
    if (!parts) throw new Error("invalid knowledge document");
    const field = (key: string) => parts[1].match(new RegExp(`^${key}: (.+)$`, "m"))?.[1].trim();
    const id = field("id"), title = field("title"), date = field("checked_at")?.replace(/^"|"$/g, "");
    const sourceIds = field("source_ids")?.match(/^\[([A-Z0-9, -]+)\]$/)?.[1].split(",").map(id => id.trim());
    if (!id || !title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      field("review_status") !== "source_checked" || !sourceIds?.length || sourceIds.some(id => !registry.has(id))) {
      throw new Error("unchecked knowledge document");
    }
    return {
      reference: { id, title, checkedAt: date, sources: sourceIds.map(id => ({ id, ...registry.get(id)! })) },
      text: parts[2].trim(),
    };
  });
  if (new Set(notes.map(note => note.reference.id)).size !== notes.length) throw new Error("duplicate knowledge ID");
  const revision = createHash("sha256").update(JSON.stringify([sources, ...documents])).digest("hex").slice(0, 16);
  return { revision, notes };
}
