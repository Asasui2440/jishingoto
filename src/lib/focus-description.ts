/** 番号から説明へ移動。マウス操作でもフォーカスを明示し、キーボードでも続けて読める。 */
export function focusDescription(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: "instant" });
}
