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
    // 表示順は他フィールド(ランダムID等)のテキストと混同しない値にする。
    // ロケータ自体をgetByTestId(表示順セル限定)+toHaveText(完全一致)で
    // 厳密化しているため衝突耐性は既にあるが、値自体も分かりやすく一意な数値にする
    const order = "917";

    // 作成: 名前・メイン出演者フラグ・表示順を入力して作成する
    await page.getByTestId("performer-create-name").fill(name);
    await page.getByTestId("performer-create-ismain").check();
    await page.getByTestId("performer-create-order").fill(order);
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 作成した出演者が一覧に反映される(タスク2-7: 成功メッセージも表示される)
    const row = page.getByTestId("performer-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("performer-order")).toHaveText(order);
    await expect(row).toContainText("○");
    await expect(page.getByTestId("performer-success")).toContainText("出演者を作成しました");

    // 編集: 名前を変更して保存する(タスク2-7: 成功メッセージも表示される)
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("performer-edit-name").fill(updatedName);
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("performer-row").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();
    await expect(page.getByTestId("performer-success")).toContainText("出演者を更新しました");

    // 削除: 確認ダイアログ(タスク2-7)で確認すると一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("performer-delete-confirm")).toBeVisible();
    await page.getByTestId("performer-delete-confirm-confirm").click();
    await expect(page.getByTestId("performer-row").filter({ hasText: updatedName })).toHaveCount(0);
  });

  test("名前未入力で作成しようとするとエラーメッセージが表示され作成されない(タスク2-7)", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.getByRole("link", { name: "出演者" }).click();
    await expect(page.getByRole("heading", { name: "出演者マスタ" })).toBeVisible();

    // 名前を空のまま作成しようとする
    await page.getByRole("button", { name: "作成" }).click();

    await expect(page.getByTestId("performer-create-error")).toContainText("名前を入力してください");
    // バリデーションで弾かれ、フォームがクリアされていない(=作成処理が実行されていない)ことも確認する
    await expect(page.getByTestId("performer-create-name")).toHaveValue("");
  });

  test("削除確認ダイアログでキャンセルすると削除されない(タスク2-7)", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("link", { name: "出演者" }).click();
    await expect(page.getByRole("heading", { name: "出演者マスタ" })).toBeVisible();

    const name = `【E2Eテスト】${uniqueTestId("performer-cancel")}`;
    await page.getByTestId("performer-create-name").fill(name);
    await page.getByRole("button", { name: "作成" }).click();

    const row = page.getByTestId("performer-row").filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("performer-delete-confirm")).toBeVisible();
    await page.getByTestId("performer-delete-confirm-cancel").click();

    await expect(page.getByTestId("performer-delete-confirm")).toHaveCount(0);
    await expect(row).toBeVisible();

    // 後片付け
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("performer-delete-confirm-confirm").click();
    await expect(page.getByTestId("performer-row").filter({ hasText: name })).toHaveCount(0);
  });
});
