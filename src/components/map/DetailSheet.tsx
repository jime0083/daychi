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
 *
 * タスク6-3a対応(P-029): 出演者/タグ絞り込み帯(PerformerFilter+TagFilter)は、
 * 選択肢(出演者・タグ)の件数に応じて高さの上限なく伸びる。一方このシートは画面下端に
 * 固定表示され、内容量に応じて最大80vhまで伸びる。両者の高さの合計が画面高さを超えると、
 * より高いz-index(z-[60])を持つ絞り込み帯がこのシートの上部(閉じるボタン等)を画面座標上
 * で覆い、クリックを奪ってしまう不具合があった(実測: 出演者・タグ各10件程度でモバイル幅の
 * 3〜4割の高さになり再現)。呼び出し側(src/app/page.tsx)が絞り込み帯の実測高さを
 * filterBarHeightPxとして渡し、下記styleでこのシートの最大高さを
 * 「min(80vh, 画面高さ - 絞り込み帯高さ)」に追加制限することで、絞り込み帯がどれだけ
 * 伸びてもこのシートの上端が絞り込み帯の下端より上に来ないようにする(内容が収まらない分は
 * 既存のoverflow-y-autoで内部スクロールする)。
 *
 * タスク7-3(公開ページのデザイン刷新)での見た目変更:
 * - 見本(docs/design/phase7-ui-mock.html「.sheet」)のクリーム地・上端の黄色い帯(box-shadow)・
 *   店名(Vollkorn Black・緑)・黄色い小札のタグ・緑の丸枠の閉じるボタン・点線区切りの
 *   店舗情報欄・緑のGoogleマップボタンに合わせる。表示項目・順序・data-testid・
 *   左オフセット(md:left-72)・最大高さ計算(filterBarHeightPx)は一切変更しない。
 * - 閉じるボタンの見た目のみ「閉じる」の文字から「×」記号に変更する(aria-label="閉じる"は
 *   維持するため、アクセシブルな名前は変わらない。E2Eはdata-testidのみで特定しているため
 *   影響なし)。
 *
 * タスク8-2(P-032対応・requirements.md 3.1「詳細シートの動画サムネイルは動画と同じ16:9の
 * 比率で全体を表示する(切り取らない)」2026-10-01決定):
 * - サムネイル(detail-sheet-thumbnail)の表示枠を、高さ固定(h-24)からaspect-video(=16:9)の
 *   枠に変更する。fit方式はobject-cover(コーディネーターのレビュー指摘により、当初実装の
 *   object-containから変更)。hqdefault.jpgの実ファイルは480x360(4:3)だが、これは
 *   「16:9の実際の映像フレーム(480x270)の上下に45pxずつ黒帯を足したもの」であり、
 *   480x360を16:9の枠幅に合わせてスケールしてから高さ方向にcoverで切り詰めると、
 *   ちょうどこの上下の黒帯(スケール後45px相当)だけが切り取られ、実際の映像フレームは
 *   一切欠けずに枠いっぱいに表示される(計算: 枠幅Wに合わせた素のスケール後の高さは
 *   360*(W/480)=0.75W、16:9枠の高さは0.5625Wなので差分0.1875W=元画像換算90px=上下45pxずつ。
 *   これは黒帯の高さと一致する)。object-containだと黒帯ごと表示されてしまい映像が
 *   実際より小さく見える上に枠の左右に余白(ピラーボックス)ができるため不採用。
 *   枠を満たすためobject-cover採用に伴い背景の塗り(bg-brand-ink/5)は不要になり削除した。
 *   仮にサムネイルURLの実体が将来16:9そのものになった場合も、object-coverは
 *   そのまま枠いっぱいに表示するだけで映像の一部を余分に切り取ることはない。
 * - モバイルでは、シートの最大高さの上限(従来80vh固定)を外し、絞り込み欄
 *   (filterBarHeightPx。P-029参照)に重ならない範囲でシートを大きく表示できるようにする。
 *   PC(md以上)は従来どおり80vhを上限として残す(requirements.md「PCでは…従来どおり」)。
 *   TailwindのJITは動的なpx値を含むarbitrary値クラス(例: max-h-[calc(100dvh-${x}px)])を
 *   ビルド時に検出できないため(このファイルの既存コメント参照)、filterBarHeightPxは
 *   CSS変数(--detail-sheet-filter-bar-height)としてinline styleで渡し、実際のmax-height
 *   計算はsrc/app/globals.cssの`.detail-sheet-panel`クラス(ブレークポイントごとの
 *   @media規則を含む)に委譲する。
 */
import type { CSSProperties } from "react";

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
  /**
   * 出演者/タグ絞り込み帯(PerformerFilter+TagFilter)の実測高さ(px、0以上)。
   * タスク6-3a(P-029)対応: このシートの最大高さを絞り込み帯の高さ分だけ追加で
   * 制限し(下記style参照)、絞り込み帯の選択肢が多く伸びた場合でもシートの上端
   * (閉じるボタン等)が絞り込み帯と画面座標上で重ならないようにする。
   * 呼び出し側(src/app/page.tsx)がResizeObserverで実測して渡す
   */
  filterBarHeightPx: number;
  onClose: () => void;
}

/**
 * 絞り込み帯の実測高さ(filterBarHeightPx)をCSS変数として渡すための型(タスク8-2・P-032)。
 * 実際のmax-height計算はsrc/app/globals.cssの`.detail-sheet-panel`に委譲する
 * (このファイル冒頭のコメント参照)。
 */
type DetailSheetPanelStyle = CSSProperties & {
  "--detail-sheet-filter-bar-height": string;
};

/** performerIdを出演者名に解決する。見つからない場合(削除済み等)のフォールバック文言を返す */
function resolvePerformerName(performers: Performer[], performerId: string): string {
  return performers.find((performer) => performer.id === performerId)?.name ?? "(不明な出演者)";
}

