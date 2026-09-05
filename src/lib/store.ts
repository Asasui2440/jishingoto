"use client";

import { useCallback, useSyncExternalStore } from "react";

type Store<T> = {
  get: () => T;
  set: (patch: Partial<T> | ((prev: T) => T)) => void;
  subscribe: (fn: () => void) => () => void;
  serverSnapshot: () => T;
};

/**
 * localStorage / sessionStorage を React の外部ストアとして扱う。
 *
 * `useSyncExternalStore` を使うことで、
 * 「マウント後に読み込んで setState」というちらつきのもとを避けられる。
 * ストレージが使えない環境（プライベートブラウジングなど）では
 * メモリ上の値だけで動く。
 */
export function createPersistentStore<T extends object>(
  key: string,
  initial: T,
  area: "local" | "session",
  /** 保存するときに落とすキー（blob URL など、次回使えない値） */
  omit: (keyof T)[] = [],
): Store<T> {
  let cached: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const storage = (): Storage | null => {
    try {
      return area === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };

  const get = (): T => {
    // 初回だけストレージから読む。以降はメモリ上の値が正。
    if (!loaded && typeof window !== "undefined") {
      loaded = true;
      try {
        const raw = storage()?.getItem(key);
        if (raw) cached = { ...initial, ...(JSON.parse(raw) as Partial<T>) };
      } catch {
        // 壊れていたら既定値のまま進む
      }
    }
    return cached;
  };

  const persist = () => {
    const copy = { ...cached };
    for (const k of omit) delete copy[k];
    try {
      storage()?.setItem(key, JSON.stringify(copy));
    } catch {
      // 保存できなくても動作は続ける
    }
  };

  const set: Store<T>["set"] = (patch) => {
    const prev = get();
    cached = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
    persist();
    listeners.forEach((fn) => fn());
  };

  return {
    get,
    set,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // SSR では常に既定値。hydration のずれを防ぐ。
    serverSnapshot: () => initial,
  };
}

export function useStore<T extends object>(store: Store<T>): [T, Store<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.serverSnapshot);
  const set = useCallback<Store<T>["set"]>((patch) => store.set(patch), [store]);
  return [value, set];
}
