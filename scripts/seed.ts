/**
 * E2E用シードデータ投入スクリプト(タスク1-3: Firebase Emulator Suite設定)。
 *
 * Firebase Emulator Suite の Firestore(localhost:8080)に対して、
 * requirements.md「4. データモデル」に準拠したテストデータを投入する。
 * 事前に `npm run emulator` でエミュレータを起動しておくこと。
 *
 * 冪等性: 全ドキュメントは固定IDに対して setDoc() で上書きするため、
 * 何度実行しても同じ結果になる(重複作成されない)。
 *
 * 型について: タスク1-4(型定義とデータアクセス層)で整備した src/types の正式な型定義
 * ・Firestoreコンバータ(withConverter)を使用する。作成時の入力形(createdAt/updatedAt
 * を除いた形)は src/repositories の各リポジトリが公開する Create*Input 型を再利用する。
 *
 * ダミーデータについて: 出演者名・店名は実在の人物・店舗と無関係な
 * 「テスト用」と分かるダミー名にしている。店舗の緯度経度も東京近辺の
 * architecturally-plausibleな値であり、実店舗の位置とは無関係。
 */
import { initializeApp } from "firebase/app";
import {
  Timestamp,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  setDoc,
} from "firebase/firestore";

import type { CreateShopInput } from "../src/repositories/shops";
import type { CreateVideoInput } from "../src/repositories/videos";
import type { CreateVisitInput } from "../src/repositories/visits";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "../src/lib/firebase-config";
import { type Performer, type PerformerData, performerConverter } from "../src/types/performer";
import { type Shop, shopConverter } from "../src/types/shop";
import { type Video, videoConverter } from "../src/types/video";
import { type Visit, visitConverter } from "../src/types/visit";

// --- シードデータ定義(正式な型定義を使用) ---

type SeedPerformer = PerformerData & { id: string };
type SeedVideo = CreateVideoInput & { id: string };
type SeedShop = CreateShopInput & { id: string };
type SeedVisit = CreateVisitInput & { id: string };

// エミュレータ起動時、実Firebaseプロジェクトの構成値が無くても
// initializeAppが失敗しないためのダミーprojectId
// (firebase-config.tsのフォールバックprojectIdと一致させる)
const SEED_PROJECT_ID = "demo-daychi-coffee-map";

const performers: SeedPerformer[] = [
  {
    id: "performer-test-main",
    name: "【テスト用】メイン出演者",
    isMain: true,
    order: 1,
  },
  {
    id: "performer-test-sub",
    name: "【テスト用】出演者A",
    isMain: false,
    order: 2,
  },
];

const videos: SeedVideo[] = [
  {
    id: "dAyChiTEST1",
    title: "【テスト用】公開済み動画",
    publishedAt: Timestamp.fromDate(new Date("2026-01-10T00:00:00+09:00")),
    status: "published",
  },
  {
    id: "dAyChiTEST2",
    title: "【テスト用】下書き動画",
    publishedAt: Timestamp.fromDate(new Date("2026-02-01T00:00:00+09:00")),
    status: "draft",
  },
];

const shops: SeedShop[] = [
  {
    id: "shop-test-published-01",
    name: "【テスト用】喫茶テスト 公開店",
    address: "東京都千代田区テスト町1-2-3",
    businessHours: "8:00〜20:00(テストデータ)",
    infoAsOf: Timestamp.fromDate(new Date("2026-01-15T00:00:00+09:00")),
    location: { lat: 35.6938, lng: 139.7536 },
    closed: false,
    tagIds: [],
    status: "published",
  },
  {
    id: "shop-test-draft-01",
    name: "【テスト用】喫茶テスト 下書き店",
    address: "東京都新宿区テスト町4-5-6",
    businessHours: "9:00〜18:00(テストデータ)",
    infoAsOf: Timestamp.fromDate(new Date("2026-02-05T00:00:00+09:00")),
    location: { lat: 35.6905, lng: 139.7002 },
    closed: false,
    tagIds: [],
    status: "draft",
  },
];

const visits: SeedVisit[] = [
  {
    // published店舗 × published動画 の組(完了条件で必須)
    id: "visit-test-published-01",
    shopId: "shop-test-published-01",
    videoId: "dAyChiTEST1",
    consumptions: [
      { performerId: "performer-test-main", items: ["【テスト用】ブレンドコーヒー"] },
      {
        performerId: "performer-test-sub",
        items: ["【テスト用】カフェラテ", "【テスト用】チーズケーキ"],
      },
    ],
    status: "published",
  },
  {
    id: "visit-test-draft-01",
    shopId: "shop-test-draft-01",
    videoId: "dAyChiTEST2",
    consumptions: [{ performerId: "performer-test-main", items: ["【テスト用】アイスコーヒー"] }],
    status: "draft",
  },
];

async function seedPerformers(db: ReturnType<typeof getFirestore>): Promise<void> {
  for (const performer of performers) {
    const performerDoc: Performer = {
      id: performer.id,
      name: performer.name,
      isMain: performer.isMain,
      order: performer.order,
    };
    await setDoc(
      doc(db, "performers", performer.id).withConverter(performerConverter),
      performerDoc,
    );
  }
}

async function seedVideos(db: ReturnType<typeof getFirestore>, now: Timestamp): Promise<void> {
  for (const video of videos) {
    const videoDoc: Video = {
      id: video.id,
      title: video.title,
      publishedAt: video.publishedAt,
      status: video.status,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "videos", video.id).withConverter(videoConverter), videoDoc);
  }
}

async function seedShops(db: ReturnType<typeof getFirestore>, now: Timestamp): Promise<void> {
  for (const shop of shops) {
    const shopDoc: Shop = {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      businessHours: shop.businessHours,
      infoAsOf: shop.infoAsOf,
      location: shop.location,
      closed: shop.closed,
      tagIds: shop.tagIds,
      status: shop.status,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "shops", shop.id).withConverter(shopConverter), shopDoc);
  }
}

async function seedVisits(db: ReturnType<typeof getFirestore>, now: Timestamp): Promise<void> {
  for (const visit of visits) {
    const visitDoc: Visit = {
      id: visit.id,
      shopId: visit.shopId,
      videoId: visit.videoId,
      consumptions: visit.consumptions,
      status: visit.status,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "visits", visit.id).withConverter(visitConverter), visitDoc);
  }
}

async function main(): Promise<void> {
  const app = initializeApp({ projectId: SEED_PROJECT_ID });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);

  const now = Timestamp.now();

  await seedPerformers(db);
  await seedVideos(db, now);
  await seedShops(db, now);
  await seedVisits(db, now);

  // CLIスクリプトの実行結果報告のための出力(アプリケーションコードのデバッグログではない)
  console.log(
    `シード投入完了: performers=${performers.length}件, videos=${videos.length}件, shops=${shops.length}件, visits=${visits.length}件`,
  );
}

main().catch((error: unknown) => {
  console.error("シード投入に失敗しました:", error);
  process.exitCode = 1;
});
