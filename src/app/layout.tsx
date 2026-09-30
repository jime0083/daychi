import type { Metadata } from "next";
import { Geist, Geist_Mono, Oleo_Script, Vollkorn } from "next/font/google";

import { FIRST_VIEW_STORAGE_KEY } from "@/lib/first-view";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ファーストビュー(タスク7-2)のロゴ「DayChi COFFEE MAP」用書体。
// requirements.md 3.1.1: 「DayChi」= Oleo Script(Bold=700)、
// 「COFFEE MAP」= Vollkorn(Black=900)。どちらもGoogle Fonts(OFL)。
// next/font/googleでビルド時に読み込み、CSS変数として公開する
// (src/components/brand/Wordmark.module.cssがvar(--font-oleo-script)/
// var(--font-vollkorn)として参照する)。next/font/googleはフォントファイルを
// 自前ホストしFOUT/レイアウトシフトを抑制するため、読み込み前に崩れた状態で
// 描画される問題を避けられる。
const oleoScript = Oleo_Script({
  variable: "--font-oleo-script",
  weight: "700",
  subsets: ["latin"],
});

const vollkorn = Vollkorn({
  variable: "--font-vollkorn",
  weight: "900",
  subsets: ["latin"],
});

const SITE_NAME = "DayChi COFFEE MAP";
const SITE_DESCRIPTION =
  "YouTubeチャンネル「Daychi〜COFFEE CHANNEL」で紹介されたコーヒー店を地図で確認できるサービス";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    images: [{ url: "/og.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
};

/**
 * ファーストビュー(タスク7-2、review FAIL 1回目対応)のフリッカー修正用ブロッキングスクリプト。
 *
 * 問題: src/components/brand/FirstView.tsx はReactのuseEffect(マウント後、つまり
 * サーバー側で送られた生HTMLがブラウザに一度描画された後)でsessionStorageを確認していた。
 * そのため、初回アクセス時はサーバーHTMLの時点でオーバーレイが存在せず、JSが読み込まれ
 * 実行されるまでの間(実測7〜8フレーム・約8〜123ms、PC/モバイルとも)、背後の公開ページ
 * (サイドバーの「動画一覧」テキストや「地図を読み込み中...」等)がそのまま見えてしまう
 * (review FAIL 1回目の証拠: e2e/artifacts/review-7-2/flicker-desktop-frames.json)。
 *
 * 修正方針: FirstView自体は「常にvisibleを初期値としてSSR/初回クライアント描画する」よう変更し
 * (サーバーがsessionStorageを知りえないため、背景を覆うオーバーレイを常に描く側に倒す)、
 * 「再読み込みでは表示しない」という要件は、このブロッキングスクリプトで担保する:
 * - sessionStorageに既読みフラグがあれば、<html>にdata-first-view="seen"属性を即座に付与する
 * - globals.cssの `html[data-first-view="seen"] [data-testid="first-view"] { display: none }`
 *   により、Reactのオーバーレイ描画そのものより前に(ブラウザの最初のペイントより前に)、
 *   再読み込み時はオーバーレイが1フレームも見えないようにする
 * これにより「初回は1フレームも背景が見えない」「再読み込みは1フレームもオーバーレイが
 * 見えない」の両方を、JSの実行タイミングに依存せず保証できる。検証はe2e/first-view.spec.ts
 * のフレーム計測テスト参照。
 *
 * review FAIL 2回目(2026-10-01実機確認)で判明した実装上の注意: 当初next/script
 * (strategy="beforeInteractive")で実装したが、Next.js 16 App Router + Turbopackの
 * dev環境では、next/scriptのbeforeInteractiveスクリプトはナビゲーション直後の生HTMLに
 * 素の<script>タグとして出力されず、Next.js自身のRSCストリーミング/クライアント
 * ランタイム経由で実行される実装になっており、実際の実行はNext.jsのブートストラップJSの
 * 読み込み後(実測で約100ms前後)になることをフレーム計測(e2e/first-view.spec.ts)で確認した
 * (=「hydrationより前」ではあっても「最初のペイントより前」ではなかった)。
 * そのため、next/scriptを使わず、Server Component(このRootLayout自体)のJSXで素の
 * <script>要素を<head>内に直接描画する(dangerouslySetInnerHTML)方式に変更した。
 * Server ComponentのJSXとして描画された通常のHTML要素はNext.jsの初期HTMLストリームに
 * そのまま(RSCの特殊な仕組みを経由せず)出力される。実際の出力(curlで確認)では
 * <head>内の他のmeta/link要素より後・</head>の直前に配置されるが、いずれにせよ
 * <body>(ファーストビューのオーバーレイを含む)より確実に前でありasyncも付けていないため、
 * ブラウザは<body>の内容をパースするより前にこの<script>を同期的に実行する
 * (通常の<script>タグの標準的な挙動)。
 *
 * suppressHydrationWarning: このスクリプトが<html>にdata-first-view属性を(hydration前に)
 * 追加しうるため、Reactのサーバー側出力(属性なし)とクライアント側DOM(属性ありうる)の
 * 差異でhydration不整合の警告が出るのを防ぐ(next-themes等で使われる標準的な対処)。
 * <html>要素1階層分のみに効くため、他の不整合を握り潰す心配はない。
 */
const FIRST_VIEW_BLOCKING_SCRIPT = `(function () {
  try {
    if (window.sessionStorage.getItem(${JSON.stringify(FIRST_VIEW_STORAGE_KEY)}) === "true") {
      document.documentElement.setAttribute("data-first-view", "seen");
    }
  } catch (e) {}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${oleoScript.variable} ${vollkorn.variable} h-full antialiased`}
    >
      <head>
        {/* 意図的に同期実行させるブロッキングスクリプト(上記コメント参照)。next/scriptは使わない */}
        <script dangerouslySetInnerHTML={{ __html: FIRST_VIEW_BLOCKING_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
