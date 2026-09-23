/**
 * src/lib/ai-extraction/draft-plan.ts のユニットテスト(タスク4-3)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  buildDraftSavePlan,
  findDuplicateShop,
  normalizeShopName,
  resolvePerformerId,
} from "@/lib/ai-extraction/draft-plan";
import type { ExtractionResult } from "@/lib/ai-extraction/types";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";

const now = Timestamp.now();

function makeShop(id: string, name: string): Shop {
  return {
    id,
    name,
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

function makePerformer(id: string, name: string): Performer {
  return { id, name, isMain: false, order: 0 };
}

describe("normalizeShopName", () => {
  it("全角/半角・大文字小文字・空白の違いを無視して比較できる正規化を行う", () => {
    expect(normalizeShopName("喫茶 ダイチ")).toBe(normalizeShopName("喫茶ダイチ"));
    expect(normalizeShopName("Cafe ABC")).toBe(normalizeShopName("cafe abc"));
    expect(normalizeShopName("Ａｂｃ")).toBe(normalizeShopName("Abc"));
  });
});

describe("resolvePerformerId", () => {
  const performers = [makePerformer("performer-1", "だいち"), makePerformer("performer-2", "ゲストA")];

  it("正規化して一致する出演者のIDを返す", () => {
    expect(resolvePerformerId("だいち", performers)).toBe("performer-1");
    expect(resolvePerformerId(" だいち ", performers)).toBe("performer-1");
  });

  it("一致する出演者が見つからない場合はnullを返す", () => {
    expect(resolvePerformerId("未登録の出演者", performers)).toBeNull();
  });
});

describe("findDuplicateShop", () => {
  const existingShops = [makeShop("shop-1", "喫茶ダイチ")];

  it("店名が正規化して一致する場合は既存shopIdを伴う重複と判定する", () => {
    expect(findDuplicateShop("喫茶 ダイチ", existingShops)).toEqual({
      isDuplicate: true,
      existingShopId: "shop-1",
    });
  });

  it("一致する店舗が無い場合は重複なしと判定する", () => {
    expect(findDuplicateShop("新規の店", existingShops)).toEqual({
      isDuplicate: false,
      existingShopId: null,
    });
  });
});

describe("buildDraftSavePlan", () => {
  const knownPerformers = [makePerformer("performer-1", "だいち"), makePerformer("performer-2", "ゲストA")];
  const existingPublishedShops = [makeShop("shop-existing", "喫茶ダイチ")];

  it("videos/shops/visitsの計画をすべてstatus:draftとして組み立てる", () => {
    const extraction: ExtractionResult = {
      shops: [
        {
          name: "新規の喫茶店",
          addressCandidate: "東京都渋谷区1-1-1",
          consumptions: [{ performerName: "だいち", items: ["ブレンドコーヒー"] }],
        },
      ],
    };

    const plan = buildDraftSavePlan({
      video: { videoId: "video-1", title: "新しい動画", publishedAt: "2026-01-01T00:00:00Z" },
      extraction,
      knownPerformers,
      existingPublishedShops,
      geocodeResults: [{ lat: 35.0, lng: 139.0 }],
    });

    expect(plan.status).toBe("draft");
    expect(plan.video).toEqual({
      videoId: "video-1",
      title: "新しい動画",
      publishedAt: "2026-01-01T00:00:00Z",
    });
    expect(plan.shops).toEqual([
      {
        name: "新規の喫茶店",
        addressCandidate: "東京都渋谷区1-1-1",
        location: { lat: 35.0, lng: 139.0 },
        isDuplicate: false,
        existingShopId: null,
      },
    ]);
    expect(plan.visits).toEqual([
      {
        shopIndex: 0,
        consumptions: [{ performerId: "performer-1", performerName: "だいち", items: ["ブレンドコーヒー"] }],
      },
    ]);
  });

  it("既存published店舗と店名(正規化)が一致する場合は重複としてexistingShopIdを持つ", () => {
    const extraction: ExtractionResult = {
      shops: [{ name: "喫茶 ダイチ", addressCandidate: null, consumptions: [] }],
    };

    const plan = buildDraftSavePlan({
      video: { videoId: "video-2", title: "既出店の動画", publishedAt: "2026-01-02T00:00:00Z" },
      extraction,
      knownPerformers,
      existingPublishedShops,
      geocodeResults: [null],
    });

    expect(plan.shops[0]).toEqual({
      name: "喫茶 ダイチ",
      addressCandidate: null,
      location: null,
      isDuplicate: true,
      existingShopId: "shop-existing",
    });
  });

  it("出演者マスタに無い名前はperformerId: nullとして計画に残す(実保存側の責務に委ねる)", () => {
    const extraction: ExtractionResult = {
      shops: [
        {
          name: "新規の喫茶店",
          addressCandidate: null,
          consumptions: [{ performerName: "未登録ゲスト", items: ["カフェラテ"] }],
        },
      ],
    };

    const plan = buildDraftSavePlan({
      video: { videoId: "video-3", title: "動画", publishedAt: "2026-01-03T00:00:00Z" },
      extraction,
      knownPerformers,
      existingPublishedShops,
      geocodeResults: [null],
    });

    expect(plan.visits[0].consumptions).toEqual([
      { performerId: null, performerName: "未登録ゲスト", items: ["カフェラテ"] },
    ]);
  });

  it("店舗が複数抽出された場合、shopsとvisitsの対応(shopIndex)が正しく組み立てられる", () => {
    const extraction: ExtractionResult = {
      shops: [
        { name: "店A", addressCandidate: null, consumptions: [] },
        { name: "店B", addressCandidate: null, consumptions: [] },
      ],
    };

    const plan = buildDraftSavePlan({
      video: { videoId: "video-4", title: "はしご動画", publishedAt: "2026-01-04T00:00:00Z" },
      extraction,
      knownPerformers,
      existingPublishedShops: [],
      geocodeResults: [null, null],
    });

    expect(plan.shops.map((shop) => shop.name)).toEqual(["店A", "店B"]);
    expect(plan.visits.map((visit) => visit.shopIndex)).toEqual([0, 1]);
  });
});
