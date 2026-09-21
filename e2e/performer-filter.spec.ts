import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク3-4(出演者フィルタ)のE2Eテスト。
 *
 * requirements.md「3.1 公開ページ」の
 * 「出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。
 *   選択した出演者が出演した訪問がある店舗のみ表示」に基づき、
 * - フィルタUI(PerformerFilter)にisMain=falseの出演者のみが選択肢として表示され、
 *   isMain=trueの出演者(メイン出演者)は選択肢に出ないこと
 * - 出演者を選択すると、その出演者が参加したpublished visitを持つ店舗のピンのみ表示され、
 *   参加していない店舗のピンが消えること
 * - 選択解除で全published店舗のピンに戻ること
 * を検証する。
 *
 * seedデータ(scripts/seed.ts)には
 * - performer-test-main(isMain=true)/performer-test-sub(isMain=false)
 * - shop-test-published-01(published) × dAyChiTEST1(published) の
 *   visit-test-published-01(performer-test-main・performer-test-subの両方が参加)
 * が存在するが、これだけでは「絞り込みで消えるピン」を検証できない
 * (published店舗がshop-test-published-01の1件しかないため)。そのため、
 * e2e/detail-sheet.spec.ts・e2e/sidebar.spec.ts と同様にこのテスト自身が管理画面から
 * 一意な店舗・訪問(performer-test-subが参加しないもの)を作成・公開し、
 * 検証後に削除する(既存のdAyChiTEST1動画・出演者マスタはseed資産のまま変更しない)。
 *
 * 地図タイル(外部ネットワーク依存)はe2e/public-map.spec.ts等と同様ブロックする。
 * ピンの絞り込み結果は data-testid="map-pin"(data-shop-id / aria-label)で検証する。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
}

