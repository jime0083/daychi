/**
 * 詳細シートの「Googleマップで開く」ボタン(タスク6-3・P-021)用の純粋関数群。
 *
 * requirements.md「3.1 公開ページ」詳細シート仕様(2026-09-25決定)に基づき、
 * Google Maps URLs(https://developers.google.com/maps/documentation/urls/get-started)の
 * search アクションで店名+住所を検索語にしたURLを組み立てる。googlePlaceId が
 * 登録されている場合は query_place_id を追加し、確実にその店舗ページを開く。
 *
 * Google Maps Platformの有料API・APIキーは一切使わない(URLを開くだけの静的なリンク生成)。
 */

/** search用のGoogle Maps URLsのベースパス */
const GOOGLE_MAPS_SEARCH_BASE_URL = "https://www.google.com/maps/search/";

/**
 * 店名・住所(・任意のPlace ID)からGoogleマップの検索URLを組み立てる。
 * query は `${name} ${address}` をURLエンコードする(日本語・記号・空白を含む)。
 * placeId が指定されている場合(前後の空白を除いて空文字でない場合)は
 * query_place_id をあわせて付与する。
 */
export function buildGoogleMapsSearchUrl(
  name: string,
  address: string,
  placeId?: string,
): string {
  const query = `${name} ${address}`.trim();
  const params = new URLSearchParams({ api: "1", query });

  const trimmedPlaceId = placeId?.trim() ?? "";
  if (trimmedPlaceId !== "") {
    params.set("query_place_id", trimmedPlaceId);
  }

  return `${GOOGLE_MAPS_SEARCH_BASE_URL}?${params.toString()}`;
}

/**
 * Google公式のPlace ID Finder(店舗管理フォーム・レビュー画面で「Place IDの調べ方」
 * リンクとして案内する。requirements.md「3.2 管理画面」参照)。
 */
export const PLACE_ID_FINDER_URL =
  "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder";
