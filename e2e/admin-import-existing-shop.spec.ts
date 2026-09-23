import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク4-4(管理画面: 取り込み実行とレビューUI)レビュー観点4の追加検証。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」「既存published店舗との重複検出」
 * および save-draft.ts の設計(重複検出済みの店舗は新規作成せず既存のexistingShopIdを使い、
 * 既存店舗のフィールドを変更しない)に対応し、
 * 「既存published店舗を再利用した訪問を承認しても、その店舗のフィールドが一切変更されない」
 * ことを確認する。
 *
 * scripts/seed.ts が投入する固定published店舗 shop-test-published-import-01 を
 * DraftSavePlan の isDuplicate:true / existingShopId として指定し、承認後に
 * レビュー画面(reload後、Firestoreから再取得した値を表示する)で店名・住所・営業時間・
 * 情報基準日が seed の値と完全一致することを検証する(=承認処理がこの店舗を更新していない)。
 *
 * タスク5-1a(P-018対応): このテストが承認処理で使う既存店舗は、他のE2E specが訪問件数等を
 * 検証するために参照する共有店舗(shop-test-published-01)ではなく、このテスト専用の
 * shop-test-published-import-01(scripts/seed.ts参照)を使う。理由は、このテストが
 * 「既存店舗に紐づく訪問を承認で新規作成する」という書き込みを行うため、読み取り専用の
 * 前提で訪問件数を厳密に検証する他specとfullyParallel実行時に競合しうるため。
 * さらに、作成した訪問・動画の後片付けはテストの成否に関わらず必ず実行されるよう、
 * UI経由ではなく@firebase/rules-unit-testing(scripts/seed.ts・
 * e2e/tags-crud.spec.tsと同じ方式)でtry/finally内から直接Firestoreを操作する
 * (UI操作に依存すると、テスト本文の途中で失敗した場合に後片付けへ到達できないため)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

// scripts/seed.ts の SEED_PROJECT_ID / playwright.config.ts の E2E_EMULATOR_PROJECT_ID と
// 一致させる(同じFirestore Emulator名前空間に接続するため)
const EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

// scripts/seed.ts のshop-test-published-import-01と完全一致する値(検証対象)
const SEED_SHOP_ID = "shop-test-published-import-01";
const SEED_SHOP_NAME = "【テスト用】喫茶テスト 取込専用公開店";
const SEED_SHOP_ADDRESS = "東京都港区テスト町7-8-9";
const SEED_SHOP_BUSINESS_HOURS = "7:00〜21:00(テストデータ)";
const SEED_SHOP_INFO_AS_OF = "2026-01-20"; // <input type="date"> 表示形式

