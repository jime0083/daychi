/**
 * firestore.rules(本番Firestoreセキュリティルール)のルールテスト。
 * requirements.md「4. データモデル」セキュリティルール方針/progress.txt タスク1-5参照。
 *
 * 【重要】このテストは @firebase/rules-unit-testing 経由でFirestore Emulator
 * (localhost:8080)へ接続する。事前に `npm run emulator` でエミュレータを
 * 起動してから `npm run test` を実行すること。エミュレータ未起動の場合、
 * このスイートは自動的にskipされる(コマンド自体は失敗しない)。
 *
 * リポジトリテスト(src/repositories/*.test.ts)とはFirestore Emulator上で
 * 別のprojectId(RULES_TEST_PROJECT_ID)を使うことで、データの干渉を避けている
 * (Firestore Emulatorは複数projectIdを同時にホストできるため、全ドキュメント削除を
 * 伴う clearFirestore() を使わずに済む)。
 */
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isFirestoreEmulatorAvailable, uniqueTestId } from "@/repositories/test-support";

import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "./firebase-config";

const RULES_TEST_PROJECT_ID = "demo-daychi-coffee-map-rules-test";
const ADMIN_TOKEN = { admin: true };

const emulatorAvailable = await isFirestoreEmulatorAvailable();

describe.skipIf(!emulatorAvailable)("firestore.rules(本番セキュリティルール)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: RULES_TEST_PROJECT_ID,
      firestore: {
        rules: readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
        host: FIRESTORE_EMULATOR_HOST,
        port: FIRESTORE_EMULATOR_PORT,
      },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  /** ルール判定を経由せず(withSecurityRulesDisabled)テスト用ドキュメントを準備する */
  async function seedDoc(
    collectionName: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), collectionName, id), data);
    });
  }

  describe.each(["videos", "shops", "visits"])(
    "%s (status: draft | published を持つコレクション)",
    (collectionName) => {
      it("未認証ユーザーはpublishedドキュメントをreadできる", async () => {
        const id = uniqueTestId(`${collectionName}-published`);
        await seedDoc(collectionName, id, { status: "published" });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(unauthedDb, collectionName, id)));
      });

      it("未認証ユーザーはdraftドキュメントをreadできない", async () => {
        const id = uniqueTestId(`${collectionName}-draft`);
        await seedDoc(collectionName, id, { status: "draft" });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(unauthedDb, collectionName, id)));
      });

      it("未認証ユーザーはwriteできない(create)", async () => {
        const id = uniqueTestId(`${collectionName}-write-unauth`);
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        await assertFails(setDoc(doc(unauthedDb, collectionName, id), { status: "published" }));
      });

      it("認証済みだが管理者でないユーザーはdraftドキュメントをreadできない", async () => {
        const id = uniqueTestId(`${collectionName}-draft-nonadmin`);
        await seedDoc(collectionName, id, { status: "draft" });

        const nonAdminDb = testEnv.authenticatedContext("non-admin-user").firestore();
        await assertFails(getDoc(doc(nonAdminDb, collectionName, id)));
      });

      it("認証済みだが管理者でないユーザーはpublishedドキュメントはreadできる", async () => {
        const id = uniqueTestId(`${collectionName}-published-nonadmin`);
        await seedDoc(collectionName, id, { status: "published" });

        const nonAdminDb = testEnv.authenticatedContext("non-admin-user").firestore();
        await assertSucceeds(getDoc(doc(nonAdminDb, collectionName, id)));
      });

      it("認証済みだが管理者でないユーザーはwriteできない", async () => {
        const id = uniqueTestId(`${collectionName}-write-nonadmin`);
        const nonAdminDb = testEnv.authenticatedContext("non-admin-user").firestore();

        await assertFails(setDoc(doc(nonAdminDb, collectionName, id), { status: "published" }));
      });

      it("管理者はdraftドキュメントをreadできる", async () => {
        const id = uniqueTestId(`${collectionName}-draft-admin`);
        await seedDoc(collectionName, id, { status: "draft" });

        const adminDb = testEnv.authenticatedContext("admin-user", ADMIN_TOKEN).firestore();
        await assertSucceeds(getDoc(doc(adminDb, collectionName, id)));
      });

      it("管理者はcreate/update/deleteのすべてができる", async () => {
        const id = uniqueTestId(`${collectionName}-write-admin`);
        const adminDb = testEnv.authenticatedContext("admin-user", ADMIN_TOKEN).firestore();

        await assertSucceeds(setDoc(doc(adminDb, collectionName, id), { status: "draft" }));
        await assertSucceeds(updateDoc(doc(adminDb, collectionName, id), { status: "published" }));

        const updated = await getDoc(doc(adminDb, collectionName, id));
        expect(updated.data()?.status).toBe("published");

        await assertSucceeds(deleteDoc(doc(adminDb, collectionName, id)));
      });
    },
  );

  describe.each(["performers", "tags"])(
    "%s (ステータスを持たず常にread可能なマスタコレクション)",
    (collectionName) => {
      it("未認証ユーザーでもreadできる", async () => {
        const id = uniqueTestId(`${collectionName}-read-unauth`);
        await seedDoc(collectionName, id, { name: "【テスト用】ルールテスト", order: 1 });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(unauthedDb, collectionName, id)));
      });

      it("未認証ユーザーはwriteできない", async () => {
        const id = uniqueTestId(`${collectionName}-write-unauth`);
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        await assertFails(
          setDoc(doc(unauthedDb, collectionName, id), { name: "【テスト用】", order: 1 }),
        );
      });

      it("認証済みだが管理者でないユーザーはwriteできない", async () => {
        const id = uniqueTestId(`${collectionName}-write-nonadmin`);
        const nonAdminDb = testEnv.authenticatedContext("non-admin-user").firestore();

        await assertFails(
          setDoc(doc(nonAdminDb, collectionName, id), { name: "【テスト用】", order: 1 }),
        );
      });

      it("管理者はcreate/update/deleteのすべてができる", async () => {
        const id = uniqueTestId(`${collectionName}-write-admin`);
        const adminDb = testEnv.authenticatedContext("admin-user", ADMIN_TOKEN).firestore();

        await assertSucceeds(
          setDoc(doc(adminDb, collectionName, id), { name: "【テスト用】", order: 1 }),
        );
        await assertSucceeds(updateDoc(doc(adminDb, collectionName, id), { order: 2 }));
        await assertSucceeds(deleteDoc(doc(adminDb, collectionName, id)));
      });
    },
  );
});
