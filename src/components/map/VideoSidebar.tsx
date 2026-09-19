"use client";

/**
 * 公開トップページ(/)の左サイドバー動画一覧(タスク3-3)。
 *
 * requirements.md「3.1 公開ページ」の
 * 「左サイドバーに動画一覧(サムネイル + タイトル)。動画をクリックすると、
 *   その動画で紹介された店舗を地図上でフォーカス・ハイライトする」に対応する。
 *
 * - PC表示限定: モバイル(3-5でタブ切替UIを実装予定)で地図の邪魔にならないよう、
 *   Tailwindの `hidden md:flex` でデスクトップ幅(md以上)のみ表示する。
 * - データ取得は行わない制御コンポーネント(PublicMap/DetailSheetと同じ方針)。
 *   呼び出し側(src/app/page.tsx)が公開日降順に並べ替え済みのvideos配列を渡す
 *   (このコンポーネント自身はソートを行わない)。
 * - 現在選択中(=地図でハイライト中)の動画は selectedVideoId で受け取り、
 *   該当アイテムに data-selected="true" とハイライト背景を付与する。
 * - 各アイテムには data-testid="sidebar-video-item" と data-video-id を付与し、
 *   E2Eで動画IDベースに特定・クリックできるようにする。
 */
import { formatDateJa } from "@/lib/date-format";
import { buildYoutubeThumbnailUrl } from "@/lib/youtube";
import type { Video } from "@/types/video";

/** サイドバー本体(aside要素)に付与するdata-testid */
export const VIDEO_SIDEBAR_TEST_ID = "video-sidebar";

interface VideoSidebarProps {
  /** 表示する動画一覧。公開日降順に並べ替え済みのものを渡すこと(呼び出し側の責務) */
  videos: Video[];
  /** 現在ハイライト(地図フォーカス)中の動画ID。未選択の場合はnull */
  selectedVideoId: string | null;
  /** 動画アイテムクリック時に呼ばれるコールバック */
  onVideoClick: (videoId: string) => void;
}

export function VideoSidebar({ videos, selectedVideoId, onVideoClick }: VideoSidebarProps) {
  return (
    <aside
      data-testid={VIDEO_SIDEBAR_TEST_ID}
      className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-900 dark:text-zinc-50">
        動画一覧
      </h2>
      {videos.length === 0 ? (
        <p
          data-testid="sidebar-video-empty"
          className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400"
        >
          公開済みの動画がありません。
        </p>
      ) : (
        <ul className="flex flex-col">
          {videos.map((video) => {
            const isSelected = video.id === selectedVideoId;
            return (
              <li key={video.id}>
                <button
                  type="button"
                  data-testid="sidebar-video-item"
                  data-video-id={video.id}
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => onVideoClick(video.id)}
                  className={`flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900 ${
                    isSelected ? "bg-orange-50 dark:bg-orange-950" : ""
                  }`}
                >
                  {/* i.ytimg.com はnext.config.tsの画像許可ドメイン未整備のためimgを使用(DetailSheet.tsxと同方針) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-testid="sidebar-video-thumbnail"
                    src={buildYoutubeThumbnailUrl(video.id)}
                    alt={video.title}
                    className="h-14 w-24 shrink-0 rounded object-cover"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span
                      data-testid="sidebar-video-title"
                      className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
                    >
                      {video.title}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateJa(video.publishedAt)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
