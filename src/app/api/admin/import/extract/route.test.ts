/**
 * src/app/api/admin/import/extract/route.ts のユニットテスト(タスク4-3e、P-017対応)。
 *
 * 認可(401/403/400)はE2E(e2e/import-api-auth.spec.ts)で担保済みのため、ここでは
 * 「Geminiが1日上限エラー(GeminiDailyQuotaExceededError)をthrowした場合に、
 * ルートがそれを他のエラーと区別できる形(HTTP 429 + error.code)で返すこと」を、
 * 実際のGemini APIを叩かずグローバルfetchをモックして検証する
 * (src/lib/ai-extraction/save-draft.test.ts と同じ vi.mock パターンを踏襲)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAdminIdTokenMock = vi.fn();
const fetchVideoTextContentMock = vi.fn();
const listPerformersMock = vi.fn();
const listPublishedShopsMock = vi.fn();

vi.mock("@/lib/admin-token", () => ({
  extractBearerToken: (header: string | null) => (header?.startsWith("Bearer ") ? header.slice(7) : null),
  verifyAdminIdToken: (...args: unknown[]) => verifyAdminIdTokenMock(...args),
}));
vi.mock("@/lib/youtube-transcript", () => ({
  fetchVideoTextContent: (...args: unknown[]) => fetchVideoTextContentMock(...args),
}));
vi.mock("@/repositories/performers", () => ({
  listPerformers: (...args: unknown[]) => listPerformersMock(...args),
}));
vi.mock("@/repositories/shops", () => ({
  listPublishedShops: (...args: unknown[]) => listPublishedShopsMock(...args),
}));

/** problem.txt P-017に記載の実APIで確認済みの429応答本文(1日上限の例) */
function dailyQuotaGeminiResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "You exceeded your current quota, ...",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                quotaValue: "20",
              },
            ],
          },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" },
        ],
      },
    }),
    { status: 429, headers: { "content-type": "application/json" } },
  );
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/import/extract", {
    method: "POST",
    headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("@/app/api/admin/import/extract/route");
}

describe("POST /api/admin/import/extract", () => {
  beforeEach(() => {
    verifyAdminIdTokenMock.mockReset().mockResolvedValue(true);
    fetchVideoTextContentMock.mockReset().mockResolvedValue({
      description: "概要欄のテキストです",
      transcript: null,
    });
    listPerformersMock.mockReset().mockResolvedValue([]);
    listPublishedShopsMock.mockReset().mockResolvedValue([]);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("AI_PROVIDER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Geminiの1日上限エラー時はHTTP 429 + error.code=GEMINI_DAILY_QUOTA_EXCEEDEDを返す(タスク4-3e, P-017対応)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(dailyQuotaGeminiResponse()));
    const { POST } = await importRoute();

    const response = await POST(
      buildRequest({ videoId: "abcdefghijk", title: "テスト動画", publishedAt: "2026-01-01T00:00:00Z" }),
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("GEMINI_DAILY_QUOTA_EXCEEDED");
    expect(body.error?.message).toContain("1日20回");
  });

  it("それ以外のエラー(通常のGemini APIエラー等)は従来どおりHTTP 502 + error(文字列)を返す", async () => {
    // 400は非リトライ対象のため実時間のバックオフ待機が発生せず、テストが高速に完了する
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    const { POST } = await importRoute();

    const response = await POST(
      buildRequest({ videoId: "abcdefghijk", title: "テスト動画", publishedAt: "2026-01-01T00:00:00Z" }),
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
  });
});
