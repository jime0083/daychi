/**
 * 住所から緯度経度を取得するジオコーディングを代行するRoute Handler
 * (タスク2-4c: 住所ジオコーディングによるピン配置、problem.txt P-011対応。
 * タスク2-4d: ジオコーダを国土地理院GSIに変更、problem.txt P-012対応)。
 *
 * requirements.md「3.2 管理画面」の「住所を入力して『住所からピンを立てる』ボタンを
 * 押すとジオコーディング(国土地理院GSI・キー不要・日本の番地に対応)で地図にピンを
 * 配置し、ずれていれば地図上でピンをドラッグして微調整して緯度経度を確定する」に対応する。
 *
 * 設計判断: ブラウザから直接 https://msearch.gsi.go.jp を fetchするのではなく、
 * このサーバー側Route Handler経由で行う(問い合わせ元を特定できるUser-Agentを
 * サーバー側で固定して付与するため。GSI側はAPIキー不要だが説明的なUser-Agentを
 * 付けるのが望ましいマナーとして踏襲する)。
 *
 * ジオコーダ変更の経緯(P-012): 当初採用していたNominatim(OpenStreetMap)は
 * 「東京都世田谷区北沢3-31-3」のような日本の番地(丁目-番-号)レベルの住所を
 * ほぼ解決できず(0件)、日本向けには不適切だった。国土地理院(GSI)
 * AddressSearchは同じ住所を正確に解決できるため、主たるジオコーダを
 * GSIに変更する。
 *
 * E2Eテストではこのアプリ自身のエンドポイント(/api/admin/geocode)を
 * Playwrightのpage.routeでインターセプトしてモックする(外部ジオコーディングAPIへの
 * 実ネットワークアクセスに依存しない決定的なテストにするため。
 * e2e/support/geocode-mock.ts参照)。
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

/**
 * 国土地理院(GSI) AddressSearch APIのレスポンス形式(GeoJSON Feature配列)。
 * geometry.coordinates は [経度(lng), 緯度(lat)] の順(GeoJSON順)であり、
 * 一般的な「緯度・経度」の順序とは逆であることに注意する(取り違え注意)。
 */
interface GsiAddressSearchFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    title?: string;
  };
}

/**
 * 問い合わせ元を特定できる説明的なUser-Agentを付与する(GSI・Nominatim共通のマナー)。
 */
const GEOCODE_USER_AGENT = "DaychiCoffeeMap/1.0 (admin geocoding)";

const GSI_NOT_FOUND_ERROR =
  "住所から座標が見つかりませんでした。住所を確認するか、地図をクリックして指定してください";

/**
 * 国土地理院(GSI) AddressSearchで住所をジオコーディングする。
 * 成功時は {lat, lng, displayName} を返す。見つからない場合(空配列)はnullを返し、
 * 通信失敗・応答不正の場合はErrorをthrowする(呼び出し側で502として扱う)。
 */
async function geocodeWithGsi(address: string): Promise<GeocodeSuccessResponse | null> {
  const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;

  let gsiResponse: Response;
  try {
    gsiResponse = await fetch(gsiUrl, {
      headers: { "User-Agent": GEOCODE_USER_AGENT },
    });
  } catch {
    throw new Error("ジオコーディングAPIへの接続に失敗しました");
  }

  if (!gsiResponse.ok) {
    throw new Error(`ジオコーディングAPIがエラーを返しました(status: ${gsiResponse.status})`);
  }

  const features = (await gsiResponse.json()) as GsiAddressSearchFeature[];
  const first = features[0];
  const coordinates = first?.geometry?.coordinates;
  if (coordinates === undefined) {
    return null;
  }

  // GeoJSON順([lng, lat])から {lat, lng} へ変換する(座標順の取り違えに注意)。
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ジオコーディングAPIの応答が不正です");
  }

  return { lat, lng, displayName: first?.properties?.title };
}

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

  let result: GeocodeSuccessResponse | null;
  try {
    result = await geocodeWithGsi(address);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ジオコーディングAPIへの接続に失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (result === null) {
    return NextResponse.json({ error: GSI_NOT_FOUND_ERROR }, { status: 404 });
  }

  return NextResponse.json(result);
}
