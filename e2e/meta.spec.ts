import { expect, test } from "@playwright/test";

/**
 * メタ情報(タイトル/OGP/favicon)のE2E検証(タスク3-6)。
 *
 * トップページのHTML head に、サービス名・OGP・faviconが正しく出力されることを確認する。
 */
test.describe("メタ情報", () => {
  test("トップページにタイトル/OGP/faviconが設定されている", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Daychi COFFEE MAP/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Daychi COFFEE MAP/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");

    const icons = page.locator('link[rel~="icon"]');
    await expect(icons).not.toHaveCount(0);
  });
});
