/**
 * 住所から緯度経度を取得するジオコーディングを代行するRoute Handler
 * (タスク2-4c: 住所ジオコーディングによるピン配置、problem.txt P-011対応)。
 *
 * requirements.md「3.2 管理画面」の「住所を入力して『住所からピンを立てる』ボタンを
 * 押すとジオコーディング(Nominatim)で地図にピンを配置し、ずれていれば地図上で
 * ピンをドラッグして微調整して緯度経度を確定する」に対応する。
 *
 * 設計判断: ブラウザから直接 https://nominatim.openstreetmap.org を fetchするのではなく、
 * このサーバー側Route Handler経由で行う。
 * - Nominatimの利用規約でUser-Agentヘッダーの付与が必須とされており、サーバー側で
 *   固定のUser-Agentを付けることで確実に規約に従う
 * - E2Eテストではこのアプリ自身のエンドポイント(/api/admin/geocode)を
 *   Playwrightのpage.routeでインターセプトしてモックする(Nominatim側への
 *   実ネットワークアクセスに依存しない決定的なテストにするため。
 *   e2e/support/geocode-mock.ts参照)
 *
 * 認可について: /api/admin/oembed(タスク2-7、src/app/api/admin/oembed/route.ts)と
 * 同じパターンで、呼び出し元(管理画面)にFirebase ID Tokenを
 * `Authorization: Bearer <idToken>` ヘッダーで送らせ、サーバー側で
 * src/lib/admin-token.ts (Identity Toolkit REST APIのaccounts:lookupで
 * customAttributes.adminを確認)を使って検証する。トークンが無い場合は401、
 * トークンはあるが管理者クレームが無い/無効な場合は403を返す
 * (E2E: e2e/geocode-auth.spec.ts参照)。
 */
import { NextResponse } from "next/server";

import { extractBearerToken, verifyAdminIdToken } from "@/lib/admin-token";

interface GeocodeSuccessResponse {
  lat: number;
  lng: number;
  displayName?: string;
}

interface GeocodeErrorResponse {
  error: string;
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

/**
 * Nominatimの利用規約(https://operations.osmfoundation.org/policies/nominatim/)により、
 * 問い合わせ元を特定できる説明的なUser-Agentの付与が必須とされている。
 */
const NOMINATIM_USER_AGENT = "DaychiCoffeeMap/1.0 (admin geocoding)";

export async function GET(
  request: Request,
): Promise<NextResponse<GeocodeSuccessResponse | GeocodeErrorResponse>> {
  const idToken = extractBearerToken(request.headers.get("authorization"));
  if (idToken === null) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const isAdmin = await verifyAdminIdToken(idToken);
  if (!isAdmin) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (address === null || address.trim() === "") {
    return NextResponse.json({ error: "addressクエリパラメータが必要です" }, { status: 400 });
  }

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=ja`;

  let nominatimResponse: Response;
  try {
    nominatimResponse = await fetch(nominatimUrl, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });
  } catch {
    return NextResponse.json(
      { error: "ジオコーディングAPIへの接続に失敗しました" },
      { status: 502 },
    );
  }

  if (!nominatimResponse.ok) {
    return NextResponse.json(
      { error: `ジオコーディングAPIがエラーを返しました(status: ${nominatimResponse.status})` },
      { status: 502 },
    );
  }

  const results = (await nominatimResponse.json()) as NominatimSearchResult[];
  const first = results[0];
  if (first === undefined || first.lat === undefined || first.lon === undefined) {
    return NextResponse.json(
      { error: "住所から座標が見つかりませんでした。住所を確認するか、地図をクリックして指定してください" },
      { status: 404 },
    );
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "ジオコーディングAPIの応答が不正です" },
      { status: 502 },
    );
  }

  return NextResponse.json({ lat, lng, displayName: first.display_name });
}
