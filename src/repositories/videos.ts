/**
 * videos コレクションのデータアクセス層。
 *
 * ドキュメントID = YouTube動画ID(requirements.md「4. データモデル」)のため、
 * 作成時はID自動採番のaddDocではなく、呼び出し側が指定したIDでsetDocする。
 *
 * 読み取り(list/getById/listPublished)はFirestoreコンバータ経由で型付き結果
 * (id込み)を返す。書き込み(create/update/delete)は生コレクション参照に対して行う。
 */
import {
  type CollectionReference,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { type Video, type VideoData, videoConverter } from "@/types/video";

const COLLECTION_NAME = "videos";

/** 作成時に呼び出し側が指定する入力(createdAt/updatedAtはリポジトリ側で採番) */
export type CreateVideoInput = Omit<VideoData, "createdAt" | "updatedAt">;

/** 更新時に呼び出し側が指定できるフィールド(updatedAtはリポジトリ側で更新) */
export type UpdateVideoInput = Partial<Omit<VideoData, "createdAt" | "updatedAt">>;

function videosCollectionRef(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function videosConvertedCollectionRef(): CollectionReference<Video, VideoData> {
  return videosCollectionRef().withConverter(videoConverter);
}

/** 動画一覧を取得する */
export async function listVideos(): Promise<Video[]> {
  const snapshot = await getDocs(videosConvertedCollectionRef());
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** status: "published" の動画のみを取得する(公開ページ用) */
export async function listPublishedVideos(): Promise<Video[]> {
  const publishedQuery = query(
    videosConvertedCollectionRef(),
    where("status", "==", "published"),
  );
  const snapshot = await getDocs(publishedQuery);
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** YouTube動画IDを指定して動画を1件取得する。存在しない場合は null */
export async function getVideoById(videoId: string): Promise<Video | null> {
  const snapshot = await getDoc(doc(videosConvertedCollectionRef(), videoId));
  return snapshot.exists() ? snapshot.data() : null;
}

/** 動画を新規作成する(ドキュメントID = 呼び出し側が指定するYouTube動画ID) */
export async function createVideo(videoId: string, input: CreateVideoInput): Promise<Video> {
  const now = Timestamp.now();
  const data: VideoData = { ...input, createdAt: now, updatedAt: now };
  await setDoc(doc(videosCollectionRef(), videoId), data);
  return { id: videoId, ...data };
}

/** 動画を更新する(指定フィールドのみ。updatedAtは自動更新) */
export async function updateVideo(videoId: string, input: UpdateVideoInput): Promise<void> {
  await updateDoc(doc(videosCollectionRef(), videoId), {
    ...input,
    updatedAt: Timestamp.now(),
  });
}

/** 動画を削除する */
export async function deleteVideo(videoId: string): Promise<void> {
  await deleteDoc(doc(videosCollectionRef(), videoId));
}
