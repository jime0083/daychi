import { expect, test } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser, signInEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-7(管理画面仕上げ)の一部: /api/admin/oembed への認可のE2Eテスト。
 *
 * 2-3レビュー所見への対応として、/api/admin/oembed はFirebase ID Tokenの検証
 * (src/lib/admin-token.ts。Identity Toolkit REST APIのaccounts:lookupを使用し、
 * firebase-adminは導入しない設計。理由はそちらのコメント参照)を必須にした。
 * ここではPlaywrightのAPIRequestContext(ブラウザを介さない直接HTTPリクエスト)で
 * このエンドポイントを叩き、認可ゲートの3パターン(未認証/非管理者/管理者)を
 * 検証する。
 *
 * 管理者トークンでの成功確認は、実際のyoutube.com/oembedへの外部ネットワーク
 * アクセスには依存させない(決定性・emulator環境で完結させるため)。urlクエリ
 * パラメータを省略し、「認可エラー(401/403)ではなく業務バリデーションエラー(400)」
 * が返ることをもって「認可ゲートを通過した」ことを確認する(認可チェックは
 * src/app/api/admin/oembed/route.ts でurlパラメータの検証より先に行われる)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

test.describe("/api/admin/oembed の認可(タスク2-7)", () => {
  test("Authorizationヘッダーが無い場合は401を返す", async ({ request }) => {
    const response = await request.get(
      "/api/admin/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(response.status()).toBe(401);
  });

  test("Bearer形式でないAuthorizationヘッダーの場合は401を返す", async ({ request }) => {
    const response = await request.get("/api/admin/oembed", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(response.status()).toBe(401);
  });

  test("形式は正しいが無効なID Tokenの場合は403を返す", async ({ request }) => {
    const response = await request.get("/api/admin/oembed", {
      headers: { Authorization: "Bearer not-a-real-id-token" },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持たないユーザーのID Tokenは403を返す", async ({ request }) => {
    const email = `${uniqueTestId("e2e-oembed-nonadmin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: false });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.get("/api/admin/oembed", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持つユーザーのID Tokenは認可ゲートを通過する(400のurlバリデーションまで到達する)", async ({
    request,
  }) => {
    const email = `${uniqueTestId("e2e-oembed-admin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.get("/api/admin/oembed", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("urlクエリパラメータが必要です");
  });
});
