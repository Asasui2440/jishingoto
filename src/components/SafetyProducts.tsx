"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import type { Risk } from "@/lib/content";
import { amazonSearchUrl, safetyProductsFor } from "@/lib/recommendations";
import { useSettings } from "@/lib/settings";

export function SafetyProducts({ risks }: { risks: Risk[] }) {
  const products = useMemo(() => safetyProductsFor(risks), [risks]);
  const { audience } = useSettings();
  const adult = audience === "adult";

  if (products.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-primary-soft px-[18px] py-4">
        <p className="font-display text-15 font-bold text-ink">
          {adult ? "検出結果に合った防災用品" : <Furigana text="見[み]つかった危険[きけん]に合[あ]う防災[ぼうさい]グッズ" />}
        </p>
        <p className="mt-1 text-11 leading-[1.6] text-ink-muted">
          {adult
            ? "備え方の提案です。設置条件に合うものを選んでください。"
            : <Furigana text="確認[かくにん]した場所に合う対策[たいさく]の例です。家族と相談して選ぼう。" />}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {products.map((product) => (
          <li key={product.id} className="px-[18px] py-4">
            <div className="flex items-start gap-3">
              <Image src={`/illustrations/products/${product.id}.png`} alt={`${product.name}の種類を示すイラスト`} width={160} height={160} className="size-20 shrink-0 rounded-field object-contain" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ink">
                  {adult ? product.name : <Furigana text={product.easyName} />}
                </p>
                <p className="mt-0.5 text-11 text-primary-ink">
                  {adult ? "対応する検出箇所" : "見つかった場所"}：
                  <Furigana text={product.riskNames.join("・")} adult={product.adultRiskNames.join("・")} />
                </p>
                <p className="mt-1.5 text-13 leading-[1.55] text-ink-muted">
                  {adult ? product.reason : <Furigana text={product.easyReason} />}
                </p>
                {adult && product.examples?.map((example) => <div key={example.name} className="mt-3 rounded-field bg-canvas p-3">
                  <p className="text-13 font-bold">{example.name}</p>
                  <p className="mt-1 text-11">{example.specification}</p>
                  <p className="mt-2 text-11 text-ink-muted">買う前に：{example.check}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={example.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-13 font-bold text-primary-ink underline">メーカー仕様 ↗</a>
                    <a href={amazonSearchUrl(example.name)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-pill border border-primary-mid bg-surface px-3 text-13 font-bold text-primary-ink">この型番をAmazonで探す ↗</a>
                  </div>
                </div>)}
                {adult && !product.examples?.length && <a
                  href={amazonSearchUrl(product.query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-pill border-2 border-primary-mid bg-surface px-4 font-display text-13 font-bold text-primary-ink active:bg-primary-soft"
                  aria-label={`${product.name}をAmazonで検索（新しいタブで開きます）`}
                >
                  Amazonで候補を見る&nbsp; ↗
                </a>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-[18px] py-3 text-11 leading-[1.55] text-ink-faint">
        {adult
          ? "製品仕様の確認日：2026年9月12日。価格・在庫はリンク先で確認してください。学校・会社への設置は施設管理者と相談してください。"
          : <Furigana text="イラストはグッズの種類[しゅるい]の例[れい]です。選[えら]び方[かた]や取[と]り付[つ]け方[かた]は、お家[うち]の人[ひと]と相談[そうだん]しよう。" />}
      </p>
    </Card>
  );
}
