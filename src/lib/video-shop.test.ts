/**
 * src/lib/video-shop.ts のユニットテスト(タスク3-3: サイドバー動画一覧)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { resolveVideoShopIds } from "@/lib/video-shop";
import type { Visit } from "@/types/visit";

const now = Timestamp.now();

function makeVisit(overrides: Partial<Visit> & { id: string; shopId: string; videoId: string }): Visit {
  return {
    consumptions: [],
    status: "published",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("resolveVideoShopIds", () => {
  it("対象動画のpublished visitのshopIdを重複除去して返す", () => {
    const visits: Visit[] = [
      makeVisit({ id: "visit-1", shopId: "shop-1", videoId: "video-a" }),
      makeVisit({ id: "visit-2", shopId: "shop-2", videoId: "video-a" }),
      // 同一店舗が同じ動画で複数visitを持つケース(重複除去されること)
      makeVisit({ id: "visit-3", shopId: "shop-1", videoId: "video-a" }),
      makeVisit({ id: "visit-other", shopId: "shop-3", videoId: "video-b" }),
    ];

    expect(resolveVideoShopIds("video-a", visits)).toEqual(["shop-1", "shop-2"]);
  });

  it("statusがdraftのvisitは除外する(呼び出し元がpublishedのみ渡さなかった場合の防御)", () => {
    const visits: Visit[] = [
      makeVisit({ id: "visit-draft", shopId: "shop-1", videoId: "video-a", status: "draft" }),
    ];

    expect(resolveVideoShopIds("video-a", visits)).toEqual([]);
  });

  it("該当するvisitが無い場合は空配列を返す", () => {
    expect(resolveVideoShopIds("video-none", [])).toEqual([]);
  });
});
