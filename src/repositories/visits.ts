/**
 * visits コレクションのデータアクセス層。
 *
 * IDは自動採番(addDoc)。読み取り(list/getById/listPublished)はFirestore
 * コンバータ経由で型付き結果(id込み)を返す。書き込みは生コレクション参照に対して行う
 * (設計方針・createdAt/updatedAtの扱いはsrc/repositories/shops.tsと同様)。
 */
import {
  type CollectionReference,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { type Visit, type VisitData, visitConverter } from "@/types/visit";

const COLLECTION_NAME = "visits";

/** 作成時に呼び出し側が指定する入力(createdAt/updatedAtはリポジトリ側で採番) */
export type CreateVisitInput = Omit<VisitData, "createdAt" | "updatedAt">;

/** 更新時に呼び出し側が指定できるフィールド(updatedAtはリポジトリ側で更新) */
export type UpdateVisitInput = Partial<Omit<VisitData, "createdAt" | "updatedAt">>;

function visitsCollectionRef(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function visitsConvertedCollectionRef(): CollectionReference<Visit, VisitData> {
  return visitsCollectionRef().withConverter(visitConverter);
}

/** 訪問一覧を取得する */
export async function listVisits(): Promise<Visit[]> {
  const snapshot = await getDocs(visitsConvertedCollectionRef());
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** status: "published" の訪問のみを取得する(公開ページ用) */
export async function listPublishedVisits(): Promise<Visit[]> {
  const publishedQuery = query(
    visitsConvertedCollectionRef(),
    where("status", "==", "published"),
  );
  const snapshot = await getDocs(publishedQuery);
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** IDを指定して訪問を1件取得する。存在しない場合は null */
export async function getVisitById(id: string): Promise<Visit | null> {
  const snapshot = await getDoc(doc(visitsConvertedCollectionRef(), id));
  return snapshot.exists() ? snapshot.data() : null;
}

/** 訪問を新規作成する(IDは自動採番) */
export async function createVisit(input: CreateVisitInput): Promise<Visit> {
  const now = Timestamp.now();
  const data: VisitData = { ...input, createdAt: now, updatedAt: now };
  const ref = await addDoc(visitsCollectionRef(), data);
  return { id: ref.id, ...data };
}

/** 訪問を更新する(指定フィールドのみ。updatedAtは自動更新) */
export async function updateVisit(id: string, input: UpdateVisitInput): Promise<void> {
  await updateDoc(doc(visitsCollectionRef(), id), {
    ...input,
    updatedAt: Timestamp.now(),
  });
}

/** 訪問を削除する */
export async function deleteVisit(id: string): Promise<void> {
  await deleteDoc(doc(visitsCollectionRef(), id));
}
