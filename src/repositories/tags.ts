/**
 * tags コレクションのデータアクセス層(Phase 5で使用)。
 *
 * 設計方針はperformersリポジトリ(src/repositories/performers.ts)と同様。
 * 読み取りはコンバータ経由(id込み)、書き込みは生コレクション参照に対して行う。
 */
import {
  type CollectionReference,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { type Tag, type TagData, tagConverter } from "@/types/tag";

const COLLECTION_NAME = "tags";

function tagsCollectionRef(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function tagsConvertedCollectionRef(): CollectionReference<Tag, TagData> {
  return tagsCollectionRef().withConverter(tagConverter);
}

/** タグ一覧を取得する */
export async function listTags(): Promise<Tag[]> {
  const snapshot = await getDocs(tagsConvertedCollectionRef());
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** IDを指定してタグを1件取得する。存在しない場合は null */
export async function getTagById(id: string): Promise<Tag | null> {
  const snapshot = await getDoc(doc(tagsConvertedCollectionRef(), id));
  return snapshot.exists() ? snapshot.data() : null;
}

/** タグを新規作成する(IDは自動採番) */
export async function createTag(input: TagData): Promise<Tag> {
  const ref = await addDoc(tagsCollectionRef(), { ...input });
  return { id: ref.id, ...input };
}

/** タグを更新する(指定フィールドのみ) */
export async function updateTag(id: string, input: Partial<TagData>): Promise<void> {
  await updateDoc(doc(tagsCollectionRef(), id), { ...input });
}

/** タグを削除する */
export async function deleteTag(id: string): Promise<void> {
  await deleteDoc(doc(tagsCollectionRef(), id));
}
