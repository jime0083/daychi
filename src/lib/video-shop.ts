/**
 * 公開ページのサイドバー動画一覧(タスク3-3)向けに、動画→紹介店舗の解決を行う
 * 純粋関数群。Firestoreへのアクセスは行わず、呼び出し側(src/app/page.tsx)が
 * リポジトリ層(listPublishedVisits)から取得済みの一覧を渡す。
 *
 * requirements.md「3.1 公開ページ」の
 * 「動画をクリックすると、その動画で紹介された店舗を地図上でフォーカス・ハイライトする」
 * に対応する。「その動画で紹介された店舗」= その videoId を持つ published visit の
 * shopId 群と定義する(1動画で複数店舗が紹介されている場合は複数件になりうる)。
 *
 * タスク6-1(P-019)で追加した resolveVideoClickShopId は、requirements.md
 * 「動画をクリックすると、あわせてその店舗の詳細シートもスライドアップする…
 *   出演者/タグの絞り込みで地図に表示されていない店舗のシートは開かない。
 *   1動画で複数店舗を紹介する動画は現状ないため考慮しない(該当動画が出てきた時点で
 *   改めて仕様を決める。それまではシートを開かずフォーカス・ハイライトのみ)」
 * (2026-09-25決定)に対応する、動画クリック時に開くべき店舗IDを解決する純粋関数。
 */
import type { Shop } from "@/types/shop";
import type { Visit } from "@/types/visit";

/**
 * 指定した動画(videoId)で紹介された店舗のID一覧を返す(重複除去済み)。
 *
 * @param videoId 対象の動画ID
 * @param visits published状態の訪問一覧(listPublishedVisits() の結果を想定。
 *               すでにstatus=="published"のみだが、念のためこの関数内でも確認する)
 */
export function resolveVideoShopIds(videoId: string, visits: Visit[]): string[] {
  const shopIds = new Set<string>();
  for (const visit of visits) {
    if (visit.videoId === videoId && visit.status === "published") {
      shopIds.add(visit.shopId);
    }
  }
  return [...shopIds];
}

/**
 * 動画クリック時に詳細シートを開くべき店舗のIDを返す(タスク6-1・P-019)。
 * 以下のいずれかに該当する場合はシートを開かない(nullを返す):
 * - その動画で紹介されたpublished visitの店舗が0件、または2件以上
 *   (1動画で複数店舗を紹介するケースは現状考慮しない。requirements.md 2026-09-25決定)
 * - 該当店舗が出演者/タグの絞り込み後にも表示されている店舗(visibleShops)に
 *   含まれていない(絞り込みで地図に表示されていない店舗のシートは開かない)
 *
 * @param videoId クリックされた動画のID
 * @param visits published状態の訪問一覧(listPublishedVisits() の結果を想定)
 * @param visibleShops 出演者/タグの絞り込み後、現在地図に表示されている店舗一覧
 *                      (src/app/page.tsxのfilteredShops)
 * @returns 詳細シートを開くべき店舗ID。開かない場合はnull
 */
export function resolveVideoClickShopId(
  videoId: string,
  visits: Visit[],
  visibleShops: Shop[],
): string | null {
  const shopIds = resolveVideoShopIds(videoId, visits);
  if (shopIds.length !== 1) {
    return null;
  }

  const [shopId] = shopIds;
  const isVisible = visibleShops.some((shop) => shop.id === shopId);
  return isVisible ? shopId : null;
}
