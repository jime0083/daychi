/**
 * src/lib/shop-detail.ts のユニットテスト(タスク3-2: スライドアップ詳細シート)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { resolveShopVisitDetails } from "@/lib/shop-detail";
import type { Video } from "@/types/video";
import type { Visit } from "@/types/visit";

const now = Timestamp.now();

function makeVideo(overrides: Partial<Video> & { id: string; publishedAt: Timestamp }): Video {
  return {
    title: `動画 ${overrides.id}`,
    status: "published",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeVisit(overrides: Partial<Visit> & { id: string; shopId: string; videoId: string }): Visit {
  return {
    consumptions: [],
    status: "published",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("resolveShopVisitDetails", () => {
  it("対象店舗のpublished visit×published videoのみを動画公開日の昇順で返す", () => {
    const videos: Video[] = [
      makeVideo({
        id: "video-late",
        publishedAt: Timestamp.fromDate(new Date("2026-03-01T00:00:00+09:00")),
      }),
      makeVideo({
        id: "video-early",
        publishedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00+09:00")),
      }),
    ];
    const visits: Visit[] = [
      makeVisit({ id: "visit-late", shopId: "shop-1", videoId: "video-late" }),
      makeVisit({ id: "visit-early", shopId: "shop-1", videoId: "video-early" }),
      makeVisit({ id: "visit-other-shop", shopId: "shop-2", videoId: "video-early" }),
    ];

    const result = resolveShopVisitDetails("shop-1", visits, videos);

    expect(result.map((entry) => entry.visit.id)).toEqual(["visit-early", "visit-late"]);
  });

  it("紐づく動画がpublished一覧に存在しない(draft/削除済み)訪問は除外する", () => {
    const videos: Video[] = [
      makeVideo({
        id: "video-published",
        publishedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00+09:00")),
      }),
    ];
    const visits: Visit[] = [
      makeVisit({ id: "visit-ok", shopId: "shop-1", videoId: "video-published" }),
      makeVisit({ id: "visit-missing-video", shopId: "shop-1", videoId: "video-draft-not-in-list" }),
    ];

    const result = resolveShopVisitDetails("shop-1", visits, videos);

    expect(result.map((entry) => entry.visit.id)).toEqual(["visit-ok"]);
  });

  it("statusがdraftの訪問は除外する(呼び出し元がpublishedのみ渡さなかった場合の防御)", () => {
    const videos: Video[] = [
      makeVideo({
        id: "video-published",
        publishedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00+09:00")),
      }),
    ];
    const visits: Visit[] = [
      makeVisit({
        id: "visit-draft",
        shopId: "shop-1",
        videoId: "video-published",
        status: "draft",
      }),
    ];

    const result = resolveShopVisitDetails("shop-1", visits, videos);

    expect(result).toEqual([]);
  });

  it("該当する訪問が無い場合は空配列を返す", () => {
    expect(resolveShopVisitDetails("shop-none", [], [])).toEqual([]);
  });
});
