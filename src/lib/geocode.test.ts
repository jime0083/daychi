/**
 * src/lib/geocode.ts のユニットテスト(タスク4-3で src/app/api/admin/geocode/route.ts から
 * 切り出した共通サーバー関数)。実際の国土地理院GSI APIは呼び出さず、fetchをモックして検証する。
 */
import { describe, expect, it, vi } from "vitest";

import { geocodeWithGsi, isBanchiLevelAddress } from "@/lib/geocode";

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("geocodeWithGsi", () => {
  it("GSI応答(GeoJSON)から{lat, lng, displayName}を返す(座標順の変換込み)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse([
        {
          geometry: { coordinates: [139.668, 35.661] },
          properties: { title: "東京都世田谷区北沢3-31-3" },
        },
      ]),
    );

    const result = await geocodeWithGsi("東京都世田谷区北沢3-31-3", { fetchImpl });

    expect(result).toEqual({ lat: 35.661, lng: 139.668, displayName: "東京都世田谷区北沢3-31-3" });
  });

  it("空配列(該当なし)の場合はnullを返す", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse([]));

    const result = await geocodeWithGsi("存在しない住所", { fetchImpl });

    expect(result).toBeNull();
  });

  it("GSIがエラーステータスを返した場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, { status: 500 }));

    await expect(geocodeWithGsi("住所", { fetchImpl })).rejects.toThrow("status: 500");
  });

  it("fetch自体が失敗(ネットワークエラー)した場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));

    await expect(geocodeWithGsi("住所", { fetchImpl })).rejects.toThrow("接続に失敗しました");
  });

  it("座標が数値でない不正な応答の場合はErrorをthrowする", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ geometry: { coordinates: [NaN, NaN] } }]));

    await expect(geocodeWithGsi("住所", { fetchImpl })).rejects.toThrow("応答が不正です");
  });

  it("fetchImplを省略した場合はグローバルfetchが使われる", async () => {
    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await geocodeWithGsi("住所");

    expect(result).toBeNull();
    expect(globalFetchSpy).toHaveBeenCalledTimes(1);
    globalFetchSpy.mockRestore();
  });
});

describe("isBanchiLevelAddress", () => {
  it("番地まで特定できた正規化住所(「番」を含む)はtrueと判定する", () => {
    expect(isBanchiLevelAddress("東京都世田谷区北沢三丁目３１番３号")).toBe(true);
    expect(isBanchiLevelAddress("東京都渋谷区道玄坂一丁目２番")).toBe(true);
  });

  it("丁目止まりの正規化住所(「番」を含まない)はfalseと判定する", () => {
    expect(isBanchiLevelAddress("東京都世田谷区北沢三丁目")).toBe(false);
  });

  it("町名止まりの正規化住所(「番」を含まない)はfalseと判定する", () => {
    expect(isBanchiLevelAddress("東京都世田谷区北沢")).toBe(false);
  });

  it("正規化住所自体が取得できない(undefined)場合はfalseと判定する", () => {
    expect(isBanchiLevelAddress(undefined)).toBe(false);
  });
});
