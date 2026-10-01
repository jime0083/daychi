"use client";

/**
 * 公開トップページ(/)のモバイル画面上部ヘッダー(タスク7-3: 公開ページのデザイン刷新)。
 *
 * requirements.md 3.1.1「同じロゴをPCのサイドバー上部・スマホのヘッダーにも小さく表示する」と、
 * 見本(docs/design/phase7-ui-mock.html「3. スマホ表示」の`.mhead`)に基づき、モバイル幅
 * (md未満)でのみ画面最上部に青地+網点模様のヘッダーを表示し、中央にロゴ(Wordmark、
 * アニメーションなしの静止表示)を置く。
 *
 * デスクトップ幅(md以上)では非表示にする(`md:hidden`。PC表示は既存どおり左サイドバー上部に
 * ロゴを表示するVideoSidebar.tsxが担当するため、このヘッダー自体は不要)。
 *
 * レイアウト上の注意(既存の高さ計算を壊さないため):
 * - このヘッダーは呼び出し側(src/app/page.tsx)のflex-col内で他の要素(絞り込み帯・地図/
 *   動画一覧タブ・下部タブバー)と同じ通常のflexアイテムとして配置する(position: staticの
 *   ままで、fixed/absoluteにしない)。これにより、絞り込み帯(PerformerFilter/TagFilter)の
 *   実測高さ(filterBarHeightPx)やDetailSheetの最大高さ計算(min(80vh, 100dvh - 絞り込み帯高さ)。
 *   P-029対応)は、このヘッダーの存在に関わらずそのまま正しく動作する(DetailSheetは画面下端に
 *   固定表示されるため、上部に別のflexアイテムが増えても両者の重なり判定に影響しない)。
 * - 高さは内容(ロゴ)に応じた自然な高さとし、固定pxで決め打ちしない(コンテンツに応じて
 *   flex-colの残り高さから地図/動画一覧タブの領域が自動的に縮む)。
 */
import { Wordmark } from "@/components/brand/Wordmark";

/** モバイルヘッダー本体(header要素)に付与するdata-testid */
export const MOBILE_HEADER_TEST_ID = "mobile-header";

export function MobileHeader() {
  return (
    <header
      data-testid={MOBILE_HEADER_TEST_ID}
      className="brand-dot-pattern flex shrink-0 items-center justify-center bg-brand-blue px-4 py-2 md:hidden"
    >
      <Wordmark className="text-[2.3rem]" />
    </header>
  );
}
