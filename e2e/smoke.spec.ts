import { expect, test } from "@playwright/test";

/**
 * スモークテスト(タスク1-6: Playwright E2E基盤)。
 *
 * Playwright + Firebase Emulator Suite + Next.js dev server を組み合わせたE2E実行環境
 * (npm run e2e)そのものが正しく機能することを確認する最小限のテスト。
 * トップページの具体的な内容(地図・店舗ピン等)はPhase 3で実装されるため、
 * ここでは「ページが正常に表示されること」のみを検証する。
 */
test.describe("E2E基盤の疎通確認", () => {
  test("トップページが表示される", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("main")).toBeVisible();
  });
});
