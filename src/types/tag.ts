/**
 * tags/{id} の型定義とFirestoreコンバータ(Phase 5で使用)。
 * requirements.md「4. データモデル」参照。timestampフィールドは持たない。
 */
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from "firebase/firestore";

/** tags/{id} のドキュメント本体(ドキュメントIDを含まない) */
export interface TagData {
  name: string;
  order: number;
}

/** アプリ層で扱うタグ(ドキュメントID込み) */
export interface Tag extends TagData {
  id: string;
}

/** tags コレクション用のFirestoreコンバータ(withConverter用) */
export const tagConverter: FirestoreDataConverter<Tag, TagData> = {
  toFirestore(tag: WithFieldValue<Tag>): WithFieldValue<TagData> {
    return {
      name: tag.name,
      order: tag.order,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
    const data = snapshot.data(options) as TagData;
    return {
      id: snapshot.id,
      name: data.name,
      order: data.order,
    };
  },
};
