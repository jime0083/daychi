/**
 * src/lib/ai-extraction/save-draft.ts のユニットテスト(タスク4-3)。
 *
 * 実際のFirestoreには接続せず、src/repositories/* をモックして呼び出しの組み立てのみを
 * 検証する(実I/Oを伴うため、繰り返しになるがdraft-plan.tsのような純粋関数テストとは別枠)。
 */
import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftSavePlan } from "@/lib/ai-extraction/draft-plan";

const createShopMock = vi.fn();
const updateShopMock = vi.fn();
const createVideoMock = vi.fn();
const createVisitMock = vi.fn();

vi.mock("@/repositories/shops", () => ({
  createShop: (...args: unknown[]) => createShopMock(...args),
  updateShop: (...args: unknown[]) => updateShopMock(...args),
}));
vi.mock("@/repositories/videos", () => ({
  createVideo: (...args: unknown[]) => createVideoMock(...args),
}));
vi.mock("@/repositories/visits", () => ({
  createVisit: (...args: unknown[]) => createVisitMock(...args),
}));

async function importSaveDraftExtraction() {
  const saveDraftModule = await import("@/lib/ai-extraction/save-draft");
  return saveDraftModule.saveDraftExtraction;
}

const now = Timestamp.now();

describe("saveDraftExtraction", () => {
  beforeEach(() => {
    createShopMock.mockReset();
    updateShopMock.mockReset();
    createVideoMock.mockReset();
    createVisitMock.mockReset();
    createVideoMock.mockImplementation(async (videoId: string, data: unknown) => ({
      id: videoId,
      ...(data as object),
    }));
    createShopMock.mockImplementation(async (data: unknown) => ({
      id: "new-shop-id",
      ...(data as object),
    }));
    createVisitMock.mockImplementation(async (data: unknown) => ({
      id: "new-visit-id",
      ...(data as object),
      createdAt: now,
      updatedAt: now,
    }));
  });

  it("videos/shops/visitsをすべてstatus:draftで作成する(新規店舗の場合)", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-1", title: "新しい動画", publishedAt: "2026-01-01T00:00:00Z" },
      shops: [
        {
          name: "新規の喫茶店",
          addressCandidate: "東京都渋谷区1-1-1",
          location: { lat: 35.0, lng: 139.0 },
          isDuplicate: false,
          existingShopId: null,
        },
      ],
      visits: [
        {
          shopIndex: 0,
          consumptions: [{ performerId: "performer-1", performerName: "だいち", items: ["コーヒー"] }],
        },
      ],
    };

    const result = await saveDraftExtraction(plan);

    expect(createVideoMock).toHaveBeenCalledWith(
      "video-1",
      expect.objectContaining({ title: "新しい動画", status: "draft" }),
    );
    expect(createShopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "新規の喫茶店",
        location: { lat: 35.0, lng: 139.0 },
        status: "draft",
      }),
    );
    // ジオコード成功時はlocationConfirmedを付けない(未設定=確定済み扱い)
    expect(createShopMock.mock.calls[0][0]).not.toHaveProperty("locationConfirmed");
    expect(createVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "new-shop-id",
        videoId: "video-1",
        status: "draft",
        consumptions: [{ performerId: "performer-1", items: ["コーヒー"] }],
      }),
    );
    expect(result).toEqual({
      videoId: "video-1",
      shopIds: ["new-shop-id"],
      visitIds: ["new-visit-id"],
      unresolvedPerformerNames: [],
    });
  });

  it("重複店舗の場合は新規作成せず既存shopIdを使い回し、既存店舗のlocationConfirmedを変更しない", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-2", title: "既出店の動画", publishedAt: "2026-01-02T00:00:00Z" },
      shops: [
        {
          name: "喫茶ダイチ",
          addressCandidate: null,
          location: null,
          isDuplicate: true,
          existingShopId: "existing-shop-id",
        },
      ],
      visits: [{ shopIndex: 0, consumptions: [] }],
    };

    const result = await saveDraftExtraction(plan);

    expect(createShopMock).not.toHaveBeenCalled();
    // 重複店舗は既存shopIdを使い回すのみで、既存店舗への書き込み(updateShop)は一切行わない
    // (locationConfirmedを含め既存店舗のフィールドを上書きしないことの担保)
    expect(updateShopMock).not.toHaveBeenCalled();
    expect(createVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "existing-shop-id" }),
    );
    expect(result.shopIds).toEqual(["existing-shop-id"]);
  });

  it("出演者マスタに解決できないconsumptionはunresolvedConsumptionsに保存し、解決できた分はconsumptionsに入れる(混在ケース)", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-3", title: "動画", publishedAt: "2026-01-03T00:00:00Z" },
      shops: [
        {
          name: "新規の喫茶店",
          addressCandidate: null,
          location: null,
          isDuplicate: false,
          existingShopId: null,
        },
      ],
      visits: [
        {
          shopIndex: 0,
          consumptions: [
            { performerId: "performer-1", performerName: "だいち", items: ["コーヒー"] },
            { performerId: null, performerName: "未登録ゲスト", items: ["紅茶"] },
          ],
        },
      ],
    };

    const result = await saveDraftExtraction(plan);

    expect(createVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        consumptions: [{ performerId: "performer-1", items: ["コーヒー"] }],
        unresolvedConsumptions: [{ performerName: "未登録ゲスト", items: ["紅茶"] }],
      }),
    );
    expect(result.unresolvedPerformerNames).toEqual(["未登録ゲスト"]);
  });

  it("未登録出演者が1人もいない訪問ではunresolvedConsumptionsキー自体を付けない", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-3b", title: "動画", publishedAt: "2026-01-03T00:00:00Z" },
      shops: [
        {
          name: "新規の喫茶店2",
          addressCandidate: null,
          location: null,
          isDuplicate: false,
          existingShopId: null,
        },
      ],
      visits: [
        {
          shopIndex: 0,
          consumptions: [{ performerId: "performer-1", performerName: "だいち", items: ["コーヒー"] }],
        },
      ],
    };

    await saveDraftExtraction(plan);

    expect(createVisitMock.mock.calls[0][0]).not.toHaveProperty("unresolvedConsumptions");
  });

  it("住所候補・ジオコードが無い店舗にはプレースホルダ座標(0,0)とlocationConfirmed=falseを設定する", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-4", title: "動画", publishedAt: "2026-01-04T00:00:00Z" },
      shops: [
        { name: "住所不明の店", addressCandidate: null, location: null, isDuplicate: false, existingShopId: null },
      ],
      visits: [{ shopIndex: 0, consumptions: [] }],
    };

    await saveDraftExtraction(plan);

    expect(createShopMock).toHaveBeenCalledWith(
      expect.objectContaining({ location: { lat: 0, lng: 0 }, address: "", locationConfirmed: false }),
    );
  });

  it("ジオコーディングに失敗した店舗(住所候補はあるがlocationがnull)もlocationConfirmed=falseにする", async () => {
    const saveDraftExtraction = await importSaveDraftExtraction();
    const plan: DraftSavePlan = {
      status: "draft",
      video: { videoId: "video-5", title: "動画", publishedAt: "2026-01-05T00:00:00Z" },
      shops: [
        {
          name: "ジオコード失敗の店",
          addressCandidate: "存在しない住所999-999",
          location: null,
          isDuplicate: false,
          existingShopId: null,
        },
      ],
      visits: [{ shopIndex: 0, consumptions: [] }],
    };

    await saveDraftExtraction(plan);

    expect(createShopMock).toHaveBeenCalledWith(
      expect.objectContaining({ location: { lat: 0, lng: 0 }, locationConfirmed: false }),
    );
  });
});
