"use client";

import { useEffect, useRef, useState } from 'react';
import { loadMaps } from '@/lib/gmaps';
import { selectUIPlace, type PlaceSelection } from '@/lib/place-selection';
import { BottomSheet, GameIcon } from './GameUI';

export function PlacesSearch({ onSelect }: { onSelect: (selection: PlaceSelection) => void }) {
  const [text, setText] = useState('');
  const [request, setRequest] = useState<{ query: string; id: number } | null>(null);
  return <>
    <form onSubmit={event => { event.preventDefault(); if (text.trim()) setRequest({ query: text.trim(), id: Date.now() }); }} className="flex gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-white px-3"><GameIcon name="search" className="size-4 shrink-0 text-ink-muted" /><input aria-label="建物名・駅名・住所で出発地点を検索" placeholder="建物名・駅名・住所を入力" maxLength={200} value={text} onChange={event => setText(event.target.value)} className="h-11 min-w-0 w-full bg-transparent text-base" /></label>
      <button type="submit" disabled={!text.trim()} className="min-h-11 rounded-2xl bg-white px-3 text-13 font-bold disabled:opacity-40">検索</button>
    </form>
    <BottomSheet open={!!request} title="出発地点を選ぶ" onClose={() => setRequest(null)}>
      {request ? <SearchResults key={request.id} query={request.query} onSelect={selection => { setRequest(null); onSelect(selection); }} /> : null}
    </BottomSheet>
  </>;
}

function SearchResults({ query, onSelect }: { query: string; onSelect: (selection: PlaceSelection) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  useEffect(() => { callback.current = onSelect; }, [onSelect]);
  const [status, setStatus] = useState('候補を探しています…');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true, cleanup = () => {};
    const container = host.current;
    const fail = (message: string) => { if (current) { setError(true); setStatus(message); } };
    const timeout = window.setTimeout(() => { cleanup(); container?.replaceChildren(); current = false; setError(true); setStatus('検索に時間がかかっています。通信を確認して、もう一度検索してください。'); }, 20000);
    void (async () => {
      const maps = await loadMaps();
      const lib = await maps.importLibrary('places') as google.maps.PlacesLibrary;
      if (!current || !container) return;
      const search = new lib.PlaceSearchElement({ selectable: true });
      const request = new lib.PlaceTextSearchRequestElement({ textQuery: query, maxResultCount: 5 });
      const config = document.createElement('gmp-place-content-config');
      config.append(document.createElement('gmp-place-address'));
      search.append(config, request);
      search.style.width = '100%';
      search.style.colorScheme = 'light';
      let acquiredAt = 0;
      const loaded = () => { if (current) { clearTimeout(timeout); acquiredAt = Date.now(); setError(false); setStatus(search.places.length ? '出発する場所を選んでください。' : '見つかりませんでした。市区町村名を加えて検索してください。'); } };
      const failed = () => { clearTimeout(timeout); fail('検索を利用できません。通信状況と、Places UI Kit APIの有効化・キーの制限を確認してください。'); };
      const selected = (event: google.maps.places.PlaceSelectEvent) => {
        if (!current || !acquiredAt) return;
        try { callback.current(selectUIPlace(event.place, query, acquiredAt)); }
        catch (e) { fail(e instanceof Error ? e.message : 'この地点は選択できません。'); }
      };
      search.addEventListener('gmp-load', loaded);
      search.addEventListener('gmp-error', failed);
      search.addEventListener('gmp-select', selected);
      cleanup = () => { search.removeEventListener('gmp-load', loaded); search.removeEventListener('gmp-error', failed); search.removeEventListener('gmp-select', selected); search.remove(); };
      container.replaceChildren(search);
    })().catch(() => { clearTimeout(timeout); fail('検索を読み込めませんでした。通信状況と地図の設定を確認してください。'); });
    return () => { current = false; clearTimeout(timeout); cleanup(); container?.replaceChildren(); };
  }, [query, attempt]);
  return <div className="space-y-3">
    <p className="text-13 font-bold">「{query}」の検索結果</p>
    <p role={error ? 'alert' : 'status'} className="text-13 text-ink-muted">{status}</p>
    <div ref={host} className="min-w-0" />
    {error ? <button className="min-h-11 rounded-xl bg-primary px-4 text-13 font-bold" onClick={() => { setError(false); setStatus('候補を探しています…'); setAttempt(n => n + 1); }}>もう一度検索する</button> : null}
  </div>;
}
