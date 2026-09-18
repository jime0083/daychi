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
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};
