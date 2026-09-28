/**
 * E2E検証専用: Firestore Emulatorのドキュメントをセキュリティルールなしで直接読み取る
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
 * 【P-026対応・2026-09-28】当初はfirebase-admin(`await import("firebase-admin/firestore")`)
 * を使っていたが、フルE2E実行時に約25〜30%の頻度で
 * 「Imported CJS module ... missed cache」(Node.jsのESM/CJS相互運用バグ。
 * firebase-admin内部が@grpc/proto-loader経由でprotobufjsの.jsonをrequire()する箇所で、
 * 動的import()の初回実行タイミング次第でモジュールキャッシュの同期に失敗する)で
 * 失敗することがproblem.txt P-026で判明した。他のspec
 * (e2e/tags-crud.spec.ts、e2e/admin-import-existing-shop.spec.ts、
 * e2e/distant-shop-pin-click.spec.ts等)はfirebase-adminを使わず
 * @firebase/rules-unit-testing(initializeTestEnvironment + withSecurityRulesDisabled)+
 * firebase/firestore(クライアントSDK)の組み合わせで同種のEmulator直接操作を行っており、
 * これらは静的ESM importのみで構成されfirebase-admin(CJS)を経由しないため、
 * 上記のCJS/ESM相互運用バグの影響を受けない。本ファイルも同じ方式に統一する。
 * withSecurityRulesDisabled()はFirestore Emulatorに対して常にセキュリティルールを
 * バイパスする(rules-unit-testingの公式機能)ため、firebase-adminと同様に
 * status(draft/published)に関わらず確実に生データへ到達できる。
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";

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

// テストプロセス(Playwrightワーカー)内で1度だけ初期化する
// (複数テスト・複数回の呼び出しから使われても再初期化しない)
let testEnvPromise: Promise<RulesTestEnvironment> | null = null;

async function getTestEnv(): Promise<RulesTestEnvironment> {
  testEnvPromise ??= (async () => {
    const projectId = await resolveEmulatorProjectId();
    return initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
        host: FIRESTORE_EMULATOR_HOST,
        port: FIRESTORE_EMULATOR_PORT,
      },
    });
  })();
  return testEnvPromise;
}

/**
 * shops コレクションから name が一致する1件の生ドキュメントデータを取得する
 * (セキュリティルールをバイパスするためstatusに関わらず読み取れる。見つからない場合は
 * null)。戻り値はFirestoreのドキュメントデータそのもの(instagramUrlキー自体が
 * 存在するかどうかも `"instagramUrl" in data` で判別できる)。
 */
export async function getShopRawFieldsByName(
  name: string,
): Promise<Record<string, unknown> | null> {
  const testEnv = await getTestEnv();
  // withSecurityRulesDisabled() はコールバックの戻り値を呼び出し元に伝播しない
  // (常にPromise<void>。@firebase/rules-unit-testingの実装がawaitした結果を
  // 破棄する仕様のため)。そのためコールバック外の変数に結果を書き込んで受け取る
  let result: Record<string, unknown> | null = null;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const snapshot = await getDocs(query(collection(db, "shops"), where("name", "==", name)));
    result = snapshot.empty ? null : snapshot.docs[0].data();
  });
  return result;
}
