"use client";

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
            ? "確認済みの危険箇所に対する購入候補です。設置条件と製品仕様を確認してください。"
            : <Furigana text="確認[かくにん]した場所[ばしょ]に合[あ]うものだけを出[だ]しているよ。お家[うち]の人[ひと]と選[えら]んでね。" />}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {products.map((product) => (
          <li key={product.id} className="px-[18px] py-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-field bg-safe-soft text-lg">🛡️</span>
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
                <a
                  href={amazonSearchUrl(product.query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-pill border-2 border-primary-mid bg-surface px-4 font-display text-13 font-bold text-primary-ink active:bg-primary-soft"
                  aria-label={`${product.name}をAmazonで検索（新しいタブで開きます）`}
                >
                  Amazonで候補を見る&nbsp; ↗
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-[18px] py-3 text-11 leading-[1.55] text-ink-faint">
        {adult
          ? "外部サイトの検索結果を開きます。価格や在庫は変動します。本アプリは特定商品の安全性を保証するものではありません。"
          : <Furigana text="外部[がいぶ]サイトが開[ひら]きます。サイズや取[と]り付[つ]け方[かた]は、お家[うち]の人[ひと]と確認[かくにん]してください。" />}
      </p>
    </Card>
  );
}
