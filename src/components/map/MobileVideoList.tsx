"use client";

/**
 * 公開トップページ(/)のモバイル用「動画一覧」タブの中身(タスク3-5: モバイルUI)。
 *
 * requirements.md「3.1 公開ページ」モバイル表示の
 * 「画面下部のタブで『地図』と『動画一覧』を切り替える方式」に対応する。
 * 「動画一覧」タブの内容は、デスクトップのVideoSidebar(src/components/map/VideoSidebar.tsx)
 * と同等(サムネ+タイトル+公開日、動画クリックでその動画にフォーカス)とする。
 *
 * 設計判断:
 * - VideoSidebar.tsx を直接モバイルでも表示に使う(className変更で対応)のではなく、
 *   このモバイル専用コンポーネントを新設した。理由は、VideoSidebar.tsxの
 *   `data-testid="video-sidebar"` や各アイテムの `data-testid="sidebar-video-item"` 等が
 *   既存E2E(e2e/sidebar.spec.ts)で「モバイル幅では video-sidebar が非表示」という
 *   前提の検証に使われており、同じdata-testidを持つ要素をモバイル用にもう1つDOMへ
 *   追加すると、Playwrightのstrict modeロケータ(page.getByTestId(...))が
 *   複数要素にマッチして既存テストを壊すため。そのためモバイル専用の
 *   data-testid(MOBILE_VIDEO_LIST_TEST_ID等)を独立して定義する。
 * - データ取得は行わない制御コンポーネント(VideoSidebarと同じ方針)。呼び出し側
 *   (src/app/page.tsx)が公開日降順に並べ替え済みのvideos配列を渡す。
 * - 動画クリック時のタブ切り替え(「地図」タブへの遷移)は呼び出し側の責務とする
 *   (onVideoClickコールバック内でselectedVideoIdの更新とタブ切り替えの両方を行う)。
 *
 * タスク7-3(公開ページのデザイン刷新)での見た目変更:
 * - 見本はモバイルの「動画一覧」タブの中身自体は示していないが、requirements.mdの
 *   「デスクトップのVideoSidebarと同等」という設計方針に合わせ、VideoSidebar
 *   (src/components/map/VideoSidebar.tsx)と同じ配色言語(青地+網点模様、見出し
 *   「VIDEOS 紹介した動画」、選択中カードはクリーム+黄縁取り)で統一する。ロゴは
 *   画面上部のMobileHeader(src/components/map/MobileHeader.tsx)が既に表示しているため
 *   ここでは重複させない。DOM構造・data-testidは変更しない。
 */
import { formatDateJa } from "@/lib/date-format";
import { buildYoutubeThumbnailUrl } from "@/lib/youtube";
import type { Video } from "@/types/video";

/** モバイル動画一覧タブの本体(div要素)に付与するdata-testid */
export const MOBILE_VIDEO_LIST_TEST_ID = "mobile-video-list";

interface MobileVideoListProps {
  /** 表示する動画一覧。公開日降順に並べ替え済みのものを渡すこと(呼び出し側の責務) */
  videos: Video[];
  /** 現在ハイライト(地図フォーカス)中の動画ID。未選択の場合はnull */
  selectedVideoId: string | null;
  /** 動画アイテムクリック時に呼ばれるコールバック */
  onVideoClick: (videoId: string) => void;
}

export function MobileVideoList({ videos, selectedVideoId, onVideoClick }: MobileVideoListProps) {
  return (
    <div
      data-testid={MOBILE_VIDEO_LIST_TEST_ID}
      className="brand-dot-pattern flex h-full w-full flex-col overflow-y-auto bg-brand-blue text-white"
    >
      <h2 className="font-brand-display px-4 pt-4 pb-1.5 text-xs font-black tracking-[0.12em] text-brand-yellow">
        VIDEOS 紹介した動画
      </h2>
      {videos.length === 0 ? (
        <p data-testid="mobile-video-list-empty" className="px-4 py-3 text-sm text-white/80">
          公開済みの動画がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 px-2.5 pb-4">
          {videos.map((video) => {
            const isSelected = video.id === selectedVideoId;
            return (
              <li key={video.id}>
                <button
                  type="button"
                  data-testid="mobile-video-list-item"
                  data-video-id={video.id}
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => onVideoClick(video.id)}
                  className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-brand-paper text-brand-ink shadow-[0_0_0_3px_var(--brand-yellow),0_4px_0_3px_var(--brand-blue-deep)]"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  {/* i.ytimg.com はnext.config.tsの画像許可ドメイン未整備のためimgを使用(VideoSidebar.tsxと同方針) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-testid="mobile-video-list-thumbnail"
                    src={buildYoutubeThumbnailUrl(video.id)}
                    alt={video.title}
                    className="h-14 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span data-testid="mobile-video-list-title" className="text-sm font-bold">
                      {video.title}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${isSelected ? "text-brand-ink-soft" : "text-white/75"}`}
                    >
                      {formatDateJa(video.publishedAt)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
