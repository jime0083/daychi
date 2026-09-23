import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";
import type { ShopData } from "@/types/shop";
import type { TagData } from "@/types/tag";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク5-1(タグマスタCRUD)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」tags に基づき、
 * /admin/tags での作成→一覧表示→編集→削除の一連操作、同名タグの重複禁止
 * (前後空白を除いて比較)、使用中タグ削除時の確認ダイアログ(付いている店舗数の表示)
 * と削除時のカスケード解除(全店舗のtagIdsからそのタグを外す)を検証する。
 *
 * ログイン方式は e2e/performers-crud.spec.ts と同様、Auth Emulator REST APIで
 * 作成したadminクレーム付きテストユーザーで「Emulatorテストログイン」フォームから
 * サインインする。
 *
 * 「店舗に付いているタグ」のテストデータ準備について: 店舗編集フォームへの
 * タグ付与UI(タスク5-2)はまだ実装されていないため、店舗×タグの紐付けは
 * scripts/seed.ts / src/lib/firestore-rules.test.ts と同じ @firebase/rules-unit-testing
 * (withSecurityRulesDisabled)でルール判定を経由せず直接Firestoreへ書き込んで用意する
 * (scripts/seed.ts が投入する固定データには一切触れず、このテスト専用の一意なID/名前で
 * 作成・後片付けする)。
 *
 * 【重要】@/repositories/* や @/lib/firebase をこのファイル内で動的import
 * (`await import(...)`)しないこと。Playwrightのモジュール解決はテスト実行前に
 * 静的にimportされたファイルのグラフを前提にしており、テスト本体からのみ動的import
 * された深い依存(例: shops.ts が静的importする @/lib/firebase)の "@/*" パスエイリアスが
 * 解決できず "Cannot find module '@/lib/firebase'" で失敗することを確認済み。
 * そのため直接Firestore操作が必要な箇所は本ファイルのように @firebase/rules-unit-testing を
 * 直接使う(静的importのみで完結する)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

// scripts/seed.ts の SEED_PROJECT_ID / playwright.config.ts の E2E_EMULATOR_PROJECT_ID と
// 一致させる(同じFirestore Emulator名前空間に書き込むため)
const EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-tags-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

async function openTagsPage(page: Page): Promise<void> {
  await page.getByRole("link", { name: "タグ" }).click();
  await expect(page.getByRole("heading", { name: "タグマスタ" })).toBeVisible();
}

test.describe("タグマスタCRUD(/admin/tags)", () => {
  test("作成→一覧表示→編集→削除の一連操作ができる", async ({ page }) => {
    await loginAsAdmin(page);
    await openTagsPage(page);

    const name = `【E2Eテスト】${uniqueTestId("tag")}`;
    const updatedName = `${name}-更新後`;
    const order = "823";

    // 作成: 名前・表示順を入力して作成する
    await page.getByTestId("tag-create-name").fill(name);
    await page.getByTestId("tag-create-order").fill(order);
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 作成したタグが一覧に反映される
    const row = page.getByTestId("tag-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("tag-order")).toHaveText(order);
    await expect(page.getByTestId("tag-success")).toContainText("タグを作成しました");

    // 編集: 名前を変更して保存する
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("tag-edit-name").fill(updatedName);
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("tag-row").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();
    await expect(page.getByTestId("tag-success")).toContainText("タグを更新しました");

    // 削除: 未使用タグの確認ダイアログには店舗数の言及が出ない
    await updatedRow.getByRole("button", { name: "削除" }).click();
    const confirmDialog = page.getByTestId("tag-delete-confirm");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).not.toContainText("件の店舗に付いています");
    await page.getByTestId("tag-delete-confirm-confirm").click();
    await expect(page.getByTestId("tag-row").filter({ hasText: updatedName })).toHaveCount(0);
    await expect(page.getByTestId("tag-success")).toContainText("タグを削除しました");
  });

  test("同じ名前のタグは作成できず、編集での名前変更も他タグと同名にはできない(前後空白を除いて比較)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await openTagsPage(page);

    const baseName = `【E2Eテスト】${uniqueTestId("tag-dup-base")}`;
    const secondName = `【E2Eテスト】${uniqueTestId("tag-dup-second")}`;

    // 1件目を作成
    await page.getByTestId("tag-create-name").fill(baseName);
    await page.getByTestId("tag-create-order").fill("1");
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByTestId("tag-row").filter({ hasText: baseName })).toBeVisible();

    // 前後に空白を付けた同名で作成しようとするとエラーになり作成されない
    await page.getByTestId("tag-create-name").fill(`  ${baseName}  `);
    await page.getByTestId("tag-create-order").fill("2");
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByTestId("tag-create-error")).toContainText(
      "同じ名前のタグが既に存在します",
    );
    await expect(page.getByTestId("tag-row").filter({ hasText: baseName })).toHaveCount(1);

    // 2件目を作成
    await page.getByTestId("tag-create-name").fill(secondName);
    await page.getByTestId("tag-create-order").fill("3");
    await page.getByRole("button", { name: "作成" }).click();
    const secondRow = page.getByTestId("tag-row").filter({ hasText: secondName });
    await expect(secondRow).toBeVisible();

    // 2件目の名前を1件目と同じ名前に変更しようとするとエラーになり保存されない
    await secondRow.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("tag-edit-name").fill(baseName);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByTestId("tag-edit-error")).toContainText(
      "同じ名前のタグが既に存在します",
    );

    // 自分自身と同名のまま(表示順のみ変更)の保存は成功する
    await page.getByTestId("tag-edit-name").fill(secondName);
    await page.getByTestId("tag-edit-order").fill("30");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(
      page.getByTestId("tag-row").filter({ hasText: secondName }).getByTestId("tag-order"),
    ).toHaveText("30");

    // 後片付け
    await page
      .getByTestId("tag-row")
      .filter({ hasText: baseName })
      .getByRole("button", { name: "削除" })
      .click();
    await page.getByTestId("tag-delete-confirm-confirm").click();
    await page
      .getByTestId("tag-row")
      .filter({ hasText: secondName })
      .getByRole("button", { name: "削除" })
      .click();
    await page.getByTestId("tag-delete-confirm-confirm").click();
  });

  test("店舗に付いているタグを削除すると確認ダイアログに店舗数が表示され、削除後は全店舗のtagIdsから外れる", async ({
    page,
  }) => {
    const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
      projectId: EMULATOR_PROJECT_ID,
      firestore: {
        rules: readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
        host: FIRESTORE_EMULATOR_HOST,
        port: FIRESTORE_EMULATOR_PORT,
      },
    });

    const tagId = uniqueTestId("tag-used");
    const tagName = `【E2Eテスト】${tagId}`;
    const shopAId = uniqueTestId("tag-used-shop-a");
    const shopBId = uniqueTestId("tag-used-shop-b");
    const now = Timestamp.now();

    try {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        const tagData: TagData = { name: tagName, order: 500 };
        await setDoc(doc(db, "tags", tagId), tagData);

        const shopBase: Omit<ShopData, "name" | "status"> = {
          address: "東京都渋谷区テスト町1-1-1",
          businessHours: "9:00〜18:00(E2Eテスト)",
          infoAsOf: now,
          location: { lat: 35.61, lng: 139.71 },
          closed: false,
          tagIds: [tagId],
          createdAt: now,
          updatedAt: now,
        };
        const shopAData: ShopData = {
          ...shopBase,
          name: `【E2Eテスト】${shopAId}`,
          status: "published",
        };
        // status問わず(published/draft両方)カウント・解除の対象になることを検証する
        const shopBData: ShopData = {
          ...shopBase,
          name: `【E2Eテスト】${shopBId}`,
          status: "draft",
        };
        await setDoc(doc(db, "shops", shopAId), shopAData);
        await setDoc(doc(db, "shops", shopBId), shopBData);
      });

      await loginAsAdmin(page);
      await openTagsPage(page);

      const row = page.getByTestId("tag-row").filter({ hasText: tagName });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "削除" }).click();

      const confirmDialog = page.getByTestId("tag-delete-confirm");
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog).toContainText("2件の店舗に付いています");

      await page.getByTestId("tag-delete-confirm-confirm").click();
      await expect(page.getByTestId("tag-row").filter({ hasText: tagName })).toHaveCount(0);
      await expect(page.getByTestId("tag-success")).toContainText("タグを削除しました");

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const updatedA = await getDoc(doc(db, "shops", shopAId));
        expect((updatedA.data() as ShopData | undefined)?.tagIds).not.toContain(tagId);
        const updatedB = await getDoc(doc(db, "shops", shopBId));
        expect((updatedB.data() as ShopData | undefined)?.tagIds).not.toContain(tagId);
      });
    } finally {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await Promise.all([
          deleteDoc(doc(db, "shops", shopAId)),
          deleteDoc(doc(db, "shops", shopBId)),
        ]);
      });
      await testEnv.cleanup();
    }
  });
});
