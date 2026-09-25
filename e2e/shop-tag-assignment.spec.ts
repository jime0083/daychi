import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク5-2(店舗へのタグ付与UI)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops.tagIds に基づき、
 * (1) /admin/shops の店舗作成・編集フォームでのタグ付与→保存→再表示での保持、
 * (2) /admin/review/[videoId] の店舗カード(ReviewShopCard)でのタグ付与→保存→
 *     再表示(承認後も含む)での保持
 * をそれぞれ検証する。
 *
 * 使用するタグは scripts/seed.ts が投入する固定タグ tag-test-unused /
 * tag-test-assigned(タスク5-1のE2E用シード)を読み取り専用で参照する
 * (タグ自体のドキュメントは変更しない。選択対象として使うだけ)。
 * このテストが書き込むのは自分で作成した店舗・動画・訪問のみで、
 * 他specが参照する共有店舗(shop-test-published-01等)には一切触れない(P-018参照)。
 * 作成したテスト専用データの後片付けは、テスト本文が途中で失敗しても必ず実行されるよう
 * try/finally内から直接Firestoreを操作する(e2e/admin-import-existing-shop.spec.ts・
 * e2e/tags-crud.spec.tsと同じ方式)。
 *
 * 【重要】@/repositories/* や @/lib/firebase をこのファイル内で動的import
 * (`await import(...)`)しないこと(e2e/tags-crud.spec.tsのコメント参照。
 * "@/*" パスエイリアス解決の制約のため、直接Firestore操作は
 * @firebase/rules-unit-testing を直接使う)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

// scripts/seed.ts の SEED_PROJECT_ID / playwright.config.ts の E2E_EMULATOR_PROJECT_ID と一致
const EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

// scripts/seed.ts が投入する固定タグ(タスク5-1のE2E用シード。読み取り専用で使う)
const TAG_UNUSED_ID = "tag-test-unused";
const TAG_UNUSED_NAME = "【テスト用】タグ(未使用)";
const TAG_ASSIGNED_ID = "tag-test-assigned";
const TAG_ASSIGNED_NAME = "【テスト用】タグ(店舗紐付け)";

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

/**
 * このテストが作成した店舗を名前で検索して削除する(後片付け用)。
 * scripts/seed.ts の固定店舗はここで使う名前と衝突しないユニークな名前
 * (uniqueTestIdベース)を使うため、誤って他データを削除することはない。
 */
async function cleanupShopByName(name: string): Promise<void> {
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
      const shopsSnapshot = await getDocs(query(collection(db, "shops"), where("name", "==", name)));
      await Promise.all(shopsSnapshot.docs.map((shopDoc) => deleteDoc(shopDoc.ref)));
    });
  } finally {
    await testEnv.cleanup();
  }
}

/**
 * このテストが作成した訪問(videoId一致)・動画・店舗(名前一致)を削除する(後片付け用)。
 * scripts/seed.ts が投入する固定データ(shops/tags含む)には一切触れない。
 */
async function cleanupVideoAndShop(videoId: string, shopName: string): Promise<void> {
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
      const shopsSnapshot = await getDocs(
        query(collection(db, "shops"), where("name", "==", shopName)),
      );
      await Promise.all(shopsSnapshot.docs.map((shopDoc) => deleteDoc(shopDoc.ref)));
    });
  } finally {
    await testEnv.cleanup();
  }
}

interface ShopFormTagFlowParams {
  name: string;
  address: string;
}

