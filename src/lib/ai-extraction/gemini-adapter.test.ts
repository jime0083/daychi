/**
 * src/lib/ai-extraction/gemini-adapter.ts のユニットテスト(タスク4-3)。
 * 実際のGemini APIは呼び出さず、fetchをモックして検証する(実API疎通確認はタスク4-5)。
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GEMINI_MODEL,
  createGeminiExtractionProvider,
} from "@/lib/ai-extraction/gemini-adapter";
import { EXTRACTION_JSON_SCHEMA } from "@/lib/ai-extraction/schema";
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
    expect(body.generationConfig?.responseJsonSchema).toEqual(EXTRACTION_JSON_SCHEMA);
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
});
