/**
 * 全コレクションで共通して使う小さな型定義。
 * requirements.md「4. データモデル」参照。
 */

/**
 * shops / videos / visits が持つ公開ステータス。
 * "draft" のドキュメントは公開ページに一切表示されない(requirements.md 5章)。
 */
export type PublishStatus = "draft" | "published";

/** shops.location(緯度経度) */
export interface GeoLocation {
  lat: number;
  lng: number;
}