/** /admin/shops でのタグ付与→保存→一覧/編集フォームでの保持を検証する(後片付けは呼び出し元) */
async function runShopFormTagFlow(page: Page, { name, address }: ShopFormTagFlowParams): Promise<void> {
  await mockGeocode(page, { [address]: { lat: 35.3, lng: 139.3 } });

  await loginAsAdmin(page, "e2e-shop-tags-admin");

  await page.getByRole("link", { name: "店舗" }).click();
  await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

  await page.getByTestId("shop-create-name").fill(name);
  await page.getByTestId("shop-create-address").fill(address);
  await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
  await page.getByTestId("shop-create-geocode").click();
  await expect(page.getByTestId("shop-create-location-preview")).toContainText("35.300000");

  // タグ(未使用)のみを選択して作成する
  await page.getByTestId(`shop-create-tag-checkbox-${TAG_UNUSED_ID}`).check();
  await page.getByRole("button", { name: "作成" }).click();

  const row = page.getByTestId("shop-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("shop-tags")).toHaveText(TAG_UNUSED_NAME);

  // 編集フォームを開くと選択状態(タグ(未使用)のみチェック済み)が復元されている
  await row.getByRole("button", { name: "編集" }).click();
  await expect(page.getByTestId(`shop-edit-tag-checkbox-${TAG_UNUSED_ID}`)).toBeChecked();
  await expect(page.getByTestId(`shop-edit-tag-checkbox-${TAG_ASSIGNED_ID}`)).not.toBeChecked();

  // 選択を変更して保存する(未使用→紐付け用タグに切り替え)
  await page.getByTestId(`shop-edit-tag-checkbox-${TAG_UNUSED_ID}`).uncheck();
  await page.getByTestId(`shop-edit-tag-checkbox-${TAG_ASSIGNED_ID}`).check();
  await page.getByRole("button", { name: "保存" }).click();

  const updatedRow = page.getByTestId("shop-row").filter({ hasText: name });
  await expect(updatedRow.getByTestId("shop-tags")).toHaveText(TAG_ASSIGNED_NAME);

  // ページを再読み込みしても(Firestoreから再取得した)選択状態が保持されている
  await page.reload();
  await page.getByRole("link", { name: "店舗" }).click();
  await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
  const reloadedRow = page.getByTestId("shop-row").filter({ hasText: name });
  await expect(reloadedRow.getByTestId("shop-tags")).toHaveText(TAG_ASSIGNED_NAME);
  await reloadedRow.getByRole("button", { name: "編集" }).click();
  await expect(page.getByTestId(`shop-edit-tag-checkbox-${TAG_ASSIGNED_ID}`)).toBeChecked();
  await expect(page.getByTestId(`shop-edit-tag-checkbox-${TAG_UNUSED_ID}`)).not.toBeChecked();
  await page.getByRole("button", { name: "キャンセル" }).click();
}

interface ReviewShopTagFlowParams {
  videoId: string;
  videoTitle: string;
  publishedAt: string;
  shopName: string;
  itemName: string;
}

/**
 * /admin/review/[videoId] の店舗カードでのタグ付与→保存→再読み込み/承認後の保持を
 * 検証する(後片付けは呼び出し元)。座標確定済み・出演者解決済みの下書き保存計画にし、
 * 座標未確定/未割り当て出演者の解消手順を挟まず直ちにタグ付与→承認まで進められるようにする。
 */
async function runReviewShopTagFlow(
  page: Page,
  { videoId, videoTitle, publishedAt, shopName, itemName }: ReviewShopTagFlowParams,
): Promise<void> {
  await page.route("**/api/admin/import/unregistered-videos", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ videos: [{ videoId, title: videoTitle, publishedAt }] }),
    });
  });

  await page.route("**/api/admin/import/extract", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "draft",
        video: { videoId, title: videoTitle, publishedAt },
        shops: [
          {
            name: shopName,
            addressCandidate: `東京都世田谷区レビュータグ付与テスト${videoId}`,
            location: { lat: 35.4, lng: 139.4 },
            locationConfirmed: true,
            isDuplicate: false,
            existingShopId: null,
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

  await loginAsAdmin(page, "e2e-review-tags-admin");

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

  // 座標確定済み・出演者解決済みのため直ちに承認可能(=承認ブロック要因なし)
  const shopCard = page.getByTestId("review-shop-card");
  await expect(shopCard).toBeVisible();
  await expect(shopCard.getByTestId("review-shop-warning")).toHaveCount(0);

  // タグを選択して保存する(未使用・紐付け用の両方を選ぶ)
  await shopCard.getByTestId(`review-shop-tag-checkbox-${TAG_UNUSED_ID}`).check();
  await shopCard.getByTestId(`review-shop-tag-checkbox-${TAG_ASSIGNED_ID}`).check();
  await shopCard.getByTestId("review-shop-save").click();
  await expect(shopCard.getByTestId("review-shop-error")).toHaveCount(0);

  // ページを再読み込みして(Firestoreから再取得した)選択状態が保持されていることを確認する
  await page.reload();
  const shopCardAfterReload = page.getByTestId("review-shop-card");
  await expect(
    shopCardAfterReload.getByTestId(`review-shop-tag-checkbox-${TAG_UNUSED_ID}`),
  ).toBeChecked();
  await expect(
    shopCardAfterReload.getByTestId(`review-shop-tag-checkbox-${TAG_ASSIGNED_ID}`),
  ).toBeChecked();

  // 承認してもタグの割り当てが書き換えられないことを確認する(承認処理はstatus以外を
  // 更新しない設計。requirements.md「既存published店舗を再利用した訪問はその店舗を
  // 変更しない」と同じ「保存を押した時だけ書き込む」方針)
  await expect(page.getByTestId("review-approval-reasons")).toHaveCount(0);
  await expect(page.getByTestId("review-approve-button")).toBeEnabled();
  await page.getByTestId("review-approve-button").evaluate((element) => {
    (element as HTMLElement).click();
  });
  await expect(page.getByTestId("review-success")).toContainText("承認して公開しました");
  await expect(page.getByTestId("review-video-status")).toContainText("公開");

  await page.reload();
  const shopCardAfterApprove = page.getByTestId("review-shop-card");
  await expect(
    shopCardAfterApprove.getByTestId(`review-shop-tag-checkbox-${TAG_UNUSED_ID}`),
  ).toBeChecked();
  await expect(
    shopCardAfterApprove.getByTestId(`review-shop-tag-checkbox-${TAG_ASSIGNED_ID}`),
  ).toBeChecked();
}

test.describe("店舗へのタグ付与UI(タスク5-2)", () => {
  test("/admin/shops: タグを選択して保存すると一覧・編集フォームで保持される", async ({ page }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    const shopId = uniqueTestId("e2e-shop-tags");
    const name = `【E2Eテスト】タグ付与店 ${shopId}`;
    const address = `東京都渋谷区タグ付与テスト${shopId}`;

    try {
      await runShopFormTagFlow(page, { name, address });
    } finally {
      await cleanupShopByName(name);
    }
  });

  test("/admin/review/[videoId]: 店舗カードでタグを選択して保存すると承認後・再読み込み後も保持される", async ({
    page,
  }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    const testId = uniqueTestId("e2e-review-tags");
    const videoId = uniqueVideoId();
    const videoTitle = `【E2Eテスト】レビュータグ付与動画 ${testId}`;
    const publishedAt = "2026-03-10T00:00:00+09:00";
    const shopName = `【E2Eテスト】レビュータグ付与店 ${testId}`;
    const itemName = `【テスト用】レビュータグ付与メニュー ${testId}`;

    try {
      await runReviewShopTagFlow(page, { videoId, videoTitle, publishedAt, shopName, itemName });
    } finally {
      await cleanupVideoAndShop(videoId, shopName);
    }
  });
});
