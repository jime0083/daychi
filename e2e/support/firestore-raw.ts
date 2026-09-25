/**
 * E2E検証専用: Firebase Admin SDK経由でFirestore Emulatorのドキュメントを直接読み取る
 * ヘルパー。クライアントSDK(Firestoreコンバータ)を経由しない生のフィールド値を取得する。
 *
 * タスク6-2(店舗のInstagramリンク、P-020)のレビューで、「編集フォームで空欄にして
 * 保存した後、Firestore上のinstagramUrlフィールドが実際にどうなっているか
 * (キー自体が無い/空文字/古い値が残っている、のどれか)」をUI表示に頼らず直接確認する
 * ために使う。src/types/shop.ts の shopConverter.toFirestore はキー省略の実装だが、
 * 実際の書き込み経路(src/repositories/shops.ts の createShop/updateShop)は
 * このコンバータを経由しない生の CollectionReference に対して行われるため、
 * UI表示だけでは判定できない「実データの状態」をここで直接検証する。
 *
 * Firebase Admin SDKはFirestore Emulatorに接続する際、常にセキュリティルールを
 * バイパスする(公式仕様)ため、REST APIを未認証で叩くよりも確実に生データへ到達できる。
 */
import { enableFirestoreEmulatorEnv } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

/** e2e/support/emulator-auth.ts の resolveEmulatorProjectId と同じロジック */
async function resolveEmulatorProjectId(): Promise<string> {
  enableFirestoreEmulatorEnv();
  const { resolveFirebaseOptions } = await import("@/lib/firebase-config");
  const options = resolveFirebaseOptions();
  if (!options.projectId) {
    throw new Error("Firestore Emulatorへのraw読み取りにはprojectIdの解決が必要です");
  }
  return options.projectId;
}

// テストプロセス内で1度だけ初期化する(複数テストから呼ばれても再初期化しない)
let adminAppPromise: ReturnType<typeof createAdminApp> | null = null;

async function createAdminApp() {
  const projectId = await resolveEmulatorProjectId();
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}`;
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const existing = getApps().find((app) => app.name === "e2e-firestore-raw");
  if (existing) {
    return existing;
  }
  return initializeApp({ projectId }, "e2e-firestore-raw");
}

async function getAdminApp() {
  adminAppPromise ??= createAdminApp();
  return adminAppPromise;
}

/**
 * shops コレクションから name が一致する1件の生ドキュメントデータを取得する
 * (Admin SDK接続のためstatusに関わらず読み取れる。見つからない場合は null)。
 * 戻り値はFirestoreのドキュメントデータそのもの(instagramUrlキー自体が
 * 存在するかどうかも `"instagramUrl" in data` で判別できる)。
 */
export async function getShopRawFieldsByName(
  name: string,
): Promise<Record<string, unknown> | null> {
  const app = await getAdminApp();
  const { getFirestore } = await import("firebase-admin/firestore");
  const snapshot = await getFirestore(app).collection("shops").where("name", "==", name).get();
  if (snapshot.empty) {
    return null;
  }
  return snapshot.docs[0].data();
}
