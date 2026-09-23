/**
 * src/lib/ai-extraction/gemini-adapter.ts のユニットテスト(タスク4-3)。
 * 実際のGemini APIは呼び出さず、fetchをモックして検証する(実API疎通確認はタスク4-5)。
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GEMINI_MODEL,
  createGeminiExtractionProvider,
} from "@/lib/ai-extraction/gemini-adapter";
import { GeminiDailyQuotaExceededError } from "@/lib/ai-extraction/errors";
import { buildExtractionJsonSchema } from "@/lib/ai-extraction/schema";
import type { ExtractionInput } from "@/lib/ai-extraction/types";

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function geminiTextResponse(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });
}

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

const SAMPLE_INPUT: ExtractionInput = {
  videoId: "abcdefghijk",
  videoTitle: "世田谷の名店に行ってみた",
  description: "概要欄のテキストです",
  transcript: "字幕テキストです",
  knownPerformerNames: ["だいち", "ゲストA"],
};

const SAMPLE_EXTRACTION_JSON = JSON.stringify({
  shops: [
    {
      name: "喫茶ダイチ",
      addressCandidate: "東京都世田谷区北沢3-31-3",
      consumptions: [{ performerName: "だいち", items: ["ブレンドコーヒー"] }],
    },
  ],
});

describe("createGeminiExtractionProvider", () => {
  it("name は 'gemini' である", () => {
    const provider = createGeminiExtractionProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("gemini");
  });

  it("Gemini応答のテキストをJSONとしてパースし、共通スキーマで検証して返す", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.extract(SAMPLE_INPUT);

    expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string) as {
      generationConfig?: {
        responseMimeType?: string;
        responseJsonSchema?: unknown;
        responseSchema?: unknown;
      };
    };
    expect(body.generationConfig?.responseMimeType).toBe("application/json");
  });

  it("スキーマは generationConfig.responseJsonSchema で渡し、responseSchema は使わない(P-014対応)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

    await provider.extract(SAMPLE_INPUT);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig?: {
        responseJsonSchema?: unknown;
        responseSchema?: unknown;
      };
    };
    expect(body.generationConfig?.responseJsonSchema).toEqual(
      buildExtractionJsonSchema(SAMPLE_INPUT.knownPerformerNames),
    );
    expect(body.generationConfig?.responseSchema).toBeUndefined();
  });

  it("apiKeyを環境変数(GEMINI_API_KEY)から解決できる", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
    const provider = createGeminiExtractionProvider({
      fetchImpl,
      env: makeEnv({ GEMINI_API_KEY: "env-api-key" }),
    });

    await provider.extract(SAMPLE_INPUT);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("env-api-key");
  });

  it("GEMINI_API_KEYが未設定の場合はErrorをthrowし、fetchは呼ばれない", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createGeminiExtractionProvider({ fetchImpl, env: makeEnv() });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("GEMINI_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Gemini APIがエラーステータスを返した場合はErrorをthrowする(maxRetries:0でリトライなし)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, maxRetries: 0 });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("status: 500");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("応答にテキストが含まれない場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ candidates: [] }));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("テキストが含まれていません");
  });

  it("応答テキストが不正なJSONの場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse("{ this is not json"));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("不正なJSON");
  });

  it("応答JSONが共通スキーマに違反する場合はErrorをthrowする", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(geminiTextResponse(JSON.stringify({ shops: "not an array" })));
    const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("AI応答のスキーマが不正です");
  });

  describe("動画入力方式(タスク4-3c, P-015対応)", () => {
    it("contentsに動画パート(file_data.file_uri=正しいYouTube視聴URL)とテキストパートを渡す", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

      await provider.extract(SAMPLE_INPUT);

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        contents?: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      };
      const parts = body.contents?.[0]?.parts ?? [];
      expect(parts[0]).toEqual({
        file_data: { file_uri: `https://www.youtube.com/watch?v=${SAMPLE_INPUT.videoId}` },
      });
      expect(typeof parts[1]?.text).toBe("string");
    });

    it("generationConfig.mediaResolutionにMEDIA_RESOLUTION_LOWを指定する", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

      await provider.extract(SAMPLE_INPUT);

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        generationConfig?: { mediaResolution?: string };
      };
      expect(body.generationConfig?.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
    });
  });

  describe("一時的エラーのリトライ(タスク4-3c, P-015対応)", () => {
    it("503が1回発生しても指数バックオフでリトライして最終的に成功する", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      const result = await provider.extract(SAMPLE_INPUT);

      expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waitImpl).toHaveBeenCalledTimes(1);
      expect(waitImpl).toHaveBeenCalledWith(1000);
    });

    it("503がmaxRetries回を超えて続く場合は最終的にErrorをthrowする(実時間は待たない)", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, { status: 503 }));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({
        apiKey: "test-key",
        fetchImpl,
        waitImpl,
        maxRetries: 3,
      });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("status: 503");
      // 初回 + リトライ3回 = 4回呼ばれる
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(waitImpl).toHaveBeenCalledTimes(3);
    });

    it("429/500/502/504も一時的エラーとしてリトライ対象になる", async () => {
      for (const status of [429, 500, 502, 504]) {
        const fetchImpl = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(jsonResponse({}, { status }))
          .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
        const waitImpl = vi.fn().mockResolvedValue(undefined);
        const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

        await expect(provider.extract(SAMPLE_INPUT)).resolves.toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
        expect(fetchImpl).toHaveBeenCalledTimes(2);
      }
    });

    it("400はリトライせず即座にErrorをthrowする", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, { status: 400 }));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("status: 400");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(waitImpl).not.toHaveBeenCalled();
    });

    it("401/403もリトライせず即座にErrorをthrowする", async () => {
      for (const status of [401, 403]) {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, { status }));
        const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

        await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow(`status: ${status}`);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe("通信自体の失敗(fetchの例外)のリトライ(タスク4-3d, P-016対応)", () => {
    it("fetchが1回例外を投げても指数バックオフでリトライして最終的に成功する", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      const result = await provider.extract(SAMPLE_INPUT);

      expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waitImpl).toHaveBeenCalledTimes(1);
      expect(waitImpl).toHaveBeenCalledWith(1000);
    });

    it("fetchの例外がmaxRetries回を超えて続く場合は最終的にErrorをthrowする(実時間は待たない)", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({
        apiKey: "test-key",
        fetchImpl,
        waitImpl,
        maxRetries: 3,
      });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("接続に失敗しました");
      // 初回 + リトライ3回 = 4回呼ばれる
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(waitImpl).toHaveBeenCalledTimes(3);
    });

    it("HTTPエラーと通信失敗が混在しても合算でmaxRetriesまでリトライする", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl, maxRetries: 3 });

      const result = await provider.extract(SAMPLE_INPUT);

      expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(waitImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe("429の利用上限の扱い(タスク4-3e, P-017対応)", () => {
    /** problem.txt P-017に記載の実APIで確認済みの429応答本文(1日上限の例) */
    function dailyQuotaResponse(quotaValue = "20", retryDelay = "37s"): Response {
      return jsonResponse(
        {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "You exceeded your current quota, ...",
            details: [
              { "@type": "type.googleapis.com/google.rpc.Help" },
              {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [
                  {
                    quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                    quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                    quotaDimensions: { location: "global", model: "gemini-3.6-flash" },
                    quotaValue,
                  },
                ],
              },
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
            ],
          },
        },
        { status: 429 },
      );
    }

    function shortTermLimitResponse(retryDelay: string): Response {
      return jsonResponse(
        {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "You exceeded your current quota, ...",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [
                  {
                    quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                    quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
                    quotaValue: "5",
                  },
                ],
              },
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
            ],
          },
        },
        { status: 429 },
      );
    }

    it("1日上限(quotaIdにPerDayを含む)の場合は再試行せずGeminiDailyQuotaExceededErrorをthrowする(RetryInfoの短い待機時間は無視する)", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(dailyQuotaResponse("20", "37s"));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toBeInstanceOf(GeminiDailyQuotaExceededError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(waitImpl).not.toHaveBeenCalled();
    });

    it("1日上限のメッセージに応答のquotaValueが含まれる(ハードコードしない)", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(dailyQuotaResponse("20", "37s"));
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

      const error: unknown = await provider.extract(SAMPLE_INPUT).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(GeminiDailyQuotaExceededError);
      expect((error as Error).message).toContain("1日20回");
      expect((error as Error).message).toContain("日本時間16時ごろ以降");
    });

    it("quotaValueが異なる場合はメッセージもその値になる(ハードコードしていないことの確認)", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(dailyQuotaResponse("50", "10s"));
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("1日50回");
    });

    it("短時間の制限(quotaIdにPerDayを含まない)はRetryInfo.retryDelayの秒数だけ待って再試行し、成功する", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(shortTermLimitResponse("5s"))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      const result = await provider.extract(SAMPLE_INPUT);

      expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waitImpl).toHaveBeenCalledTimes(1);
      expect(waitImpl).toHaveBeenCalledWith(5000);
    });

    it("小数を含むretryDelay(例: 37.5s)も正しく秒→ミリ秒変換して待機する", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(shortTermLimitResponse("37.5s"))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      await provider.extract(SAMPLE_INPUT);

      expect(waitImpl).toHaveBeenCalledWith(37500);
    });

    it("retryDelayが90秒を超える場合は90秒(90000ms)に丸める", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(shortTermLimitResponse("200s"))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      await provider.extract(SAMPLE_INPUT);

      expect(waitImpl).toHaveBeenCalledWith(90_000);
    });

    it("error.detailsが無い429は既存の指数バックオフにフォールバックする", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      await provider.extract(SAMPLE_INPUT);

      expect(waitImpl).toHaveBeenCalledWith(1000);
    });

    it("error.detailsが解析不能な形(JSONでない)でも落ちずに既存の指数バックオフにフォールバックする", async () => {
      const invalidJsonResponse = new Response("not json", { status: 429 });
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(invalidJsonResponse)
        .mockResolvedValueOnce(geminiTextResponse(SAMPLE_EXTRACTION_JSON));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({ apiKey: "test-key", fetchImpl, waitImpl });

      const result = await provider.extract(SAMPLE_INPUT);

      expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
      expect(waitImpl).toHaveBeenCalledWith(1000);
    });

    it("短時間の制限でも再試行回数(maxRetries)を使い切ればErrorをthrowする", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(shortTermLimitResponse("1s"));
      const waitImpl = vi.fn().mockResolvedValue(undefined);
      const provider = createGeminiExtractionProvider({
        apiKey: "test-key",
        fetchImpl,
        waitImpl,
        maxRetries: 2,
      });

      await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("status: 429");
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(waitImpl).toHaveBeenCalledTimes(2);
    });
  });
});
