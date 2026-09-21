"use client";

/**
 * 公開トップページ(/)のモバイル画面下部タブ(タスク3-5: モバイルUI)。
 *
 * requirements.md「3.1 公開ページ」モバイル表示の
 * 「画面下部のタブで『地図』と『動画一覧』を切り替える方式」に対応する。
 *
 * 設計判断:
 * - デスクトップ幅(md以上)ではタブ自体を表示しない(`md:hidden`)。デスクトップは
 *   従来通り左サイドバー+地図のレイアウトを維持するため(requirements.md「PC表示」)。
 * - タブ切り替えは表示状態(どのビューを見せるか)の制御に留め、地図コンポーネントの
 *   マウント/アンマウントは行わない(呼び出し側 src/app/page.tsx が地図の表示/非表示を
 *   CSSの`hidden`クラスで行い、MapLibreのインスタンスを保持する。詳細は
 *   src/app/page.tsxのコメント参照)。このコンポーネント自身は選択状態を保持しない
 *   制御コンポーネントとし、現在のタブ(activeTab)と切り替えコールバックのみを扱う。
 * - 各タブボタンには data-testid と data-active(選択中かどうか)を付与し、
 *   E2Eで見た目の色ではなくDOM属性で決定的にタブの選択状態を検証できるようにする。
 */

/** 切り替え可能なモバイルタブの種類 */
export type MobileTab = "map" | "videos";

/** タブバー本体(nav要素)に付与するdata-testid */
export const MOBILE_TAB_BAR_TEST_ID = "mobile-tab-bar";
/** 「地図」タブボタンに付与するdata-testid */
export const MOBILE_TAB_MAP_TEST_ID = "mobile-tab-map";
/** 「動画一覧」タブボタンに付与するdata-testid */
export const MOBILE_TAB_VIDEOS_TEST_ID = "mobile-tab-videos";

interface MobileTabBarProps {
  /** 現在アクティブなタブ */
  activeTab: MobileTab;
  /** タブ選択時に呼ばれるコールバック */
  onSelectTab: (tab: MobileTab) => void;
}

function tabButtonClassName(isActive: boolean): string {
  const base =
    "flex-1 py-3 text-center text-sm font-medium transition-colors border-t-2 dark:text-zinc-300";
  return isActive
    ? `${base} border-orange-500 text-orange-600 dark:text-orange-400`
    : `${base} border-transparent text-zinc-500 dark:text-zinc-400`;
}

export function MobileTabBar({ activeTab, onSelectTab }: MobileTabBarProps) {
  return (
    <nav
      data-testid={MOBILE_TAB_BAR_TEST_ID}
      className="flex shrink-0 border-t border-zinc-200 bg-white md:hidden dark:border-zinc-800 dark:bg-zinc-950"
    >
      <button
        type="button"
        data-testid={MOBILE_TAB_MAP_TEST_ID}
        data-active={activeTab === "map" ? "true" : "false"}
        onClick={() => onSelectTab("map")}
        className={tabButtonClassName(activeTab === "map")}
      >
        地図
      </button>
      <button
        type="button"
        data-testid={MOBILE_TAB_VIDEOS_TEST_ID}
        data-active={activeTab === "videos" ? "true" : "false"}
        onClick={() => onSelectTab("videos")}
        className={tabButtonClassName(activeTab === "videos")}
      >
        動画一覧
      </button>
    </nav>
  );
}
