import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-2(出演者マスタCRUD)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」performers に基づき、
 * /admin/performers での作成→一覧表示→編集→削除の一連操作を検証する。
 *
 * ログイン方式は e2e/admin-auth.spec.ts と同様、Auth Emulator REST APIで
 * 作成したadminクレーム付きテストユーザーで「Emulatorテストログイン」フォームから
 * サインインする(本番の唯一のログイン導線であるGoogleログインは
 * Playwrightからの自動化が不安定なため)。
 *
 * seedスクリプト(scripts/seed.ts)が投入する固定IDの出演者
 * (performer-test-main / performer-test-sub)は他タスクの検証データとして
 * 使われ続けるため、本テストでは一意な名前の新規出演者を作成・編集・削除し、
 * seedデータには一切触れない。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-performers-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

test.describe("出演者マスタCRUD(/admin/performers)", () => {
  test("作成→一覧表示→編集→削除の一連操作ができる", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("link", { name: "出演者" }).click();
    await expect(page.getByRole("heading", { name: "出演者マスタ" })).toBeVisible();

    const name = `【E2Eテスト】${uniqueTestId("performer")}`;
    const updatedName = `${name}-更新後`;

    // 作成: 名前・メイン出演者フラグ・表示順を入力して作成する
    await page.getByTestId("performer-create-name").fill(name);
    await page.getByTestId("performer-create-ismain").check();
    await page.getByTestId("performer-create-order").fill("42");
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 作成した出演者が一覧に反映される
    const row = page.getByTestId("performer-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByText("42")).toBeVisible();
    await expect(row).toContainText("○");

    // 編集: 名前を変更して保存する
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("performer-edit-name").fill(updatedName);
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("performer-row").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();

    // 削除: 一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("performer-row").filter({ hasText: updatedName })).toHaveCount(0);
  });
});
