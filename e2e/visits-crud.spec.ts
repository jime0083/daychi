import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-5(訪問(Visit)登録CRUD)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」visits に基づき、
 * /admin/visits での「店舗×動画の選択+出演者2名分の飲食メニュー入力(動的フォームでの
 * 品目追加を含む)→保存→一覧表示→編集→削除」の一連操作を検証する。
 *
 * 店舗・動画・出演者の選択肢は scripts/seed.ts が投入する固定テストデータ
 * (shop-test-published-01 / dAyChiTEST1 / performer-test-main・performer-test-sub)を
 * 利用する。これらは既に visit-test-published-01 として同じ組み合わせの訪問が
 * 1件登録されているため、一覧上で自分が作成した行だけを一意に特定できるよう、
 * 品目名にテスト実行ごとに変わる一意な文字列を埋め込んで判別する。
 *
 * ログイン方式・一意ID生成方式は e2e/shops-crud.spec.ts と同様。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-visits-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

test.describe("訪問登録CRUD(/admin/visits)", () => {
  test("店舗×動画×出演者2名分のメニュー入力→保存→一覧表示→編集→削除ができる", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const testId = uniqueTestId("e2e-visit");
    const itemMain1 = `【E2Eテスト】${testId}-ブレンドコーヒー`;
    const itemMain2 = `【E2Eテスト】${testId}-チーズケーキ`;
    const itemSub1 = `【E2Eテスト】${testId}-カフェラテ`;
    const updatedItemMain1 = `${itemMain1}-更新後`;

    await page.getByRole("link", { name: "訪問" }).click();
    await expect(page.getByRole("heading", { name: "訪問登録" })).toBeVisible();

    // 店舗・動画のセレクト選択肢(seedデータ)が読み込まれるのを待ってから選択する
    const shopSelect = page.getByTestId("visit-create-shop");
    const videoSelect = page.getByTestId("visit-create-video");
    await expect(shopSelect).toContainText("喫茶テスト 公開店");
    await expect(videoSelect).toContainText("公開済み動画");
    await shopSelect.selectOption({ label: "【テスト用】喫茶テスト 公開店" });
    await videoSelect.selectOption({ label: "【テスト用】公開済み動画" });

    // 出演者1人目: メイン出演者、品目を2件(動的フォームでの追加を含む)
    await page.getByTestId("visit-create-consumption-addrow").click();
    const row0 = page.getByTestId("visit-create-consumption-row").nth(0);
    await row0
      .getByTestId("visit-create-consumption-performer")
      .selectOption({ label: "【テスト用】メイン出演者" });
    await row0.getByTestId("visit-create-consumption-item").nth(0).fill(itemMain1);
    await row0.getByTestId("visit-create-consumption-additem").click();
    await row0.getByTestId("visit-create-consumption-item").nth(1).fill(itemMain2);

    // 出演者2人目: サブ出演者、品目を1件
    await page.getByTestId("visit-create-consumption-addrow").click();
    const row1 = page.getByTestId("visit-create-consumption-row").nth(1);
    await row1
      .getByTestId("visit-create-consumption-performer")
      .selectOption({ label: "【テスト用】出演者A" });
    await row1.getByTestId("visit-create-consumption-item").nth(0).fill(itemSub1);

    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 店舗名・動画タイトル・ステータス(下書き)・出演者名・品目が表示される
    const row = page.getByTestId("visit-row").filter({ hasText: testId });
    await expect(row).toBeVisible();
    await expect(row).toContainText("喫茶テスト 公開店");
    await expect(row).toContainText("公開済み動画");
    await expect(row).toContainText("下書き");
    await expect(row).toContainText("メイン出演者");
    await expect(row).toContainText(itemMain1);
    await expect(row).toContainText(itemMain2);
    await expect(row).toContainText("出演者A");
    await expect(row).toContainText(itemSub1);

    // 編集: 1人目の1件目の品目を書き換えて保存する
    await row.getByRole("button", { name: "編集" }).click();
    const editRow0 = page.getByTestId("visit-edit-consumption-row").nth(0);
    await editRow0.getByTestId("visit-edit-consumption-item").nth(0).fill(updatedItemMain1);
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("visit-row").filter({ hasText: testId });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(updatedItemMain1);
    await expect(updatedRow).toContainText(itemMain2);
    await expect(updatedRow).toContainText(itemSub1);

    // 削除: 一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("visit-row").filter({ hasText: testId })).toHaveCount(0);
  });
});
