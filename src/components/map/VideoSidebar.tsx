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
 *
 * 詳細シートとの重なり対策(タスク6-1・P-019、daychi-review FAIL 1回目 2026-09-25対応):
 * - 当初、動画クリックで詳細シート(DetailSheet)も開くようになったことに対応するため、
 *   このサイドバー自体にDetailSheetのオーバーレイ(z-40)より高いz-index(z-[60])と
 *   pointer-events-noneを付与する対応を試みたが、この方式だとサイドバー自体が
 *   常にオーバーレイ・シートより手前に描画されてしまい、動画本数が多い場合
 *   (E2Eレビューで5件以上のケースを確認)にサイドバーの各アイテムが詳細シートの
 *   店名・サムネイル・動画リンク等を覆い隠し、`detail-sheet-video-link` 等への
 *   クリックが奪われるリグレッションが判明した(既存specは動画3件以下のみで
 *   発覚しなかった)。
 * - そのため、このサイドバー側でz-index/pointer-eventsを操作する方式は撤回し、
 *   代わりにrequirements.md「PCでは詳細シートと背景の暗転を地図部分(左の動画一覧の
 *   右側)の幅だけに表示し、シートを開いたまま動画一覧をスクロール・クリックできる
 *   ようにする」(2026-09-25決定)の通り、DetailSheet側(src/components/map/DetailSheet.tsx)の
 *   オーバーレイ・シート本体の横幅をPC(md以上)ではこのサイドバーの幅(w-72)の分だけ
 *   右にオフセットする対応に変更した。これによりPCではオーバーレイ・シートがこの
 *   サイドバーの領域と幾何学的に重ならなくなるため、このサイドバー自体には
 *   z-index/pointer-eventsの特別な指定が一切不要になる(通常のflow配置のまま)。
 *
 * タスク7-3(公開ページのデザイン刷新)での見た目変更:
 * - 見本(docs/design/phase7-ui-mock.html「2. PC表示」)のサイドバー(青地+網点模様、
 *   上部にロゴ、見出し「VIDEOS 紹介した動画」)に合わせる。幅(w-72)・DOM構造・
 *   data-testid・クリック挙動は変更しない(DetailSheet側のmd:left-72オフセット計算に
 *   影響しないようにするため)。
 * - 選択中の動画カードは見本と同じくクリームの地+黄色の縁取り(box-shadow)+ずらした影に
 *   する。ロゴはsrc/components/brand/Wordmarkを再利用し、アニメーションなし
 *   (animate指定なし=既定false)の静止表示にする。
 */
import { Wordmark } from "@/components/brand/Wordmark";
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
      className="brand-dot-pattern hidden h-full w-72 shrink-0 flex-col overflow-y-auto bg-brand-blue text-white md:flex"
    >
      <div className="border-b border-white/15 px-4 py-4">
        <Wordmark className="text-[3.6rem]" />
      </div>
      <h2 className="font-brand-display px-4 pt-4 pb-1.5 text-xs font-black tracking-[0.12em] text-brand-yellow">
        VIDEOS 紹介した動画
      </h2>
      {videos.length === 0 ? (
        <p data-testid="sidebar-video-empty" className="px-4 py-3 text-sm text-white/80">
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
                  data-testid="sidebar-video-item"
                  data-video-id={video.id}
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => onVideoClick(video.id)}
                  className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-brand-paper text-brand-ink shadow-[0_0_0_3px_var(--brand-yellow),0_4px_0_3px_var(--brand-blue-deep)]"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  {/* i.ytimg.com はnext.config.tsの画像許可ドメイン未整備のためimgを使用(DetailSheet.tsxと同方針) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-testid="sidebar-video-thumbnail"
                    src={buildYoutubeThumbnailUrl(video.id)}
                    alt={video.title}
                    className="h-14 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span data-testid="sidebar-video-title" className="text-sm font-bold">
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
    </aside>
  );
}
