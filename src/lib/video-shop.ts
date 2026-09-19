/**
 * 公開ページのサイドバー動画一覧(タスク3-3)向けに、動画→紹介店舗の解決を行う
 * 純粋関数群。Firestoreへのアクセスは行わず、呼び出し側(src/app/page.tsx)が
 * リポジトリ層(listPublishedVisits)から取得済みの一覧を渡す。
 *
 * requirements.md「3.1 公開ページ」の
 * 「動画をクリックすると、その動画で紹介された店舗を地図上でフォーカス・ハイライトする」
 * に対応する。「その動画で紹介された店舗」= その videoId を持つ published visit の
 * shopId 群と定義する(1動画で複数店舗が紹介されている場合は複数件になりうる)。
 */
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
