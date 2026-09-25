/**
 * src/lib/shop-filter.ts のユニットテスト(タスク3-4: 出演者フィルタ)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { filterShopsByPerformers, filterShopsByTags, resolveShopTags } from "@/lib/shop-filter";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
import type { Visit } from "@/types/visit";

const now = Timestamp.now();

function makeShop(id: string, tagIds: string[] = []): Shop {
  return {
    id,
    name: `店舗${id}`,
    address: "テスト住所",
    businessHours: "9:00-18:00",
    infoAsOf: now,
    location: { lat: 35, lng: 139 },
    closed: false,
    tagIds,
    status: "published",
    createdAt: now,
    updatedAt: now,
  };
}

function makeTag(id: string, order: number): Tag {
  return { id, name: `タグ${id}`, order };
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

describe("filterShopsByTags", () => {
  it("選択タグが0件の場合は絞り込まず全店舗を返す", () => {
    const shops = [makeShop("shop-1", ["tag-a"]), makeShop("shop-2")];
    expect(filterShopsByTags(shops, [])).toEqual(shops);
  });

  it("選択タグが付いた店舗のみ返す", () => {
    const shops = [makeShop("shop-1", ["tag-a"]), makeShop("shop-2", ["tag-b"]), makeShop("shop-3")];
    expect(filterShopsByTags(shops, ["tag-a"])).toEqual([shops[0]]);
  });

  it("複数選択時はOR絞り込み(いずれかのタグが付いていれば表示)になる", () => {
    const shops = [makeShop("shop-1", ["tag-a"]), makeShop("shop-2", ["tag-b"]), makeShop("shop-3")];
    expect(filterShopsByTags(shops, ["tag-a", "tag-b"])).toEqual([shops[0], shops[1]]);
  });

  it("該当するタグが付いた店舗が無い場合は空配列を返す", () => {
    const shops = [makeShop("shop-1", ["tag-a"])];
    expect(filterShopsByTags(shops, ["tag-none"])).toEqual([]);
  });
});

describe("resolveShopTags", () => {
  it("shopに付与されたタグをorder昇順で返す", () => {
    const tags = [makeTag("tag-b", 2), makeTag("tag-a", 1), makeTag("tag-c", 3)];
    const shop = makeShop("shop-1", ["tag-c", "tag-a"]);
    expect(resolveShopTags(shop, tags)).toEqual([tags[1], tags[2]]);
  });

  it("タグが無い店舗は空配列を返す", () => {
    const tags = [makeTag("tag-a", 1)];
    const shop = makeShop("shop-1", []);
    expect(resolveShopTags(shop, tags)).toEqual([]);
  });

  it("tagIdsにタグマスタへ存在しないIDが含まれていても無視する", () => {
    const tags = [makeTag("tag-a", 1)];
    const shop = makeShop("shop-1", ["tag-deleted", "tag-a"]);
    expect(resolveShopTags(shop, tags)).toEqual([tags[0]]);
  });
});
