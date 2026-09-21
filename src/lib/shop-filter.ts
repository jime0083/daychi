/**
 * 公開ページの出演者フィルタ(タスク3-4)向けに、選択出演者→絞り込み店舗を解決する
 * 純粋関数群。Firestoreへのアクセスは行わず、呼び出し側(src/app/page.tsx)が
 * リポジトリ層(listPublishedShops/listPublishedVisits)から取得済みの一覧を渡す。
 *
 * requirements.md「3.1 公開ページ」の
 * 「出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。
 *   選択した出演者が出演した訪問がある店舗のみ表示」に対応する。
 *
 * 複数選択時の絞り込み方式(OR): 選択した出演者のうち「いずれかが参加した訪問」を
 * 持つ店舗を表示する。積集合(AND、全員が同じ訪問に参加している店舗のみ表示)は
 * 「複数の推しをまとめて見たい」という利用シーンで0件になりやすく実用的でないため
 * 採用しない(詳細な設計判断は src/components/map/PerformerFilter.tsx のコメント参照)。
 * isMain=falseに限定する処理は選択肢UI側(PerformerFilter.tsx)の責務とし、この関数は
 * 渡されたselectedPerformerIdsをそのまま使う(isMainかどうかを判定しない)。
 */
import type { Shop } from "@/types/shop";
import type { Visit } from "@/types/visit";

/**
 * 選択中の出演者ID一覧に基づき、表示すべき店舗一覧を返す。
 * 選択が0件の場合は絞り込みを行わず、渡されたshopsをそのまま返す。
 *
 * @param shops 絞り込み対象の店舗一覧(published店舗を想定)
 * @param visits published状態の訪問一覧(listPublishedVisits() の結果を想定。
 *               すでにstatus=="published"のみだが、念のためこの関数内でも確認する)
 * @param selectedPerformerIds 選択中の出演者ID一覧(0件の場合は絞り込みなし)
 */
export function filterShopsByPerformers(
  shops: Shop[],
  visits: Visit[],
  selectedPerformerIds: string[],
): Shop[] {
  if (selectedPerformerIds.length === 0) {
    return shops;
  }

  const selectedIdSet = new Set(selectedPerformerIds);
  const matchingShopIds = new Set<string>();
  for (const visit of visits) {
    if (visit.status !== "published") {
      continue;
    }
    const hasSelectedPerformer = visit.consumptions.some((consumption) =>
      selectedIdSet.has(consumption.performerId),
    );
    if (hasSelectedPerformer) {
      matchingShopIds.add(visit.shopId);
    }
  }

  return shops.filter((shop) => matchingShopIds.has(shop.id));
}
