/**
 * performers/{id} の型定義とFirestoreコンバータ。
 * requirements.md「4. データモデル」参照。timestampフィールドは持たない。
 */
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from "firebase/firestore";

/** performers/{id} のドキュメント本体(ドキュメントIDを含まない) */
export interface PerformerData {
  name: string;
  isMain: boolean;
  order: number;
}

/** アプリ層で扱う出演者(ドキュメントID込み) */
export interface Performer extends PerformerData {
  id: string;
}

/** performers コレクション用のFirestoreコンバータ(withConverter用) */
export const performerConverter: FirestoreDataConverter<Performer, PerformerData> = {
  toFirestore(performer: WithFieldValue<Performer>): WithFieldValue<PerformerData> {
    return {
      name: performer.name,
      isMain: performer.isMain,
      order: performer.order,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
    const data = snapshot.data(options) as PerformerData;
    return {
      id: snapshot.id,
      name: data.name,
      isMain: data.isMain,
      order: data.order,
    };
  },
};
