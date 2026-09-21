import type { Page } from "@playwright/test";

/**
 * /api/admin/geocode をモックするE2E共通ヘルパー(タスク2-4c: 住所ジオコーディング
 * によるピン配置、problem.txt P-011対応)。
 *
 * 実際のNominatim(外部ネットワーク)には依存させず、テストが使う住所文字列ごとに
 * 決定的な座標を返すようルーティングする(e2e/oembed-auth.spec.tsのoEmbedモックと
 * 同じ考え方)。
 *
 * 登録されていない住所でジオコードボタンが押された場合は404(見つからない)として
 * 扱う。これにより「テスト側の住所指定漏れ」によって偶発的にNominatim互換の
 * ダミー座標が返ってテストが誤ってpassする事故を防ぐ(未登録=見つからないが正しい挙動)。
 */
export interface GeocodeMockLocation {
  lat: number;
  lng: number;
}

export async function mockGeocode(
  page: Page,
  addressToLocation: Record<string, GeocodeMockLocation>,
): Promise<void> {
  await page.route("**/api/admin/geocode**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const address = requestUrl.searchParams.get("address") ?? "";
    const location = addressToLocation[address];

    if (location === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "住所から座標が見つかりませんでした" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ lat: location.lat, lng: location.lng }),
    });
  });
}
