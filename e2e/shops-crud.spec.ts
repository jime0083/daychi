import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-4(店舗登録CRUD・地図ピン位置指定)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops に基づき、
 * /admin/shops での「フォーム入力(店名・住所・営業時間・情報基準日・座標)→
 * 保存→一覧表示→編集→削除」の一連操作を検証する。
 *
 * 地図タイル(MapLibre GL + OpenFreeMap)は外部ネットワーク依存であり、
 * E2Eの決定性・速度に影響するため tiles.openfreemap.org へのリクエストは
 * すべてブロックする。緯度経度の確定はアプリ側の設計上、地図クリック/ドラッグに
 * 依存せず数値入力欄(shop-create-lat / shop-create-lng 等)でも行えるため、
 * 本テストでは数値入力欄側で座標を設定して検証する(地図はUI補助という位置づけ。
 * src/components/admin/ShopLocationPicker.tsx のコメント参照)。これにより
 * 地図が原因でテストがflakyになることを避ける。
 *
 * ログイン方式・一意ID生成方式は e2e/videos-crud.spec.ts と同様。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-shops-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

test.describe("店舗登録CRUD(/admin/shops)", () => {
  test("フォーム入力+座標指定→保存→一覧表示→編集→削除ができる", async ({ page }) => {
    // 地図タイル/スタイルへのネットワークリクエストは外部依存のためブロックする
    // (MapLibreの初期化自体は行われるが、タイル取得の成否はこのテストの検証対象外)
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page);

    const shopId = uniqueTestId("e2e-shop");
    const name = `【E2Eテスト】${shopId}`;
    const updatedName = `${name}-更新後`;
    const address = "東京都渋谷区道玄坂1-2-3";
    const businessHours = "8:00-18:00(月曜定休)";

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    // フォーム入力: 店名・住所・営業時間・情報基準日・座標(数値入力欄)
    await page.getByTestId("shop-create-name").fill(name);
    await page.getByTestId("shop-create-address").fill(address);
    await page.getByTestId("shop-create-businesshours").fill(businessHours);
    await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
    await page.getByTestId("shop-create-lat").fill("35.658034");
    await page.getByTestId("shop-create-lng").fill("139.701636");
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 入力した項目・座標が反映される(ステータスはdraftデフォルト=下書き)
    const row = page.getByTestId("shop-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(address);
    await expect(row).toContainText(businessHours);
    await expect(row).toContainText("2026/5/1");
    await expect(row).toContainText("下書き");
    await expect(row.getByTestId("shop-location")).toHaveText("35.658034, 139.701636");

    // 編集: 店名と座標を変更して保存する
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("shop-edit-name").fill(updatedName);
    await page.getByTestId("shop-edit-lat").fill("35.170000");
    await page.getByTestId("shop-edit-lng").fill("136.881600");
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("shop-row").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.getByTestId("shop-location")).toHaveText("35.170000, 136.881600");

    // 削除: 一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("shop-row").filter({ hasText: updatedName })).toHaveCount(0);
  });
});
