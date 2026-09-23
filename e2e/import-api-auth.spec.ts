import { expect, test } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser, signInEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク4-4(管理画面: 取り込み実行とレビューUI)の一部:
 * /api/admin/import/unregistered-videos・/api/admin/import/extract への認可のE2Eテスト。
 *
 * e2e/oembed-auth.spec.ts・e2e/geocode-auth.spec.ts と全く同じ設計・構成を踏襲する
 * (いずれも src/lib/admin-token.ts による同一の認可パターンを使うため)。
 * Playwrightの APIRequestContext(ブラウザを介さない直接HTTPリクエスト)でこれらの
 * エンドポイントを叩き、認可ゲートの3パターン(未認証/非管理者/管理者)を検証する。
 *
 * 管理者トークンでの成功確認は、実際のYouTube Data API・Gemini APIへの外部
 * ネットワークアクセスには依存させない(決定性・emulator環境で完結させるため)。
 * リクエストボディを不備のある内容にし、「認可エラー(401/403)ではなく
 * 業務バリデーションエラー(400)」が返ることをもって「認可ゲートを通過した」ことを
 * 確認する(認可チェックはボディのバリデーションより先に行われる)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

test.describe("/api/admin/import/unregistered-videos の認可(タスク4-4)", () => {
  test("Authorizationヘッダーが無い場合は401を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/unregistered-videos", {
      data: { existingVideoIds: [] },
    });
    expect(response.status()).toBe(401);
  });

  test("Bearer形式でないAuthorizationヘッダーの場合は401を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/unregistered-videos", {
      headers: { Authorization: "Basic abc123" },
      data: { existingVideoIds: [] },
    });
    expect(response.status()).toBe(401);
  });

  test("形式は正しいが無効なID Tokenの場合は403を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/unregistered-videos", {
      headers: { Authorization: "Bearer not-a-real-id-token" },
      data: { existingVideoIds: [] },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持たないユーザーのID Tokenは403を返す", async ({ request }) => {
    const email = `${uniqueTestId("e2e-import-list-nonadmin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: false });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.post("/api/admin/import/unregistered-videos", {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { existingVideoIds: [] },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持つユーザーのID Tokenは認可ゲートを通過する(400のexistingVideoIdsバリデーションまで到達する)", async ({
    request,
  }) => {
    const email = `${uniqueTestId("e2e-import-list-admin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.post("/api/admin/import/unregistered-videos", {
      headers: { Authorization: `Bearer ${idToken}` },
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("existingVideoIds(文字列の配列)が必要です");
  });
});

test.describe("/api/admin/import/extract の認可(タスク4-4)", () => {
  test("Authorizationヘッダーが無い場合は401を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/extract", {
      data: { videoId: "abc12345678", title: "テスト", publishedAt: "2026-01-01T00:00:00Z" },
    });
    expect(response.status()).toBe(401);
  });

  test("Bearer形式でないAuthorizationヘッダーの場合は401を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/extract", {
      headers: { Authorization: "Basic abc123" },
      data: {},
    });
    expect(response.status()).toBe(401);
  });

  test("形式は正しいが無効なID Tokenの場合は403を返す", async ({ request }) => {
    const response = await request.post("/api/admin/import/extract", {
      headers: { Authorization: "Bearer not-a-real-id-token" },
      data: {},
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持たないユーザーのID Tokenは403を返す", async ({ request }) => {
    const email = `${uniqueTestId("e2e-import-extract-nonadmin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: false });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.post("/api/admin/import/extract", {
      headers: { Authorization: `Bearer ${idToken}` },
      data: {},
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持つユーザーのID Tokenは認可ゲートを通過する(400のvideoId等バリデーションまで到達する)", async ({
    request,
  }) => {
    const email = `${uniqueTestId("e2e-import-extract-admin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.post("/api/admin/import/extract", {
      headers: { Authorization: `Bearer ${idToken}` },
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("videoId・title・publishedAtが必要です");
  });
});
