import { expect, test } from "@playwright/test";

import { skipFirstView } from "./support/first-view";

/**
 * メタ情報(タイトル/OGP/favicon)のE2E検証(タスク3-6)。
 *
 * トップページのHTML head に、サービス名・OGP・faviconが正しく出力されることを確認する。
 * ファーストビュー(タスク7-2)はこのテストの検証対象外のためスキップする
 * (skipFirstViewについてはe2e/support/first-view.tsのコメント参照)。
 */
test.describe("メタ情報", () => {
  test("トップページにタイトル/OGP/faviconが設定されている", async ({ page }) => {
    await skipFirstView(page);
    await page.goto("/");

    await expect(page).toHaveTitle(/DayChi COFFEE MAP/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /DayChi COFFEE MAP/);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");

    const icons = page.locator('link[rel~="icon"]');
    await expect(icons).not.toHaveCount(0);

    // create-next-app初期化時に生成される標準favicon.ico(黒丸+白三角のNextロゴ)が
    // icon linkとして残っていないことを確認する(タスク3-6 FAIL: 標準ロゴ残存の再発防止)
    const iconHrefs = await icons.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    expect(iconHrefs.some((href) => href.includes("/favicon.ico"))).toBe(false);

    // タスク8-3(P-032とは別件、DayChi COFFEE CHANNELのロゴ画像への差し替え):
    // icon.png(src/app/icon.png。ユーザー提供画像をそのまま使用)由来のfaviconが
    // 正しく出力されていること、そのURLが実際に200でimage/pngを返すことを確認する
    const iconHref = iconHrefs.find((href) => href.includes("/icon.png"));
    expect(iconHref).toBeDefined();

    const iconResponse = await page.request.get(iconHref as string);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toBe("image/png");

    // /favicon.ico に直接アクセスしても、create-next-app標準ロゴ(25931バイトのico)が
    // 配信されないことを確認する(favicon.ico自体が存在しなくなった=404であればOK)
    const faviconResponse = await page.request.get("/favicon.ico");
    expect(faviconResponse.status()).toBe(404);
  });
});
