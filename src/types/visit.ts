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

/**
 * 出演者マスタに登録済みの出演者へ解決できなかった飲食メニュー
 * (visits.unresolvedConsumptions の要素)。AI抽出の下書きのみで発生する。
 */
export interface VisitUnresolvedConsumption {
  performerName: string;
  items: string[];
}

/** visits/{id} のドキュメント本体(ドキュメントIDを含まない) */
export interface VisitData {
  shopId: string;
  videoId: string;
  consumptions: VisitConsumption[];
  /**
   * AI抽出で登録済み出演者に一致しなかった名前の飲食記録(下書きのみ)。
   * レビュー画面で既存出演者に割り当てるか新規登録してconsumptionsへ移すまで
   * 承認(published化)できない(requirements.md 2026-09-23決定)。1件も無い場合は未設定。
   */
  unresolvedConsumptions?: VisitUnresolvedConsumption[];
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
      // Firestoreはundefined値のフィールドを書き込めないため、未設定(unresolvedなし)の
      // 場合はキー自体を含めない。
      ...(visit.unresolvedConsumptions !== undefined
        ? { unresolvedConsumptions: visit.unresolvedConsumptions }
        : {}),
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
      unresolvedConsumptions: data.unresolvedConsumptions,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};
