/**
 * E2E検証専用: Firestore Emulatorへセキュリティルールなしで直接書き込む(作成・削除)
 * ヘルパー(タスク6-3a・P-029対応)。
 *
 * 用途: 出演者フィルタ・タグフィルタの選択肢が多い状態(出演者・タグ各10件程度)を
 * モバイル幅のE2Eで再現するための、多数の performers / tags テストデータの作成・後片付け。
 * 管理画面CRUD UI経由で1件ずつ作成すると、モバイル幅でのUI操作(e2e/performer-filter.spec.ts
 * 等のコメント「管理画面CRUDセットアップの安定性の都合上デスクトップのみで検証する」を参照)が
 * 不安定になりやすく、かつ10件超の作成には時間もかかるため、他spec(P-018の
 * admin-import-existing-shop.spec.ts等)と同様にFirestore Emulatorへの直接書き込みで
 * テストデータを用意する。
 *
 * 実装方針はe2e/support/firestore-raw.tsと同じ(P-026対応:firebase-adminではなく
 * @firebase/rules-unit-testing の withSecurityRulesDisabled() を使う。フルE2E実行時の
 * ESM/CJS相互運用バグ(P-026)を避けるため)。読み取り専用のfirestore-raw.tsとは責務が
 * 異なる(書き込み)ため別ファイルに分ける。
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";

import { enableFirestoreEmulatorEnv } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";
import { performerConverter } from "@/types/performer";
import { tagConverter } from "@/types/tag";

/** e2e/support/firestore-raw.ts の resolveEmulatorProjectId と同じロジック */
async function resolveEmulatorProjectId(): Promise<string> {
  enableFirestoreEmulatorEnv();
  const { resolveFirebaseOptions } = await import("@/lib/firebase-config");
  const options = resolveFirebaseOptions();
  if (!options.projectId) {
    throw new Error("Firestore Emulatorへのraw書き込みにはprojectIdの解決が必要です");
  }
  return options.projectId;
}

// テストプロセス(Playwrightワーカー)内で1度だけ初期化する
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

/** performers/{id} を指定件数分まとめて作成する(冪等: 同じidなら上書き) */
export async function createPerformersRaw(
  performers: { id: string; name: string; isMain: boolean; order: number }[],
): Promise<void> {
  const testEnv = await getTestEnv();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      performers.map(({ id, name, isMain, order }) =>
        setDoc(doc(db, "performers", id).withConverter(performerConverter), {
          id,
          name,
          isMain,
          order,
        }),
      ),
    );
  });
}

/** performers/{id} を指定id分まとめて削除する(後片付け用) */
export async function deletePerformersRaw(ids: string[]): Promise<void> {
  const testEnv = await getTestEnv();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(ids.map((id) => deleteDoc(doc(db, "performers", id))));
  });
}

/** tags/{id} を指定件数分まとめて作成する(冪等: 同じidなら上書き) */
export async function createTagsRaw(
  tags: { id: string; name: string; order: number }[],
): Promise<void> {
  const testEnv = await getTestEnv();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      tags.map(({ id, name, order }) =>
        setDoc(doc(db, "tags", id).withConverter(tagConverter), { id, name, order }),
      ),
    );
  });
}

/** tags/{id} を指定id分まとめて削除する(後片付け用) */
export async function deleteTagsRaw(ids: string[]): Promise<void> {
  const testEnv = await getTestEnv();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(ids.map((id) => deleteDoc(doc(db, "tags", id))));
  });
}
