/**
 * tags コレクションのデータアクセス層(タスク5-1: タグマスタCRUD)。
 *
 * 設計方針はperformersリポジトリ(src/repositories/performers.ts)と同様。
 * 読み取りはコンバータ経由(id込み)、書き込みは生コレクション参照に対して行う。
 *
 * 店舗との連携(タグ削除時のカスケード解除)について:
 * requirements.md「3.2 管理画面」2026-09-24決定に基づき、タグを削除する際は
 * そのタグが付いている全店舗(shops.tagIds に array-contains)の tagIds からも
 * 同時に外す。shops コレクションは "shops" というコレクション名を直接参照する
 * (循環import回避のため src/repositories/shops.ts はimportしない)。
 */
import {
  type CollectionReference,
  Timestamp,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { type Tag, type TagData, tagConverter } from "@/types/tag";

const COLLECTION_NAME = "tags";
const SHOPS_COLLECTION_NAME = "shops";

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

/** タグを削除する(店舗からの解除は行わない単純削除。通常は deleteTagAndUnassignFromShops を使う) */
export async function deleteTag(id: string): Promise<void> {
  await deleteDoc(doc(tagsCollectionRef(), id));
}

/** 指定したタグIDが tagIds に含まれる店舗の件数を取得する(status問わず全店舗が対象) */
export async function countShopsWithTag(tagId: string): Promise<number> {
  const shopsQuery = query(
    collection(db, SHOPS_COLLECTION_NAME),
    where("tagIds", "array-contains", tagId),
  );
  const snapshot = await getDocs(shopsQuery);
  return snapshot.size;
}

/**
 * タグを削除し、そのタグが付いている全店舗(status問わず)の tagIds からも同時に外す。
 * 1件のバッチ書き込み(店舗の tagIds 更新 + タグドキュメント削除)にまとめて行う
 * (requirements.md「3.2 管理画面」2026-09-24決定)。
 * 未使用タグ(該当店舗0件)の場合は店舗側の更新なしでタグのみ削除される。
 */
export async function deleteTagAndUnassignFromShops(tagId: string): Promise<void> {
  const shopsQuery = query(
    collection(db, SHOPS_COLLECTION_NAME),
    where("tagIds", "array-contains", tagId),
  );
  const snapshot = await getDocs(shopsQuery);

  const batch = writeBatch(db);
  snapshot.docs.forEach((shopDoc) => {
    batch.update(shopDoc.ref, { tagIds: arrayRemove(tagId), updatedAt: Timestamp.now() });
  });
  batch.delete(doc(tagsCollectionRef(), tagId));

  await batch.commit();
}
