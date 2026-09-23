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

  describe("敬称・括弧書きの表記ゆれ吸収(タスク4-3d, P-016対応)", () => {
    const performersWithRole = [
      makePerformer("performer-1", "高橋さん(カメラマン)"),
      makePerformer("performer-2", "出井さん"),
      makePerformer("performer-3", "かみちぃさん"),
    ];

    it("敬称を省略した表記(「高橋さん」)でもあいまい一致で解決できる", () => {
      expect(resolvePerformerId("高橋さん", performersWithRole)).toBe("performer-1");
    });

    it("敬称も括弧書きも省略した表記(「高橋」)でもあいまい一致で解決できる", () => {
      expect(resolvePerformerId("高橋", performersWithRole)).toBe("performer-1");
    });

    it("全角括弧の表記(「高橋さん（カメラマン）」)でもあいまい一致で解決できる", () => {
      expect(resolvePerformerId("高橋さん（カメラマン）", performersWithRole)).toBe("performer-1");
    });

    it("一覧どおりの完全一致がある場合はあいまい一致より優先される", () => {
      expect(resolvePerformerId("高橋さん(カメラマン)", performersWithRole)).toBe("performer-1");
      expect(resolvePerformerId("出井さん", performersWithRole)).toBe("performer-2");
    });

    it("あいまい一致で複数候補になる場合は未一致(null)にする", () => {
      const ambiguousPerformers = [
        makePerformer("performer-a", "田中さん"),
        makePerformer("performer-b", "田中くん"),
      ];

      expect(resolvePerformerId("田中", ambiguousPerformers)).toBeNull();
    });
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
      geocodeResults: [
        { location: { lat: 35.0, lng: 139.0 }, normalizedAddress: "東京都渋谷区道玄坂一丁目１番地" },
      ],
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
        locationConfirmed: true,
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
      locationConfirmed: false,
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

  describe("locationConfirmedの番地粒度判定(タスク4-3d, P-016対応)", () => {
    const extraction: ExtractionResult = {
      shops: [{ name: "店A", addressCandidate: "東京都世田谷区北沢3-31-3", consumptions: [] }],
    };

    it("正規化住所に「番」を含む(番地まで特定できた)場合はlocationConfirmed:trueにする", () => {
      const plan = buildDraftSavePlan({
        video: { videoId: "video-banchi", title: "動画", publishedAt: "2026-01-06T00:00:00Z" },
        extraction,
        knownPerformers,
        existingPublishedShops: [],
        geocodeResults: [
          { location: { lat: 35.66, lng: 139.66 }, normalizedAddress: "東京都世田谷区北沢三丁目３１番３号" },
        ],
      });

      expect(plan.shops[0].locationConfirmed).toBe(true);
    });

    it("正規化住所が丁目止まり(「番」を含まない)の場合はlocationConfirmed:falseにする", () => {
      const plan = buildDraftSavePlan({
        video: { videoId: "video-chome", title: "動画", publishedAt: "2026-01-06T00:00:00Z" },
        extraction,
        knownPerformers,
        existingPublishedShops: [],
        geocodeResults: [{ location: { lat: 35.66, lng: 139.66 }, normalizedAddress: "東京都世田谷区北沢三丁目" }],
      });

      expect(plan.shops[0].locationConfirmed).toBe(false);
    });

    it("正規化住所が町名止まり(「番」を含まない)の場合はlocationConfirmed:falseにする", () => {
      const plan = buildDraftSavePlan({
        video: { videoId: "video-town", title: "動画", publishedAt: "2026-01-06T00:00:00Z" },
        extraction,
        knownPerformers,
        existingPublishedShops: [],
        geocodeResults: [{ location: { lat: 35.66, lng: 139.66 }, normalizedAddress: "東京都世田谷区北沢" }],
      });

      expect(plan.shops[0].locationConfirmed).toBe(false);
    });

    it("ジオコーディングに失敗した(結果がnull)場合はlocationConfirmed:falseにする", () => {
      const plan = buildDraftSavePlan({
        video: { videoId: "video-fail", title: "動画", publishedAt: "2026-01-06T00:00:00Z" },
        extraction,
        knownPerformers,
        existingPublishedShops: [],
        geocodeResults: [null],
      });

      expect(plan.shops[0].locationConfirmed).toBe(false);
    });
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
