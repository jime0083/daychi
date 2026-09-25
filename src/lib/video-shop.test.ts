/**
 * src/lib/video-shop.ts のユニットテスト(タスク3-3: サイドバー動画一覧、
 * タスク6-1: 動画クリックで詳細シートを開く判定。P-019)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { resolveVideoClickShopId, resolveVideoShopIds } from "@/lib/video-shop";
import type { Shop } from "@/types/shop";
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

function makeShop(id: string): Shop {
  return {
    id,
    name: `店舗${id}`,
    address: "テスト住所",
    businessHours: "9:00-18:00",
    infoAsOf: now,
    location: { lat: 35, lng: 139 },
    closed: false,
    tagIds: [],
    status: "published",
    createdAt: now,
    updatedAt: now,
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

describe("resolveVideoClickShopId", () => {
  it("紹介店舗が1件かつ絞り込み後の表示対象に含まれる場合、その店舗IDを返す", () => {
    const visits: Visit[] = [makeVisit({ id: "visit-1", shopId: "shop-1", videoId: "video-a" })];
    const shops: Shop[] = [makeShop("shop-1"), makeShop("shop-2")];

    expect(resolveVideoClickShopId("video-a", visits, shops)).toBe("shop-1");
  });

  it("紹介店舗が0件の場合はnullを返す(シートを開かない)", () => {
    expect(resolveVideoClickShopId("video-none", [], [makeShop("shop-1")])).toBeNull();
  });

  it("紹介店舗が2件以上の場合はnullを返す(1動画複数店舗は現状シートを開かない、requirements.md 2026-09-25決定)", () => {
    const visits: Visit[] = [
      makeVisit({ id: "visit-1", shopId: "shop-1", videoId: "video-a" }),
      makeVisit({ id: "visit-2", shopId: "shop-2", videoId: "video-a" }),
    ];
    const shops: Shop[] = [makeShop("shop-1"), makeShop("shop-2")];

    expect(resolveVideoClickShopId("video-a", visits, shops)).toBeNull();
  });

  it("紹介店舗が1件でも、出演者/タグ絞り込み後の表示対象(visibleShops)に含まれていなければnullを返す", () => {
    const visits: Visit[] = [makeVisit({ id: "visit-1", shopId: "shop-1", videoId: "video-a" })];
    // shop-1は絞り込みで非表示になっているケースを想定し、visibleShopsに含めない
    const visibleShops: Shop[] = [makeShop("shop-2")];

    expect(resolveVideoClickShopId("video-a", visits, visibleShops)).toBeNull();
  });

  it("statusがdraftのvisitは除外する(呼び出し元がpublishedのみ渡さなかった場合の防御。resolveVideoShopIdsの挙動を継承)", () => {
    const visits: Visit[] = [
      makeVisit({ id: "visit-draft", shopId: "shop-1", videoId: "video-a", status: "draft" }),
    ];
    const shops: Shop[] = [makeShop("shop-1")];

    expect(resolveVideoClickShopId("video-a", visits, shops)).toBeNull();
  });
});
