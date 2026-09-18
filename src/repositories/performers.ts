/**
 * performers コレクションのデータアクセス層。
 *
 * 読み取り(list/getById)はFirestoreコンバータを介して型付き結果(id込み)を返す。
 * 書き込み(create/update/delete)はコンバータなしの生コレクション参照に対して行う
 * (addDoc生成前のドキュメントは id を持たないため、id を必須フィールドとする
 * アプリ型 Performer をそのまま書き込み型として使うと addDoc の型と噛み合わないため)。
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
import { type Performer, type PerformerData, performerConverter } from "@/types/performer";

const COLLECTION_NAME = "performers";

function performersCollectionRef(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function performersConvertedCollectionRef(): CollectionReference<Performer, PerformerData> {
  return performersCollectionRef().withConverter(performerConverter);
}

/** 出演者一覧を取得する */
export async function listPerformers(): Promise<Performer[]> {
  const snapshot = await getDocs(performersConvertedCollectionRef());
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** IDを指定して出演者を1件取得する。存在しない場合は null */
export async function getPerformerById(id: string): Promise<Performer | null> {
  const snapshot = await getDoc(doc(performersConvertedCollectionRef(), id));
  return snapshot.exists() ? snapshot.data() : null;
}

/** 出演者を新規作成する(IDは自動採番) */
export async function createPerformer(input: PerformerData): Promise<Performer> {
  const ref = await addDoc(performersCollectionRef(), { ...input });
  return { id: ref.id, ...input };
}

/** 出演者を更新する(指定フィールドのみ) */
export async function updatePerformer(
  id: string,
  input: Partial<PerformerData>,
): Promise<void> {
  await updateDoc(doc(performersCollectionRef(), id), { ...input });
}

/** 出演者を削除する */
export async function deletePerformer(id: string): Promise<void> {
  await deleteDoc(doc(performersCollectionRef(), id));
}
