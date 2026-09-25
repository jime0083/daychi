/**
 * 公開ページの出演者フィルタ(タスク3-4)・タグフィルタ(タスク5-3)向けに、
 * 選択条件→絞り込み店舗を解決する純粋関数群。Firestoreへのアクセスは行わず、
 * 呼び出し側(src/app/page.tsx)がリポジトリ層(listPublishedShops/listPublishedVisits/
 * listTags)から取得済みの一覧を渡す。
 *
 * requirements.md「3.1 公開ページ」の
 * 「出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。
 *   選択した出演者が出演した訪問がある店舗のみ表示」
 * 「コーヒータイプタグフィルタ: 店舗に付与されたタグで絞り込み。複数のタグを選んだ場合は
 *   いずれかのタグが付いた店舗を表示する(OR)。出演者フィルタとタグフィルタを両方使う場合は
 *   両方の条件を満たす店舗だけを表示する」に対応する。
 *
 * 複数選択時の絞り込み方式(OR): 選択した出演者(またはタグ)のうち「いずれかに該当する」
 * 店舗を表示する。積集合(AND、全条件を同時に満たす店舗のみ表示)は
 * 「複数の推し/複数のタグをまとめて見たい」という利用シーンで0件になりやすく実用的でないため
 * 採用しない(詳細な設計判断は src/components/map/PerformerFilter.tsx のコメント参照)。
 * isMain=falseに限定する処理は選択肢UI側(PerformerFilter.tsx)の責務とし、この関数は
 * 渡されたselectedPerformerIdsをそのまま使う(isMainかどうかを判定しない)。
 *
 * 出演者フィルタとタグフィルタの併用(AND): filterShopsByPerformers()の結果に対して
 * filterShopsByTags()を適用する(呼び出し側 src/app/page.tsx)。両関数とも「元の配列の
 * 部分集合を返す(選択0件なら絞り込みなし)」という同じ形の純粋関数のため、単純に
 * 連続適用するだけで「両方の条件を満たす店舗のみ」というAND結合になる。
 */
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
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

/**
 * 選択中のタグID一覧に基づき、表示すべき店舗一覧を返す。
 * 選択が0件の場合は絞り込みを行わず、渡されたshopsをそのまま返す。
 * 選択したタグのいずれかがshop.tagIdsに含まれていれば表示する(OR)。
 *
 * @param shops 絞り込み対象の店舗一覧(published店舗を想定)
 * @param selectedTagIds 選択中のタグID一覧(0件の場合は絞り込みなし)
 */
export function filterShopsByTags(shops: Shop[], selectedTagIds: string[]): Shop[] {
  if (selectedTagIds.length === 0) {
    return shops;
  }

  const selectedIdSet = new Set(selectedTagIds);
  return shops.filter((shop) => shop.tagIds.some((tagId) => selectedIdSet.has(tagId)));
}

/**
 * 詳細シート(タスク5-3)向けに、店舗に付与されたタグを表示順(order昇順)で解決する。
 * shop.tagIdsにタグマスタに存在しないID(削除済みタグ等)が含まれていても無視する
 * (requirements.md「詳細シートの店名の近くに、その店舗のタグを表示する」)。
 *
 * @param shop タグを解決したい店舗
 * @param tags タグマスタの全件
 * @returns shopに付与されたタグ(order昇順)。1件も無い場合は空配列
 */
export function resolveShopTags(shop: Shop, tags: Tag[]): Tag[] {
  const tagIdSet = new Set(shop.tagIds);
  return tags.filter((tag) => tagIdSet.has(tag.id)).sort((a, b) => a.order - b.order);
}
