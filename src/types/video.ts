/**
 * videos/{videoId} の型定義とFirestoreコンバータ。
 * ドキュメントID = YouTube動画ID(requirements.md「4. データモデル」)。
 */
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
  WithFieldValue,
} from "firebase/firestore";

import type { PublishStatus } from "./common";

/** videos/{videoId} のドキュメント本体(ドキュメントIDを含まない) */
export interface VideoData {
  title: string;
  publishedAt: Timestamp;
  status: PublishStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** アプリ層で扱う動画(ドキュメントID = YouTube動画ID を含む) */
export interface Video extends VideoData {
  id: string;
}

/** videos コレクション用のFirestoreコンバータ(withConverter用) */
export const videoConverter: FirestoreDataConverter<Video, VideoData> = {
  toFirestore(video: WithFieldValue<Video>): WithFieldValue<VideoData> {
    return {
      title: video.title,
      publishedAt: video.publishedAt,
      status: video.status,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions) {
    const data = snapshot.data(options) as VideoData;
    return {
      id: snapshot.id,
      title: data.title,
      publishedAt: data.publishedAt,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};
