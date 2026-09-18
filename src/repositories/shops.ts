/**
 * shops コレクションのデータアクセス層。
 *
 * IDは自動採番(addDoc)。読み取り(list/getById/listPublished)はFirestore
 * コンバータ経由で型付き結果(id込み)を返す。書き込みは生コレクション参照に対して行う
 * (設計方針はsrc/repositories/performers.tsと同様、createdAt/updatedAtの扱いは
 * src/repositories/videos.tsと同様)。
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
import { type Shop, type ShopData, shopConverter } from "@/types/shop";

const COLLECTION_NAME = "shops";

/** 作成時に呼び出し側が指定する入力(createdAt/updatedAtはリポジトリ側で採番) */
export type CreateShopInput = Omit<ShopData, "createdAt" | "updatedAt">;

/** 更新時に呼び出し側が指定できるフィールド(updatedAtはリポジトリ側で更新) */
export type UpdateShopInput = Partial<Omit<ShopData, "createdAt" | "updatedAt">>;

function shopsCollectionRef(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function shopsConvertedCollectionRef(): CollectionReference<Shop, ShopData> {
  return shopsCollectionRef().withConverter(shopConverter);
}

/** 店舗一覧を取得する */
export async function listShops(): Promise<Shop[]> {
  const snapshot = await getDocs(shopsConvertedCollectionRef());
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** status: "published" の店舗のみを取得する(公開ページ用) */
export async function listPublishedShops(): Promise<Shop[]> {
  const publishedQuery = query(shopsConvertedCollectionRef(), where("status", "==", "published"));
  const snapshot = await getDocs(publishedQuery);
  return snapshot.docs.map((docSnapshot) => docSnapshot.data());
}

/** IDを指定して店舗を1件取得する。存在しない場合は null */
export async function getShopById(id: string): Promise<Shop | null> {
  const snapshot = await getDoc(doc(shopsConvertedCollectionRef(), id));
  return snapshot.exists() ? snapshot.data() : null;
}

/** 店舗を新規作成する(IDは自動採番) */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  const now = Timestamp.now();
  const data: ShopData = { ...input, createdAt: now, updatedAt: now };
  const ref = await addDoc(shopsCollectionRef(), data);
  return { id: ref.id, ...data };
}

/** 店舗を更新する(指定フィールドのみ。updatedAtは自動更新) */
export async function updateShop(id: string, input: UpdateShopInput): Promise<void> {
  await updateDoc(doc(shopsCollectionRef(), id), {
    ...input,
    updatedAt: Timestamp.now(),
  });
}

/** 店舗を削除する */
export async function deleteShop(id: string): Promise<void> {
  await deleteDoc(doc(shopsCollectionRef(), id));
}
