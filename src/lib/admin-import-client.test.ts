import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchExtractionPlan, fetchUnregisteredVideos } from "./admin-import-client";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("fetchUnregisteredVideos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時はvideosをそのまま返す", async () => {
    const videos = [{ videoId: "abc12345678", title: "テスト動画", publishedAt: "2026-01-01T00:00:00Z" }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { videos }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUnregisteredVideos("id-token", ["existing-1"]);

    expect(result).toEqual(videos);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/import/unregistered-videos");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(JSON.parse(init.body as string)).toEqual({ existingVideoIds: ["existing-1"] });
  });

  it("エラー応答時はerrorメッセージでthrowする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { error: "管理者権限が必要です" })),
    );

    await expect(fetchUnregisteredVideos("id-token", [])).rejects.toThrow("管理者権限が必要です");
  });

  it("errorフィールドが無い異常応答時はstatusを含むデフォルトメッセージでthrowする", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));

    await expect(fetchUnregisteredVideos("id-token", [])).rejects.toThrow("status: 500");
  });
});

describe("fetchExtractionPlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時はDraftSavePlanを返す", async () => {
    const plan = {
      status: "draft" as const,
      video: { videoId: "abc12345678", title: "テスト動画", publishedAt: "2026-01-01T00:00:00Z" },
      shops: [],
      visits: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, plan)));

    const result = await fetchExtractionPlan("id-token", {
      videoId: "abc12345678",
      title: "テスト動画",
      publishedAt: "2026-01-01T00:00:00Z",
    });

    expect(result).toEqual(plan);
  });

  it("エラー応答時はerrorメッセージでthrowする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(502, { error: "AI抽出処理に失敗しました" })),
    );

    await expect(
      fetchExtractionPlan("id-token", {
        videoId: "abc12345678",
        title: "テスト動画",
        publishedAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toThrow("AI抽出処理に失敗しました");
  });
});
