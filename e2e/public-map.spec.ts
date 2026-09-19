import { expect, test } from "@playwright/test";

/**
 * 公開トップページ(/)の地図表示とピン(タスク3-1)のE2Eテスト。
 *
 * requirements.md「3.1 公開ページ」に基づき、公開トップページが未認証でも表示でき、
 * published店舗のみが地図上にピン表示され、draft店舗のピンは表示されないことを検証する。
 *
 * 地図タイル(MapLibre GL + OpenFreeMap)は外部ネットワーク依存でありE2Eの決定性・速度に
 * 影響するため、e2e/shops-crud.spec.ts等と同様にtiles.openfreemap.orgへのリクエストは
 * すべてブロックする。ピンの存在確認はマーカー要素に付与した
 * data-testid="map-pin" / data-shop-id 属性(src/components/map/PublicMap.tsx)で行う
 * (タイルの実描画結果ではなくDOM要素の存在で決定的に検証するため)。
 *
 * 検証対象はscripts/seed.tsが投入する固定IDの店舗
 * (shop-test-published-01 = published、shop-test-draft-01 = draft)。
 * 他のE2E spec(e2e/status-toggle.spec.ts等)が並列実行時に一時的なpublished店舗を
 * 作成・削除することがあるため、ピンの総数を数えるのではなく、固定IDに紐づくピンの
 * 有無のみをdata-shop-id属性で厳密に検証し、並列実行による影響を受けないようにする。
 */
test.describe("公開トップページの地図表示(published店舗のピン)", () => {
  test("未認証で公開ページが表示され、published店舗のピンのみ表示される", async ({ page }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();

    // published店舗(shop-test-published-01)のピンが表示される
    const publishedPin = page.locator(
      '[data-testid="map-pin"][data-shop-id="shop-test-published-01"]',
    );
    await expect(publishedPin).toHaveCount(1);

    // draft店舗(shop-test-draft-01)のピンは表示されない
    const draftPin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-draft-01"]');
    await expect(draftPin).toHaveCount(0);

    // 取得エラー表示が出ていないこと(未認証でもpublished読み取りが成功していること)
    await expect(page.getByTestId("public-map-error")).toHaveCount(0);
  });
});
