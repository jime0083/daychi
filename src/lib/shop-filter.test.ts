/**
 * src/lib/shop-filter.ts のユニットテスト(タスク3-4: 出演者フィルタ)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { filterShopsByPerformers } from "@/lib/shop-filter";
import type { Shop } from "@/types/shop";
import type { Visit } from "@/types/visit";

const now = Timestamp.now();

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

function makeVisit(
  overrides: Partial<Visit> & { id: string; shopId: string; videoId: string },
): Visit {
  return {
    consumptions: [],
    status: "published",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("filterShopsByPerformers", () => {
  it("選択出演者が0件の場合は絞り込まず全店舗を返す", () => {
    const shops = [makeShop("shop-1"), makeShop("shop-2")];
    expect(filterShopsByPerformers(shops, [], [])).toEqual(shops);
  });

  it("選択出演者が参加したpublished visitを持つ店舗のみ返す", () => {
    const shops = [makeShop("shop-1"), makeShop("shop-2"), makeShop("shop-3")];
    const visits: Visit[] = [
      makeVisit({
        id: "visit-1",
        shopId: "shop-1",
        videoId: "video-a",
        consumptions: [{ performerId: "performer-a", items: ["コーヒー"] }],
      }),
      makeVisit({
        id: "visit-2",
        shopId: "shop-2",
        videoId: "video-b",
        consumptions: [{ performerId: "performer-b", items: ["紅茶"] }],
      }),
    ];

    expect(filterShopsByPerformers(shops, visits, ["performer-a"])).toEqual([shops[0]]);
  });

  it("複数選択時はOR絞り込み(いずれかが参加していれば表示)になる", () => {
    const shops = [makeShop("shop-1"), makeShop("shop-2"), makeShop("shop-3")];
    const visits: Visit[] = [
      makeVisit({
        id: "visit-1",
        shopId: "shop-1",
        videoId: "video-a",
        consumptions: [{ performerId: "performer-a", items: ["コーヒー"] }],
      }),
      makeVisit({
        id: "visit-2",
        shopId: "shop-2",
        videoId: "video-b",
        consumptions: [{ performerId: "performer-b", items: ["紅茶"] }],
      }),
    ];

    expect(filterShopsByPerformers(shops, visits, ["performer-a", "performer-b"])).toEqual([
      shops[0],
      shops[1],
    ]);
  });

  it("statusがdraftのvisitは除外する(呼び出し元がpublishedのみ渡さなかった場合の防御)", () => {
    const shops = [makeShop("shop-1")];
    const visits: Visit[] = [
      makeVisit({
        id: "visit-draft",
        shopId: "shop-1",
        videoId: "video-a",
        status: "draft",
        consumptions: [{ performerId: "performer-a", items: ["コーヒー"] }],
      }),
    ];

    expect(filterShopsByPerformers(shops, visits, ["performer-a"])).toEqual([]);
  });

  it("同一visitのconsumptionsに選択出演者が複数含まれても店舗は重複しない", () => {
    const shops = [makeShop("shop-1")];
    const visits: Visit[] = [
      makeVisit({
        id: "visit-1",
        shopId: "shop-1",
        videoId: "video-a",
        consumptions: [
          { performerId: "performer-a", items: ["コーヒー"] },
          { performerId: "performer-b", items: ["紅茶"] },
        ],
      }),
    ];

    expect(filterShopsByPerformers(shops, visits, ["performer-a", "performer-b"])).toEqual([
      shops[0],
    ]);
  });

  it("該当する訪問が無い場合は空配列を返す", () => {
    const shops = [makeShop("shop-1")];
    expect(filterShopsByPerformers(shops, [], ["performer-none"])).toEqual([]);
  });
});