async function loginAsAdmin(page: Page, emailPrefix: string): Promise<void> {
  const email = `${uniqueTestId(emailPrefix)}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

function uniqueVideoId(): string {
  const raw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 11).padEnd(11, "0");
}

interface ImportExistingShopFlowParams {
  videoId: string;
  videoTitle: string;
  publishedAt: string;
  itemName: string;
}

/** AI取り込み→レビュー→承認の一連のUI操作(検証本体)。後片付けは呼び出し元が行う */
async function runImportExistingShopFlow(
  page: Page,
  { videoId, videoTitle, publishedAt, itemName }: ImportExistingShopFlowParams,
): Promise<void> {
  await page.route("**/api/admin/import/unregistered-videos", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ videos: [{ videoId, title: videoTitle, publishedAt }] }),
    });
  });

  // 既存published店舗(shop-test-published-import-01)を再利用する下書き保存計画。
  // 出演者はseed済みのperformer-test-mainに解決済みとし、unresolvedConsumptionsは無し
  // (承認可否判定に影響させないため)
  await page.route("**/api/admin/import/extract", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "draft",
        video: { videoId, title: videoTitle, publishedAt },
        shops: [
          {
            name: SEED_SHOP_NAME,
            addressCandidate: null,
            location: null,
            isDuplicate: true,
            existingShopId: SEED_SHOP_ID,
          },
        ],
        visits: [
          {
            shopIndex: 0,
            consumptions: [
              {
                performerId: "performer-test-main",
                performerName: "【テスト用】メイン出演者",
                items: [itemName],
              },
            ],
          },
        ],
      }),
    });
  });

  await loginAsAdmin(page, "e2e-import-existing-admin");

  await page.getByRole("link", { name: "AI取り込み" }).click();
  await expect(page.getByRole("heading", { name: "AI自動抽出の取り込み" })).toBeVisible();

  const importRow = page.getByTestId("import-video-row").filter({ hasText: videoTitle });
  await expect(importRow).toBeVisible();
  await importRow.getByTestId("import-video-checkbox").check();
  await page.getByTestId("import-run").click();

  const resultRow = page.getByTestId("import-result-row").filter({ hasText: videoTitle });
  await expect(resultRow).toHaveAttribute("data-status", "success");
  await resultRow.getByTestId("import-result-link").click();

  await expect(page).toHaveURL(new RegExp(`/admin/review/${videoId}$`));

  // 既存published店舗は座標確定済み・出演者も解決済みのため、直ちに承認できる
  // (座標未確定の警告カードUIが出ないこと=locationConfirmed:falseが付与されていないこと)
  const shopCard = page.getByTestId("review-shop-card");
  await expect(shopCard).toBeVisible();
  await expect(shopCard.getByTestId("review-shop-warning")).toHaveCount(0);
  await expect(shopCard.getByTestId("review-shop-name")).toHaveValue(SEED_SHOP_NAME);
  await expect(shopCard.getByTestId("review-shop-address")).toHaveValue(SEED_SHOP_ADDRESS);
  await expect(shopCard.getByTestId("review-shop-businesshours")).toHaveValue(
    SEED_SHOP_BUSINESS_HOURS,
  );
  await expect(shopCard.getByTestId("review-shop-infoasof")).toHaveValue(SEED_SHOP_INFO_AS_OF);

  await expect(page.getByTestId("review-approval-reasons")).toHaveCount(0);
  await expect(page.getByTestId("review-approve-button")).toBeEnabled();

  // モバイルビューポートでは画面下部のnext dev専用Issuesインジケーターとページ末尾の
  // 要素が座標上重なることがある(e2e/admin-import-review.spec.tsと同じ既知の環境要因。
  // アプリのバグではない)。承認ボタンはこのページの最下部要素であるため、
  // 通常の.click()(座標ヒットテストを伴う)ではなくDOM要素の.click()を直接呼び出す
  await page.getByTestId("review-approve-button").evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page.getByTestId("review-success")).toContainText("承認して公開しました");
  await expect(page.getByTestId("review-video-status")).toContainText("公開");

  // 承認処理はreload()でFirestoreから再取得した値を表示する。
  // 既存店舗のフィールドが承認処理によって書き換えられていないことを確認する
  // (save-draft.ts/review page共に既にpublishedの店舗はupdateShopを呼ばない設計)
  const shopCardAfter = page.getByTestId("review-shop-card");
  await expect(shopCardAfter.getByTestId("review-shop-name")).toHaveValue(SEED_SHOP_NAME);
  await expect(shopCardAfter.getByTestId("review-shop-address")).toHaveValue(SEED_SHOP_ADDRESS);
  await expect(shopCardAfter.getByTestId("review-shop-businesshours")).toHaveValue(
    SEED_SHOP_BUSINESS_HOURS,
  );
  await expect(shopCardAfter.getByTestId("review-shop-infoasof")).toHaveValue(
    SEED_SHOP_INFO_AS_OF,
  );
}

/**
 * 後片付け: このテストが作成した訪問・動画のみ直接Firestoreから削除する
 * (既存店舗shop-test-published-import-01は他specから参照されないこのテスト専用の
 * シードデータのため、フィールドは一切変更しない)。
 * UI操作に依存しないため、runImportExistingShopFlow()がどの段階で失敗しても
 * 呼び出し元のtry/finallyから必ず実行できる
 */
async function cleanupCreatedVisitAndVideo(videoId: string): Promise<void> {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: {
      rules: readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const visitsSnapshot = await getDocs(
        query(collection(db, "visits"), where("videoId", "==", videoId)),
      );
      await Promise.all(visitsSnapshot.docs.map((visitDoc) => deleteDoc(visitDoc.ref)));
      await deleteDoc(doc(db, "videos", videoId));
    });
  } finally {
    await testEnv.cleanup();
  }
}

test.describe("AI取り込み: 既存published店舗を再利用する訪問(タスク4-4 観点4)", () => {
  test("既存店舗を再利用して承認しても、その店舗のフィールドは変更されない", async ({ page }) => {
    const testId = uniqueTestId("e2e-import-existing");
    const videoId = uniqueVideoId();
    const videoTitle = `【E2Eテスト】既存店舗再利用動画 ${testId}`;
    const publishedAt = "2026-03-05T00:00:00+09:00";
    const itemName = `【テスト用】既存店舗再利用メニュー ${testId}`;

    try {
      await runImportExistingShopFlow(page, { videoId, videoTitle, publishedAt, itemName });
    } finally {
      await cleanupCreatedVisitAndVideo(videoId);
    }
  });
});