async function loginAsAdmin(page: Page, emailPrefix: string): Promise<void> {
  const email = `${uniqueTestId(emailPrefix)}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

test.describe("出演者フィルタ", () => {
  test("モバイル幅でも出演者フィルタが表示され地図が崩れない", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル幅での最低限の表示崩れ確認のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();

    // isMain=falseのperformer-test-subのみ選択肢に表示され、isMain=trueの
    // performer-test-mainは表示されない
    const subOption = page.locator(
      '[data-testid="performer-filter-option"][data-performer-id="performer-test-sub"]',
    );
    const mainOption = page.locator(
      '[data-testid="performer-filter-option"][data-performer-id="performer-test-main"]',
    );
    await expect(subOption).toBeVisible();
    await expect(mainOption).toHaveCount(0);

    // seedのpublished店舗のピンが引き続き表示されること(レイアウト崩れで地図が
    // 機能しなくなっていないことの最低限の確認)
    await expect(
      page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]'),
    ).toHaveCount(1);
  });

  test("デスクトップ: isMain=falseのみ選択肢に表示され、選択で店舗が絞り込まれ、解除で全件に戻る", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "管理画面CRUDセットアップの安定性の都合上デスクトップのみで検証する",
    );

    await loginAsAdmin(page, "e2e-performer-filter-admin");

    const testId = uniqueTestId("e2e-performer-filter");
    const shopName = `【E2Eテスト】出演者フィルタ店 ${testId}`;
    // desktop/mobileプロジェクトが並行実行されるため座標をジッターさせ、
    // ピンのDOM要素が重ならないようにする(e2e/sidebar.spec.tsと同方針)
    const shopLat = (35.55 + Math.random() * 0.05).toFixed(6);
    const shopLng = (139.55 + Math.random() * 0.05).toFixed(6);

    // 店舗を作成し公開する(performer-test-subは参加させない店舗)
    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
    await page.getByTestId("shop-create-name").fill(shopName);
    await page.getByTestId("shop-create-address").fill("東京都テスト区テスト2-2-2");
    await page.getByTestId("shop-create-businesshours").fill("10:00-19:00(テストデータ)");
    await page.getByTestId("shop-create-infoasof").fill("2026-06-01");
    await page.getByTestId("shop-create-lat").fill(shopLat);
    await page.getByTestId("shop-create-lng").fill(shopLng);
    await page.getByRole("button", { name: "作成" }).click();
    const shopRow = page.getByTestId("shop-row").filter({ hasText: shopName });
    await expect(shopRow).toBeVisible();
    await shopRow.getByTestId("shop-status-toggle").click();
    await expect(shopRow.getByTestId("shop-status")).toHaveText("公開");

    // 既存のseed動画(dAyChiTEST1、published)に紐付けて訪問を作成し公開する。
    // 出演者はperformer-test-mainのみ参加させる(performer-test-subは参加しない)
    await page.getByRole("link", { name: "訪問" }).click();
    await expect(page.getByRole("heading", { name: "訪問登録" })).toBeVisible();
    await page.getByTestId("visit-create-shop").selectOption({ label: shopName });
    await page
      .getByTestId("visit-create-video")
      .selectOption({ label: "【テスト用】公開済み動画" });
    await page.getByTestId("visit-create-consumption-addrow").click();
    const consumptionRow = page.getByTestId("visit-create-consumption-row").nth(0);
    await consumptionRow
      .getByTestId("visit-create-consumption-performer")
      .selectOption({ label: "【テスト用】メイン出演者" });
    await consumptionRow
      .getByTestId("visit-create-consumption-item")
      .nth(0)
      .fill(`【テスト用】出演者フィルタ用メニュー ${testId}`);
    await page.getByRole("button", { name: "作成" }).click();

    const visitRow = page
      .getByTestId("visit-row")
      .filter({ hasText: "【テスト用】公開済み動画" })
      .filter({ hasText: shopName });
    await expect(visitRow).toBeVisible();
    await visitRow.getByTestId("visit-status-toggle").click();
    await expect(visitRow.getByTestId("visit-status")).toHaveText("公開");

    // --- 公開ページで出演者フィルタを検証する ---
    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    // isMain=falseのperformer-test-subのみ選択肢に表示され、isMain=trueの
    // performer-test-mainは表示されない
    const subOption = page.locator(
      '[data-testid="performer-filter-option"][data-performer-id="performer-test-sub"]',
    );
    const mainOption = page.locator(
      '[data-testid="performer-filter-option"][data-performer-id="performer-test-main"]',
    );
    await expect(subOption).toBeVisible();
    await expect(mainOption).toHaveCount(0);

    const seedPin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]');
    const newPin = page.locator(`[data-testid="map-pin"][aria-label="${shopName}"]`);

    // フィルタ未適用: 両方のピンが表示される
    await expect(seedPin).toHaveCount(1);
    await expect(newPin).toHaveCount(1);

    // performer-test-subを選択: 参加しているseedPinのみ残り、参加していないnewPinは消える
    await subOption.locator("input[type=checkbox]").check();
    await expect(subOption).toHaveAttribute("data-selected", "true");
    await expect(seedPin).toHaveCount(1);
    await expect(newPin).toHaveCount(0);

    // 選択解除: 全published店舗のピンに戻る
    await subOption.locator("input[type=checkbox]").uncheck();
    await expect(subOption).toHaveAttribute("data-selected", "false");
    await expect(seedPin).toHaveCount(1);
    await expect(newPin).toHaveCount(1);

    // --- 後片付け: 管理画面から作成した訪問・店舗をすべて削除する ---
    await page.goto("/admin");
    await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();

    await page.getByRole("link", { name: "訪問" }).click();
    for (const row of await page
      .getByTestId("visit-row")
      .filter({ hasText: "【テスト用】公開済み動画" })
      .filter({ hasText: shopName })
      .all()) {
      await row.getByRole("button", { name: "削除" }).click();
      await page.getByTestId("visit-delete-confirm-confirm").click();
    }

    await page.getByRole("link", { name: "店舗" }).click();
    const cleanupShopRow = page.getByTestId("shop-row").filter({ hasText: shopName });
    await expect(cleanupShopRow).toBeVisible();
    await cleanupShopRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("shop-delete-confirm-confirm").click();
    await expect(page.getByTestId("shop-row").filter({ hasText: shopName })).toHaveCount(0);
  });
});
