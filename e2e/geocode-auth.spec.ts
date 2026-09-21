import { expect, test } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser, signInEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-4c(住所ジオコーディングによるピン配置、problem.txt P-011対応)の一部:
 * /api/admin/geocode への認可のE2Eテスト。
 *
 * e2e/oembed-auth.spec.ts と全く同じ設計・構成を踏襲する
 * (src/app/api/admin/geocode/route.ts と src/app/api/admin/oembed/route.ts は
 * 同じ認可パターン(Firebase ID Tokenの検証。src/lib/admin-token.ts)を使うため)。
 * Playwrightの APIRequestContext(ブラウザを介さない直接HTTPリクエスト)で
 * このエンドポイントを叩き、認可ゲートの3パターン(未認証/非管理者/管理者)を検証する。
 *
 * 管理者トークンでの成功確認は、実際のNominatimへの外部ネットワークアクセスには
 * 依存させない(決定性・emulator環境で完結させるため)。addressクエリパラメータを
 * 省略し、「認可エラー(401/403)ではなく業務バリデーションエラー(400)」が返ることを
 * もって「認可ゲートを通過した」ことを確認する(認可チェックはsrc/app/api/admin/
 * geocode/route.ts でaddressパラメータの検証より先に行われる)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

test.describe("/api/admin/geocode の認可(タスク2-4c)", () => {
  test("Authorizationヘッダーが無い場合は401を返す", async ({ request }) => {
    const response = await request.get("/api/admin/geocode?address=東京都渋谷区道玄坂1-2-3");
    expect(response.status()).toBe(401);
  });

  test("Bearer形式でないAuthorizationヘッダーの場合は401を返す", async ({ request }) => {
    const response = await request.get("/api/admin/geocode", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(response.status()).toBe(401);
  });

  test("形式は正しいが無効なID Tokenの場合は403を返す", async ({ request }) => {
    const response = await request.get("/api/admin/geocode", {
      headers: { Authorization: "Bearer not-a-real-id-token" },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持たないユーザーのID Tokenは403を返す", async ({ request }) => {
    const email = `${uniqueTestId("e2e-geocode-nonadmin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: false });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.get("/api/admin/geocode", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    expect(response.status()).toBe(403);
  });

  test("管理者クレームを持つユーザーのID Tokenは認可ゲートを通過する(400のaddressバリデーションまで到達する)", async ({
    request,
  }) => {
    const email = `${uniqueTestId("e2e-geocode-admin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });
    const idToken = await signInEmulatorTestUser(email, TEST_PASSWORD);

    const response = await request.get("/api/admin/geocode", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("addressクエリパラメータが必要です");
  });
});
