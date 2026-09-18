/**
 * visits/{id} の型定義とFirestoreコンバータ。
 * 店舗×動画の中間コレクション(requirements.md「4. データモデル」参照)。
 */
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
  WithFieldValue,
} from "firebase/firestore";

import type { PublishStatus } from "./common";

/** 出演者ごとの飲食メニュー(visits.consumptions の要素) */
export interface VisitConsumption {
  performerId: string;
  items: string[];
}

/** visits/{id} のドキュメント本体(ドキュメントIDを含まない) */
export interface VisitData {
  shopId: string;
  videoId: string;
  consumptions: VisitConsumption[];
  status: PublishStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** アプリ層で扱う訪問(ドキュメントID込み) */
export interface Visit extends VisitData {
  id: string;
}

/** visits コレクション用のFirestoreコンバータ(withConverter用) */
export const visitConverter: FirestoreDataConverter<Visit, VisitData> = {
  toFirestore(visit: WithFieldValue<Visit>): WithFieldValue<VisitData> {
    return {
      shopId: visit.shopId,
      videoId: visit.videoId,
      consumptions: visit.consumptions,
      status: visit.status,
      createdAt: visit.createdAt,
      updatedAt: visit.updatedAt,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
    const data = snapshot.data(options) as VisitData;
    return {
      id: snapshot.id,
      shopId: data.shopId,
      videoId: data.videoId,
      consumptions: data.consumptions,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};
