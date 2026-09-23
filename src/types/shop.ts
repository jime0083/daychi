/**
 * shops/{id} の型定義とFirestoreコンバータ。
 * requirements.md「4. データモデル」参照。
 */
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
  WithFieldValue,
} from "firebase/firestore";

import type { GeoLocation, PublishStatus } from "./common";

/** shops/{id} のドキュメント本体(ドキュメントIDを含まない) */
export interface ShopData {
  name: string;
  address: string;
  /** 営業時間(自由記述) */
  businessHours: string;
  /** 住所・営業時間の情報基準日(「※YYYY年M月D日現在」表示に使用) */
  infoAsOf: Timestamp;
  location: GeoLocation;
  /** 閉店フラグ(表示UIは将来拡張) */
  closed: boolean;
  /** Phase 5で使用するタグID一覧 */
  tagIds: string[];
  /**
   * AI抽出の下書きで座標未確定(住所からジオコードできなかった)なら false。
   * 未設定の場合は確定済み扱い。false の間はレビュー画面で管理者がピンを置いて
   * 確定させるまで承認(published化)できない(requirements.md 2026-09-23決定)。
   */
  locationConfirmed?: boolean;
  status: PublishStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** アプリ層で扱う店舗(ドキュメントID込み) */
export interface Shop extends ShopData {
  id: string;
}

/** shops コレクション用のFirestoreコンバータ(withConverter用) */
export const shopConverter: FirestoreDataConverter<Shop, ShopData> = {
  toFirestore(shop: WithFieldValue<Shop>): WithFieldValue<ShopData> {
    return {
      name: shop.name,
      address: shop.address,
      businessHours: shop.businessHours,
      infoAsOf: shop.infoAsOf,
      location: shop.location,
      closed: shop.closed,
      tagIds: shop.tagIds,
      // Firestoreはundefined値のフィールドを書き込めないため、未設定(確定済み扱い)の
      // 場合はキー自体を含めない。
      ...(shop.locationConfirmed !== undefined ? { locationConfirmed: shop.locationConfirmed } : {}),
      status: shop.status,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
    const data = snapshot.data(options) as ShopData;
    return {
      id: snapshot.id,
      name: data.name,
      address: data.address,
      businessHours: data.businessHours,
      infoAsOf: data.infoAsOf,
      location: data.location,
      closed: data.closed,
      tagIds: data.tagIds,
      locationConfirmed: data.locationConfirmed,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};
