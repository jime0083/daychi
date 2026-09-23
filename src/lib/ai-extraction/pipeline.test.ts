/**
 * src/lib/ai-extraction/pipeline.ts のユニットテスト(タスク4-3)。
 * AI抽出プロバイダ・ジオコーディング(fetch)ともにモックし、実ネットワークには依存しない。
 */
import { describe, expect, it, vi } from "vitest";

import { buildDraftPlanFromVideo, geocodeExtractedShops } from "@/lib/ai-extraction/pipeline";
import type { ExtractedShop, ExtractionProvider } from "@/lib/ai-extraction/types";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("geocodeExtractedShops", () => {
  it("住所候補ごとにGSIジオコーディングを行い、shopsと同じ順序の結果を返す", async () => {
    const shops: ExtractedShop[] = [
      { name: "店A", addressCandidate: "東京都渋谷区1-1-1", consumptions: [] },
      { name: "店B", addressCandidate: null, consumptions: [] },
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ geometry: { coordinates: [139.7, 35.7] } }]));

    const results = await geocodeExtractedShops(shops, { fetchImpl });

    expect(results).toEqual([{ lat: 35.7, lng: 139.7 }, null]);
    // addressCandidateがnullの店舗ではfetchが呼ばれない
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ジオコーディングが失敗(通信エラー)した場合はnullとして続行する", async () => {
    const shops: ExtractedShop[] = [
      { name: "店A", addressCandidate: "解決できない住所", consumptions: [] },
    ];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));

    const results = await geocodeExtractedShops(shops, { fetchImpl });

    expect(results).toEqual([null]);
  });

  it("GSIが該当なし(空配列)を返した場合はnullとして続行する", async () => {
    const shops: ExtractedShop[] = [{ name: "店A", addressCandidate: "住所", consumptions: [] }];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse([]));

    const results = await geocodeExtractedShops(shops, { fetchImpl });

    expect(results).toEqual([null]);
  });
});

describe("buildDraftPlanFromVideo", () => {
  const knownPerformers: Performer[] = [{ id: "performer-1", name: "だいち", isMain: false, order: 0 }];
  const existingPublishedShops: Shop[] = [];

  it("プロバイダの抽出結果とジオコード結果からdraft保存計画を組み立てる", async () => {
    const extractMock = vi.fn().mockResolvedValue({
      shops: [
        {
          name: "新規の喫茶店",
          addressCandidate: "東京都渋谷区1-1-1",
          consumptions: [{ performerName: "だいち", items: ["ブレンドコーヒー"] }],
        },
      ],
    });
    const provider: ExtractionProvider = { name: "gemini", extract: extractMock };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ geometry: { coordinates: [139.7, 35.7] } }]));

    const plan = await buildDraftPlanFromVideo({
      provider,
      video: { videoId: "video-1", title: "新しい動画", publishedAt: "2026-01-01T00:00:00Z" },
      textContent: { description: "概要欄です", transcript: "字幕です" },
      knownPerformers,
      existingPublishedShops,
      geocodeFetchImpl: fetchImpl,
    });

    expect(extractMock).toHaveBeenCalledWith({
      videoTitle: "新しい動画",
      description: "概要欄です",
      transcript: "字幕です",
      knownPerformerNames: ["だいち"],
    });
    expect(plan.status).toBe("draft");
    expect(plan.shops[0].location).toEqual({ lat: 35.7, lng: 139.7 });
    expect(plan.visits[0].consumptions[0].performerId).toBe("performer-1");
  });
});
