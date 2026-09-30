import { expect, test } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-1(管理画面レイアウトとGoogle認証)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」の管理者判定方針に基づき、
 * 以下3パターンを検証する:
 *   a) adminクレーム付きユーザーでログイン → 管理画面が表示される
 *   b) adminクレーム無しユーザーでログイン → アクセス拒否画面が表示される
 *   c) 未ログイン → ログイン画面が表示される
 *
 * ログイン方式について: 本番の唯一のログイン導線はGoogleログインだが、
 * Auth Emulatorのフェイクアカウントポップアップ操作はPlaywrightからの自動化が
 * 不安定なため、Emulator REST APIで直接作成したテストユーザーに対し
 * 「Emulatorテストログイン」フォーム(email/password、emulator接続時のみ表示)から
 * サインインする(e2e/support/emulator-auth.ts 参照)。判定ロジック自体
 * (AdminAuthProvider/AdminGate)は本番のGoogleログインと共通のため、
 * 「クレーム有無で表示が分岐する」という検証したい挙動は維持されている。
 *
 * タスク6-3b(P-030)対応: 管理画面はPC専用(requirements.md 3.2、2026-09-30決定)のため、
 * このファイルの全テストはPC幅(chromium-desktop)のみで実施する。
 */
const TEST_PASSWORD = "e2e-test-password-123";
const ADMIN_ONLY_SKIP_REASON =
  "管理画面はPC専用のため管理画面操作のE2EはPC幅(chromium-desktop)のみで実施する" +
  "(requirements.md 3.2、2026-09-30決定。problem.txt P-030)";

test.describe("管理画面(/admin)の認証・アクセス制御", () => {
  test("未ログイン時はログイン画面が表示される", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", ADMIN_ONLY_SKIP_REASON);

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "管理画面ログイン" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  });

  test("adminクレームを持つユーザーでログインすると管理画面が表示される", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", ADMIN_ONLY_SKIP_REASON);

    const email = `${uniqueTestId("e2e-admin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

    await page.goto("/admin");
    await page.getByTestId("emulator-test-email").fill(email);
    await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
    await page.getByTestId("emulator-test-login-submit").click();

    await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "管理メニュー" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "アクセス権がありません" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
  });

  test("adminクレームを持たないユーザーでログインするとアクセス拒否画面が表示される", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", ADMIN_ONLY_SKIP_REASON);

    const email = `${uniqueTestId("e2e-nonadmin")}@example.com`;
    await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: false });

    await page.goto("/admin");
    await page.getByTestId("emulator-test-email").fill(email);
    await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
    await page.getByTestId("emulator-test-login-submit").click();

    await expect(page.getByRole("heading", { name: "アクセス権がありません" })).toBeVisible();
    await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
  });
});
