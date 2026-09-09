"use client";

import { useCallback, useEffect } from "react";
import { createPersistentStore, useStore } from "./store";

/** 対応言語。`easy` は「やさしい日本語」 */
export type Locale = "ja" | "easy" | "en";

/** 年齢層に応じた UI スケール */
export type UiScale = "normal" | "large" | "xlarge";

/** 表示する文章の対象。adult は漢字中心の標準的な防災表現。 */
export type Audience = "child" | "adult";

export type Settings = {
  audience: Audience;
  locale: Locale;
  /** 漢字にふりがなを振るか（子ども・日本語学習者向け） */
  furigana: boolean;
  uiScale: UiScale;
  /** 地震の効果音・環境音を鳴らすか */
  sound: boolean;
  /** 端末のバイブレーションを使うか */
  haptics: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  audience: "child",
  locale: "ja",
  furigana: false,
  uiScale: "normal",
  sound: true,
  haptics: true,
};

const store = createPersistentStore<Settings>(
  "jishingoto.settings.v1",
  DEFAULT_SETTINGS,
  "local",
);

/**
 * `<html>` の data 属性に設定を反映する係。
 * ふりがなの表示・文字サイズは CSS 側でこの属性を見て切り替える。
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings] = useStore(store);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiScale = settings.uiScale;
    root.dataset.furigana = settings.furigana ? "on" : "off";
    root.dataset.audience = settings.audience;
    root.lang = settings.locale === "en" ? "en" : "ja";
  }, [settings.audience, settings.uiScale, settings.furigana, settings.locale]);

  return <>{children}</>;
}

export function useSettings() {
  const [settings, set] = useStore(store);
  return { ...settings, update: set };
}

/** 短い振動。設定が off のときと非対応端末では何もしない。 */
export function useHaptics() {
  const { haptics } = useSettings();
  return useCallback(
    (pattern: number | number[] = 12) => {
      if (!haptics) return;
      navigator.vibrate?.(pattern);
    },
    [haptics],
  );
}
