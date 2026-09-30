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
 * PCでの表示幅(タスク6-1・P-019、daychi-review FAIL 1回目 2026-09-25対応):
 * - requirements.md「PCでは詳細シートと背景の暗転を地図部分(左の動画一覧の右側)の
 *   幅だけに表示し、シートを開いたまま動画一覧をスクロール・クリックできるように
 *   する」(2026-09-25決定)に対応する。
 * - タスク6-1で動画クリック時にもこのシートが開くようになったが、動画本数が多い場合
 *   (E2Eレビューで5件以上のケースを確認)、シートが画面全幅(左のVideoSidebarの上にも
 *   重なる)だと、シートを開いたまま別の動画をクリックしようとした際にシート側の
 *   要素(店名・サムネイル等)が動画一覧のクリックを奪ってしまうリグレッションが
 *   あった(src/components/map/VideoSidebar.tsxのコメント参照。既存specは動画3件以下
 *   だったため発覚しなかった)。
 * - そのためオーバーレイ・シート本体の左端を、PC(md以上)ではVideoSidebarの幅
 *   (w-72 = 18rem)と一致する `md:left-72` でオフセットする。モバイル(md未満、
 *   VideoSidebar自体が非表示)では従来通り画面全幅(inset-x-0)のままとする。
 *   これによりPCではオーバーレイ・シートがVideoSidebarの領域と幾何学的に重ならなく
 *   なるため、VideoSidebar側でz-index/pointer-eventsを操作する必要が無くなる。
 *
 * タスク5-3で追加した表示項目:
 * - 店名の近くに、その店舗に付与されたタグ名をorder昇順で表示する(requirements.md
 *   「詳細シートの店名の近くに、その店舗のタグを表示する」)。タグの解決は
 *   src/lib/shop-filter.tsのresolveShopTags()に委譲する(shop.tagIdsにタグマスタへ
 *   存在しないID=削除済みタグが含まれていても無視して落ちない)。タグが1件も無い
 *   店舗では何も表示しない。
 *
 * タスク6-2で追加した表示項目(requirements.md 2026-09-25決定・P-020):
 * - 店舗情報欄(住所・営業時間・情報基準日)の下部に、shop.instagramUrlが登録されて
 *   いる場合のみInstagramアイコン(汎用的なカメラ形。Instagram公式ロゴは模倣しない。
 *   src/components/icons/CameraIcon.tsx)を表示し、押すと新しいタブ(rel="noopener
 *   noreferrer")で当該アカウントを開く。未登録(undefined/空文字)の店舗はアイコンを
 *   表示しない。
 *
 * タスク6-3で追加した表示項目(requirements.md 2026-09-25決定・P-021):
 * - 店舗情報欄下部の同じ行(detail-sheet-shop-actions)に「Googleマップで開く」ボタン
 *   (リンク)を常に表示する。店名+住所を検索語にしたGoogle Maps URLs
 *   (src/lib/google-maps.tsのbuildGoogleMapsSearchUrl)を新しいタブ(rel="noopener
 *   noreferrer")で開く。shop.googlePlaceIdが登録されている場合はquery_place_idも
 *   付与し、確実にその店舗ページを開く。Google Maps Platformの有料API・APIキーは
 *   一切使わない(URLを開くだけ)。
 * - 営業時間(businessHours)が空欄(空白のみ含む)の店舗は、営業時間欄に
 *   「Googleマップでご確認ください」と表示する(src/lib/shop-detail.tsの
 *   formatBusinessHours)。Googleの店舗情報を保存することはGoogle Maps Platform
 *   規約で禁止のため、最新の営業時間は「Googleマップで開く」経由で確認してもらう方針。
 */
import { CameraIcon } from "@/components/icons/CameraIcon";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
import { formatBusinessHours, type ShopVisitDetail } from "@/lib/shop-detail";
import { formatDateJa, formatInfoAsOf } from "@/lib/date-format";
import { buildGoogleMapsSearchUrl } from "@/lib/google-maps";
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
  const instagramUrl = shop?.instagramUrl?.trim() ?? "";
  const hasInstagram = instagramUrl !== "";
  const googleMapsUrl =
    shop === null ? "" : buildGoogleMapsSearchUrl(shop.name, shop.address, shop.googlePlaceId);

  return (
    <>
      {isOpen && (
        <div
          data-testid="detail-sheet-overlay"
          // md:left-72: 上のコメント「PCでの表示幅」参照。PCではVideoSidebar(w-72)の
          // 右側(地図部分)だけを覆う。モバイルはVideoSidebar自体が非表示のため
          // 従来通りinset-0のまま(左端は0)
          className="fixed inset-0 z-40 bg-black/20 md:left-72"
          onClick={onClose}
        />
      )}
      <div
        data-testid="detail-sheet"
        aria-hidden={!isOpen}
        // md:left-72: オーバーレイと同じ理由(上のコメント参照)
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-lg transition-transform duration-300 ease-out md:left-72 dark:bg-zinc-950 ${
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
              <p data-testid="detail-sheet-business-hours">
                営業時間: {formatBusinessHours(shop.businessHours)}
              </p>
              <p
                data-testid="detail-sheet-info-as-of"
                className="text-xs text-zinc-400 dark:text-zinc-500"
              >
                {formatInfoAsOf(shop.infoAsOf)}
              </p>

              <div data-testid="detail-sheet-shop-actions" className="flex flex-wrap items-center gap-2 pt-1">
                {hasInstagram && (
                  <a
                    data-testid="detail-sheet-instagram-link"
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    <CameraIcon className="h-5 w-5" />
                  </a>
                )}
                <a
                  data-testid="detail-sheet-google-maps-link"
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 px-3 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Googleマップで開く
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
