import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Gabarito, Noto_Sans_JP, Rethink_Sans } from "next/font/google";
import "./globals.css";
import { PhaseOneNavigation } from "@/components/ui/PhaseOneNavigation";
import { SettingsProvider } from "@/lib/settings";
import { SessionProvider } from "@/lib/session";

// Figma で使われている 2 書体。日本語のグリフは持たないので Noto Sans JP に落ちる。
const gabarito = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
  display: "swap",
});

const rethinkSans = Rethink_Sans({
  variable: "--font-rethink-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ジシンゴト！｜地震＋自分事",
  description:
    "部屋の写真から危ないところを見つけて、地震のときの動きを試せる防災シミュレーション。",
  manifest: "/offline-evac/manifest.webmanifest",
  icons: {
    icon: { url: "/brand/symbol-v6.png", type: "image/png", sizes: "1254x1254" },
    apple: { url: "/brand/symbol-v6.png", type: "image/png", sizes: "1254x1254" },
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ジシンゴト！" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f7f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${gabarito.variable} ${rethinkSans.variable} ${notoSansJp.variable} h-full`}
      // 設定を読み込む前でも ruby が崩れないよう、既定値を先に置いておく
      data-furigana="off"
      data-ui-scale="normal"
      data-audience="child"
    >
      <body className="min-h-full">
        <Script src="/offline-evac/entry.mjs" type="module" strategy="afterInteractive" />
        <SettingsProvider>
          <SessionProvider>
            {/* 画面幅に合わせて本文を広げ、スマホからタブレットまで同じ体験を表示する */}
            <div className="app-page legacy-page bg-canvas border-x border-border/60">
              <PhaseOneNavigation />
              {children}
            </div>
          </SessionProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
