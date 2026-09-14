export function GeoAnalysisSettings() {
  return <section className="space-y-2 rounded-panel border border-border p-4 text-13">
    <h2 className="font-bold">選んだ場所で練習できます</h2>
    <p>経路周辺の地理データを使って判断する場面を用意します。取得できない場合だけ、固定の練習問題で続ける方法を案内します。</p>
    <a className="inline-flex min-h-11 items-center text-primary-ink underline" href="https://www.gsi.go.jp/bousaichiri/lfc_index.html" target="_blank" rel="noreferrer">地形データ：国土地理院</a>
  </section>;
}
