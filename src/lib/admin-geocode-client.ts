/**
 * /api/admin/geocode 呼び出しのクライアント側ヘルパー(タスク2-4c: 住所ジオコーディング
 * によるピン配置、problem.txt P-011対応)。
 *
 * src/app/admin/videos/page.tsx が /api/admin/oembed を呼ぶのと同じパターンで、
 * 呼び出し元(/admin/shops)が useAdminAuth() で取得したFirebase Userの
 * getIdToken() を Authorization: Bearer ヘッダーに載せて渡す想定とする
 * (このモジュール自体はトークンの取得方法を知らず、引数で受け取るだけ)。
 */
import type { GeoLocation } from "@/types/common";

interface GeocodeApiResponse {
  lat?: number;
  lng?: number;
  error?: string;
}

/**
 * 住所文字列をジオコーディングして緯度経度を取得する。
 * 座標が見つからない場合・認可エラー・通信エラーの場合はいずれもErrorをthrowし、
 * メッセージには利用者向けの分かりやすい文言(サーバー側のerrorフィールド、
 * 無ければstatusを含むデフォルト文言)を使う。呼び出し側でcatchしてUIに表示する。
 */
export async function geocodeAddress(address: string, idToken: string): Promise<GeoLocation> {
  const response = await fetch(`/api/admin/geocode?address=${encodeURIComponent(address)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = (await response.json()) as GeocodeApiResponse;

  if (!response.ok || typeof body.lat !== "number" || typeof body.lng !== "number") {
    throw new Error(body.error ?? `座標の取得に失敗しました(status: ${response.status})`);
  }

  return { lat: body.lat, lng: body.lng };
}
