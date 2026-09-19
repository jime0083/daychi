/**
 * 公開ページの詳細シート(タスク3-2)向けに、店舗×動画×訪問の情報を組み立てる
 * 純粋関数群。Firestoreへのアクセスは行わず、呼び出し側(src/app/page.tsx)が
 * リポジトリ層(listPublishedVisits/listPublishedVideos)から取得済みの一覧を渡す。
 *
 * requirements.md「3.1 公開ページ」詳細シート仕様の
 * 「published のvisit/videoのみ表示すること」「1店舗が複数動画で紹介されている場合は
 * 訪問(visit)ごとにサムネ+飲食メニューを並べて表示」に対応する:
 * - visit.status/video.status のどちらも "published" であるものだけを対象にする
 *   (visits.ts の listPublishedVisits は既に status=="published" のみ返すが、
 *   video側は個別に取得していないため、突合時に改めてstatusを確認する必要がある)
 * - 対象の店舗(shopId一致)に絞り込み、動画公開日の昇順(紹介された順)で並べる
 */
import type { Video } from "@/types/video";
import type { Visit } from "@/types/visit";

/** 1件の訪問(visit)とその紹介動画(video)の組(表示単位) */
export interface ShopVisitDetail {
  visit: Visit;
  video: Video;
}

/**
 * 指定した店舗(shopId)の詳細シートに表示すべき訪問一覧を組み立てる。
 *
 * @param shopId 詳細シートを開いている店舗のID
 * @param visits published状態の訪問一覧(listPublishedVisits() の結果を想定。
 *               すでにstatus=="published"のみだが、念のためこの関数内でも確認する)
 * @param videos published状態の動画一覧(listPublishedVideos() の結果を想定)
 * @returns 動画公開日の昇順に並んだ {visit, video} の配列。
 *          紐づく動画がdraftまたは存在しない訪問は除外する。
 */
export function resolveShopVisitDetails(
  shopId: string,
  visits: Visit[],
  videos: Video[],
): ShopVisitDetail[] {
  const publishedVideoById = new Map(
    videos.filter((video) => video.status === "published").map((video) => [video.id, video]),
  );

  const details: ShopVisitDetail[] = [];
  for (const visit of visits) {
    if (visit.shopId !== shopId || visit.status !== "published") {
      continue;
    }
    const video = publishedVideoById.get(visit.videoId);
    if (video === undefined) {
      continue;
    }
    details.push({ visit, video });
  }

  return [...details].sort((a, b) => a.video.publishedAt.toMillis() - b.video.publishedAt.toMillis());
}
