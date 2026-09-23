/**
 * 国土地理院(GSI) AddressSearch APIで住所をジオコーディングする共通サーバー関数
 * (タスク2-4d由来。タスク4-3で src/app/api/admin/geocode/route.ts から
 * src/lib 側に切り出し、AI抽出パイプライン(draft保存)からも共用できるようにした)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「ジオコーディング(国土地理院GSI・キー不要、日本の番地に対応)で緯度経度の候補を取得」
 * に対応する。
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない)。
 * src/app/api/admin/geocode/route.ts はこのモジュールの geocodeWithGsi() を呼び出すことで
 * 挙動(URL・User-Agent・エラーメッセージ・GeoJSON座標順の変換)を共用する
 * (route側の認可・HTTPステータス・E2Eは変更しない)。
 */

type FetchLike = typeof fetch;

/** ジオコーディング成功時の結果(緯度経度と、GSI応答由来の表示用住所) */
export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
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

/** geocodeWithGsi に渡せるオプション(すべて省略可能) */
export interface GeocodeWithGsiOptions {
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う */
  fetchImpl?: FetchLike;
}

/**
 * 国土地理院(GSI) AddressSearchで住所をジオコーディングする。
 * 成功時は {lat, lng, displayName} を返す。見つからない場合(空配列)はnullを返し、
 * 通信失敗・応答不正の場合はErrorをthrowする(呼び出し側で502等として扱う)。
 */
export async function geocodeWithGsi(
  address: string,
  options: GeocodeWithGsiOptions = {},
): Promise<GeocodeResult | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;

  let gsiResponse: Response;
  try {
    gsiResponse = await fetchImpl(gsiUrl, {
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

/**
 * GSIの正規化住所(geocodeWithGsiのdisplayName)が番地レベルまで特定できているかを判定する。
 * GSIは番地まで分かる住所では「〜番」「〜番〜号」を含む表記を返すが、町名・丁目止まりの
 * 住所では「番」を含まない(例: 北沢3-31-3→「北沢三丁目３１番３号」(true)、
 * 北沢3丁目→「北沢三丁目」(false)、北沢→「北沢」(false))。
 * requirements.md「5.」下書き保存時の扱い(2026-09-23決定、P-016)の
 * 「正規化住所に「番」を含む場合のみ確定扱い」に対応する。
 */
export function isBanchiLevelAddress(normalizedAddress: string | undefined): boolean {
  return normalizedAddress !== undefined && normalizedAddress.includes("番");
}
