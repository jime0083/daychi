/**
 * src/lib/google-maps.ts のユニットテスト(タスク6-3: 「Googleマップで開く」ボタン、P-021)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { describe, expect, it } from "vitest";

import { PLACE_ID_FINDER_URL, buildGoogleMapsSearchUrl } from "@/lib/google-maps";

describe("buildGoogleMapsSearchUrl", () => {
  it("店名+住所を検索語にしたURLを組み立てる(Place ID未指定)", () => {
    const url = buildGoogleMapsSearchUrl("筋金珈琲焙煎所", "東京都世田谷区北沢3-31-3");
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=%E7%AD%8B%E9%87%91%E7%8F%88%E7%90%B2%E7%84%99%E7%85%8E%E6%89%80+%E6%9D%B1%E4%BA%AC%E9%83%BD%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA%E5%8C%97%E6%B2%A23-31-3",
    );
  });

  it("query_place_idが指定された場合はクエリに付与する", () => {
    const url = buildGoogleMapsSearchUrl("筋金珈琲焙煎所", "東京都世田谷区北沢3-31-3", "abc123XYZ");
    expect(url).toContain("query_place_id=abc123XYZ");
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
  });

  it("placeIdが未指定(undefined)の場合はquery_place_idを付与しない", () => {
    const url = buildGoogleMapsSearchUrl("店名", "住所", undefined);
    expect(url).not.toContain("query_place_id");
  });

  it("placeIdが空文字/空白のみの場合はquery_place_idを付与しない", () => {
    expect(buildGoogleMapsSearchUrl("店名", "住所", "")).not.toContain("query_place_id");
    expect(buildGoogleMapsSearchUrl("店名", "住所", "   ")).not.toContain("query_place_id");
  });

  it("placeIdの前後の空白を除去してクエリに付与する", () => {
    const url = buildGoogleMapsSearchUrl("店名", "住所", "  abc123  ");
    expect(url).toContain("query_place_id=abc123");
  });

  it("記号・スラッシュ・アンパサンドを含む店名/住所を正しくURLエンコードする", () => {
    const url = buildGoogleMapsSearchUrl("Café & Bar", "Tokyo/Shibuya 1-2-3");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("query")).toBe("Café & Bar Tokyo/Shibuya 1-2-3");
    expect(url).toContain("query=Caf%C3%A9+%26+Bar+Tokyo%2FShibuya+1-2-3");
  });

  it("空白のみの店名/住所は空文字のqueryになる", () => {
    const url = buildGoogleMapsSearchUrl("  ", "  ");
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=");
  });
});

describe("PLACE_ID_FINDER_URL", () => {
  it("Google公式のPlace ID Finderページを指す", () => {
    expect(PLACE_ID_FINDER_URL).toBe(
      "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder",
    );
  });
});
