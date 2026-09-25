"use client";

/**
 * 公開トップページ(/)のスライドアップ詳細シート(タスク3-2)。
 *
 * requirements.md「3.1 公開ページ」詳細シート仕様に厳密に従い、以下を表示する:
 *   1. 店名
 *   2. 動画サムネイル(その店を紹介した回。クリックでYouTube動画リンクを新規タブで開く)
 *   3. 出演者ごとの飲食メニュー(performerId→出演者名に解決)
 *   4. 動画公開日
 *   5. 住所
 *   6. 営業時間
 *   - 住所・営業時間の下に小さく情報基準日(shops.infoAsOf)を「※YYYY年M月D日現在」で表示
 *   - 1店舗が複数動画(複数visit)で紹介されている場合は、訪問(visit)ごとに
 *     サムネ+出演者ごとの飲食メニュー+動画公開日を並べて表示する
 *
 * データ取得は行わない制御コンポーネント(shops配列を表示するだけのPublicMapと同じ方針)。
 * 呼び出し側(src/app/page.tsx)が、選択中の店舗(shop)と、その店舗に紐づく
 * published visit×published videoの組(visitDetails。src/lib/shop-detail.tsの
 * resolveShopVisitDetailsで算出)、出演者一覧(performers)を渡す。
 *
 * 閉じる操作: 右上の閉じるボタン、またはシート外側のオーバーレイクリックのどちらでも
 * onCloseが呼ばれる(requirements.mdの「閉じるボタン(または地図クリック/オーバーレイ)」に対応)。
 * オーバーレイは地図を隠しすぎないよう薄い半透明にとどめる。
 *
 * タスク5-3で追加した表示項目:
 * - 店名の近くに、その店舗に付与されたタグ名をorder昇順で表示する(requirements.md
 *   「詳細シートの店名の近くに、その店舗のタグを表示する」)。タグの解決は
 *   src/lib/shop-filter.tsのresolveShopTags()に委譲する(shop.tagIdsにタグマスタへ
 *   存在しないID=削除済みタグが含まれていても無視して落ちない)。タグが1件も無い
 *   店舗では何も表示しない。
 */
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
import type { ShopVisitDetail } from "@/lib/shop-detail";
import { formatDateJa, formatInfoAsOf } from "@/lib/date-format";
import { resolveShopTags } from "@/lib/shop-filter";
import { buildYoutubeThumbnailUrl, buildYoutubeWatchUrl } from "@/lib/youtube";

interface DetailSheetProps {
  /** 表示対象の店舗。nullの場合はシートを閉じた状態で描画する */
  shop: Shop | null;
  /** shopに紐づく published visit×published video の組(動画公開日の昇順) */
  visitDetails: ShopVisitDetail[];
  /** performerId→出演者名の解決に使う出演者一覧 */
  performers: Performer[];
  /** shop.tagIds→タグ名の解決に使うタグ一覧(全件) */
  tags: Tag[];
  onClose: () => void;
}

/** performerIdを出演者名に解決する。見つからない場合(削除済み等)のフォールバック文言を返す */
function resolvePerformerName(performers: Performer[], performerId: string): string {
  return performers.find((performer) => performer.id === performerId)?.name ?? "(不明な出演者)";
}

export function DetailSheet({ shop, visitDetails, performers, tags, onClose }: DetailSheetProps) {
  const isOpen = shop !== null;
  const shopTags = shop === null ? [] : resolveShopTags(shop, tags);

  return (
    <>
      {isOpen && (
        <div
          data-testid="detail-sheet-overlay"
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}
      <div
        data-testid="detail-sheet"
        aria-hidden={!isOpen}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-lg transition-transform duration-300 ease-out dark:bg-zinc-950 ${
          isOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        {shop !== null && (
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <h2
                data-testid="detail-sheet-shop-name"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {shop.name}
              </h2>
              <button
                type="button"
                data-testid="detail-sheet-close"
                onClick={onClose}
                aria-label="閉じる"
                className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                閉じる
              </button>
            </div>

            {shopTags.length > 0 && (
              <ul
                data-testid="detail-sheet-tags"
                className="flex flex-wrap gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
              >
                {shopTags.map((tag) => (
                  <li
                    key={tag.id}
                    data-testid="detail-sheet-tag"
                    className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-900"
                  >
                    {tag.name}
                  </li>
                ))}
              </ul>
            )}

            <div data-testid="detail-sheet-visits" className="flex flex-col gap-4">
              {visitDetails.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  公開済みの紹介動画情報がありません。
                </p>
              ) : (
                visitDetails.map(({ visit, video }) => (
                  <div
                    key={visit.id}
                    data-testid="detail-sheet-visit"
                    className="flex flex-col gap-2 border-b border-zinc-100 pb-4 last:border-b-0 last:pb-0 dark:border-zinc-900 sm:flex-row sm:gap-4"
                  >
                    <a
                      data-testid="detail-sheet-video-link"
                      href={buildYoutubeWatchUrl(video.id)}
                      target="_blank"
                      rel="noopener"
                      className="block w-full shrink-0 sm:w-40"
                    >
                      {/* i.ytimg.com はnext.config.tsの画像許可ドメイン未整備のためimgを使用(src/app/admin/videos/page.tsxと同方針) */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        data-testid="detail-sheet-thumbnail"
                        src={buildYoutubeThumbnailUrl(video.id)}
                        alt={video.title}
                        className="h-24 w-full rounded object-cover sm:w-40"
                      />
                    </a>
                    <div className="flex flex-1 flex-col gap-1">
                      <a
                        data-testid="detail-sheet-video-title"
                        href={buildYoutubeWatchUrl(video.id)}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                      >
                        {video.title}
                      </a>
                      <p
                        data-testid="detail-sheet-published-at"
                        className="text-xs text-zinc-500 dark:text-zinc-400"
                      >
                        動画公開日: {formatDateJa(video.publishedAt)}
                      </p>
                      <ul
                        data-testid="detail-sheet-consumptions"
                        className="flex flex-col gap-0.5 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        {visit.consumptions.map((consumption, index) => (
                          <li
                            key={`${consumption.performerId}-${index}`}
                            data-testid="detail-sheet-consumption"
                          >
                            <span className="font-medium">
                              {resolvePerformerName(performers, consumption.performerId)}
                            </span>
                            : {consumption.items.join("、")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-zinc-100 pt-3 text-sm text-zinc-700 dark:border-zinc-900 dark:text-zinc-300">
              <p data-testid="detail-sheet-address">住所: {shop.address}</p>
              <p data-testid="detail-sheet-business-hours">営業時間: {shop.businessHours}</p>
              <p
                data-testid="detail-sheet-info-as-of"
                className="text-xs text-zinc-400 dark:text-zinc-500"
              >
                {formatInfoAsOf(shop.infoAsOf)}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
