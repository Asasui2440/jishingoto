import { Furigana } from "@/components/ui/Furigana";

export function RouteLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-11 text-ink-muted" aria-label="地図の凡例">
      <span className="flex items-center gap-1.5"><i className="w-5 border-t-2 border-dashed border-primary-mid" /><Furigana text="予定[よてい]の道[みち]" /></span>
      <span className="flex items-center gap-1.5"><i className="w-5 rounded-full border-t-4 border-primary-ink" /><Furigana text="通[とお]った道[みち]" /></span>
      <span className="flex items-center gap-1.5"><i className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold not-italic text-ink">1</i><Furigana text="判断[はんだん]ポイント" /></span>
    </div>
  );
}