export function DetailSheet({
  shop,
  visitDetails,
  performers,
  tags,
  filterBarHeightPx,
  onClose,
}: DetailSheetProps) {
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
        // md:left-72: オーバーレイと同じ理由(上のコメント参照)。
        // --detail-sheet-filter-bar-height: タスク6-3a(P-029)・タスク8-2(P-032)対応。
        // 絞り込み帯の実測高さ(filterBarHeightPx)をCSS変数で渡し、実際のmax-height計算は
        // globals.cssの`.detail-sheet-panel`(モバイル/PCでブレークポイントが異なる。
        // このファイル冒頭のコメント参照)に委譲する
        style={
          {
            "--detail-sheet-filter-bar-height": `${filterBarHeightPx}px`,
          } as DetailSheetPanelStyle
        }
        className={`detail-sheet-panel fixed inset-x-0 bottom-0 z-50 overflow-y-auto rounded-t-2xl bg-brand-paper text-brand-ink shadow-[0_-6px_0_var(--brand-yellow),0_-10px_30px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out md:left-72 ${
          isOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        {shop !== null && (
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 data-testid="detail-sheet-shop-name" className="font-brand-display text-2xl font-black text-brand-green">
                  {shop.name}
                </h2>

                {shopTags.length > 0 && (
                  <ul data-testid="detail-sheet-tags" className="mt-1.5 flex flex-wrap gap-1.5">
                    {shopTags.map((tag) => (
                      <li
                        key={tag.id}
                        data-testid="detail-sheet-tag"
                        className="rounded-md bg-brand-yellow px-2 py-0.5 text-xs font-bold text-brand-ink"
                      >
                        {tag.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                data-testid="detail-sheet-close"
                onClick={onClose}
                aria-label="閉じる"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand-green bg-white text-lg font-black leading-none text-brand-green transition-colors hover:bg-brand-paper-2"
              >
                ×
              </button>
            </div>

            <div data-testid="detail-sheet-visits" className="flex flex-col gap-3">
              {visitDetails.length === 0 ? (
                <p className="text-sm text-brand-ink-soft">公開済みの紹介動画情報がありません。</p>
              ) : (
                visitDetails.map(({ visit, video }) => (
                  <div
                    key={visit.id}
                    data-testid="detail-sheet-visit"
                    className="flex flex-col gap-2 rounded-2xl border border-brand-line bg-white p-2.5 sm:flex-row sm:gap-3"
                  >
                    <a
                      data-testid="detail-sheet-video-link"
                      href={buildYoutubeWatchUrl(video.id)}
                      target="_blank"
                      rel="noopener"
                      className="block w-full shrink-0 sm:w-40"
                    >
                      {/*
                        タスク8-2(P-032): サムネイルの表示枠を16:9(aspect-video)に固定し、
                        object-coverで表示する(ファイル冒頭コメント参照。hqdefault.jpgの
                        上下の黒帯だけが切り取られ、実際の映像フレームは欠けずに枠いっぱいに
                        表示される)。枠はdetail-sheet-thumbnail自体(imgのボックスはaspect-video
                        で16:9になる。object-coverは枠内の見た目の拡大縮小方法のみを変え、
                        ボックス自体のgetBoundingClientRectは16:9を保つ)
                      */}
                      <div className="aspect-video w-full overflow-hidden rounded-lg">
                        {/* i.ytimg.com はnext.config.tsの画像許可ドメイン未整備のためimgを使用(src/app/admin/videos/page.tsxと同方針) */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          data-testid="detail-sheet-thumbnail"
                          src={buildYoutubeThumbnailUrl(video.id)}
                          alt={video.title}
                          className="h-full w-full object-cover object-center"
                        />
                      </div>
                    </a>
                    <div className="flex flex-1 flex-col gap-1">
                      <a
                        data-testid="detail-sheet-video-title"
                        href={buildYoutubeWatchUrl(video.id)}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-bold text-brand-ink hover:underline"
                      >
                        {video.title}
                      </a>
                      <p data-testid="detail-sheet-published-at" className="text-xs text-brand-ink-soft tabular-nums">
                        動画公開日: {formatDateJa(video.publishedAt)}
                      </p>
                      <ul
                        data-testid="detail-sheet-consumptions"
                        className="flex flex-col gap-0.5 text-sm text-brand-ink"
                      >
                        {visit.consumptions.map((consumption, index) => (
                          <li
                            key={`${consumption.performerId}-${index}`}
                            data-testid="detail-sheet-consumption"
                          >
                            <span className="font-bold text-brand-blue">
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

            <div className="flex flex-col gap-1 border-t-2 border-dashed border-brand-line pt-3 text-sm text-brand-ink">
              <p data-testid="detail-sheet-address">住所: {shop.address}</p>
              <p data-testid="detail-sheet-business-hours">
                営業時間: {formatBusinessHours(shop.businessHours)}
              </p>
              <p data-testid="detail-sheet-info-as-of" className="text-xs text-brand-ink-soft">
                {formatInfoAsOf(shop.infoAsOf)}
              </p>

              <div
                data-testid="detail-sheet-shop-actions"
                className="flex flex-wrap items-center gap-2.5 pt-1.5"
              >
                {hasInstagram && (
                  <a
                    data-testid="detail-sheet-instagram-link"
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-blue text-brand-blue transition-colors hover:bg-white"
                  >
                    <CameraIcon className="h-5 w-5" />
                  </a>
                )}
                <a
                  data-testid="detail-sheet-google-maps-link"
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-brand-green px-4 text-sm font-bold text-white shadow-[0_3px_0_var(--brand-green-deep)] transition-colors hover:bg-brand-green-deep"
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
