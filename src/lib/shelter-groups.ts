import type { LatLng, Shelter } from "./evac-content";

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").trim();
const meters = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111132, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
const hash = (text: string) => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};

/** 校舎名だけを外す。分校・別キャンパスなどの名称は同一視しない。 */
function schoolName(name: string) {
  const match = normalize(name).match(/^(.+?(?:小学校|中学校|高等学校))(.*)$/);
  if (!match) return null;
  const suffix = match[2].replace(/[()・、]/g, "");
  return /^(?:(?:(?:第?[0-9一二三四五六七八九十]+|[東西南北]|本|新|旧)?校舎)|体育館|屋内運動場|運動場|校庭|グラウンド|[東西南北]棟|第?[A-Z0-9一二三四五六七八九十]+号?棟)*$/.test(suffix) ? match[1] : null;
}

/** 同じ学校・住所の近接地点をまとめる。経路の目的地には実在する代表地点を残す。 */
export function groupSchoolShelters(list: Shelter[], near: LatLng): Shelter[] {
  const groups: { key: string; anchor: LatLng; members: Shelter[]; name: string | null }[] = [];
  const entries = list.flatMap(s => s.facilities?.length ? s.facilities : [s])
    .sort((a, b) => meters(near, a.position) - meters(near, b.position) || a.id.localeCompare(b.id));
  for (const entry of entries) {
    const name = schoolName(entry.name), address = normalize(entry.address).replace(/[−‐ー－]/g, "-");
    const key = name && address ? `${name}:${address}` : entry.id;
    let group = groups.find(g => g.key === key && meters(g.anchor, entry.position) <= 250);
    if (!group) { group = { key, anchor: entry.position, members: [], name: name && address ? name : null }; groups.push(group); }
    if (!group.members.some(s => s.id === entry.id)) group.members.push(entry);
  }
  return groups.map(group => {
    const representative = group.members[0];
    if (!group.name) return representative;
    // 災害ケースが変わって代表校舎が変わっても、学校としての選択を保持する。
    const collision = groups.some(other => other !== group && other.key === group.key);
    return {
      ...representative,
      id: `gsi-school-${hash(group.key)}${collision ? `-${representative.id}` : ""}`,
      name: group.name,
      supportedDisasters: [...new Set(group.members.flatMap(s => s.supportedDisasters ?? []))],
      facilities: group.members,
    };
  });
}
