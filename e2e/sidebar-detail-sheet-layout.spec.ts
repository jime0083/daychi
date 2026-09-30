import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { skipFirstView } from "./support/first-view";
import { mockGeocode } from "./support/geocode-mock";
import { clickMapPinWithZoom } from "./support/pin-click";

/**
 * タスク6-1(P-019)daychi-review FAIL 1回目(2026-09-25)対応の追加E2E。
 *
 * requirements.md「3.1 公開ページ」の
 * 「PCでは詳細シートと背景の暗転を地図部分(左の動画一覧の右側)の幅だけに表示し、
 *   シートを開いたまま動画一覧をスクロール・クリックできるようにする」(2026-09-25決定)
 * に基づき、動画本数が多い(10件以上)場合でも
 * - PCで動画をクリックして詳細シートを開いたまま、サイドバーの別の動画
 *   (スクロールが必要な下の方の項目を含む)をクリックできること
 * - 詳細シート内の動画リンク(detail-sheet-video-link)もクリックできること
 * - 詳細シートの左端がサイドバーの右端以上の位置にあること(PC)。モバイルでは
 *   従来通り画面全幅であること
 * を検証する(daychi-review FAILの再発防止。既存のe2e/sidebar.spec.ts等は動画3件以下の
 * ケースしか検証しておらず、サイドバーの各アイテムが詳細シートの要素を覆い隠して
 * クリックを奪うリグレッション(evidence: 19-pc-normal-1280x800-overlap-bug.png)を
 * 検出できなかった)。
 *
 * データはこのテスト専用に作成し(shopTop/shopBottom、動画14件)、このテスト内で
 * 完結させる。scripts/seed.tsの共有データ(shop-test-published-01・dAyChiTEST1等)は
 * 変更しない(P-018)。後片付けはUI操作に依存せず、try/finally内から
 * @firebase/rules-unit-testing経由で直接Firestoreを操作する(admin-import-existing-shop.spec.ts
 * と同じ方式。テスト本文がどの段階で失敗しても確実に後片付けできるようにするため)。
 *
 * 地図タイル(外部ネットワーク依存)はe2e/public-map.spec.ts等と同様ブロックする。
 * 詳細シート内の動画リンク(target="_blank"でYouTubeへ実遷移する)をクリックする際は、
 * 実際に外部ネットワーク(youtube.com)へ到達させず、新しいタブが開こうとしたリクエストURLを
 * 捕捉して検証するに留める(実サイトへの依存を避けるため)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

// scripts/seed.ts の SEED_PROJECT_ID / playwright.config.ts の E2E_EMULATOR_PROJECT_ID と
// 一致させる(同じFirestore Emulator名前空間に接続するため)
const EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
  // ファーストビュー(タスク7-2)はこのテストの検証対象外のためスキップする
  await skipFirstView(page);
}

async function loginAsAdmin(page: Page, emailPrefix: string): Promise<void> {
  const email = `${uniqueTestId(emailPrefix)}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("DayChi COFFEE MAP 管理画面")).toBeVisible();
}

/** e2e/sidebar.spec.ts と同じ生成ロジック(YouTube動画ID形式に合致させる) */
function uniqueVideoId(): string {
  const raw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 11).padEnd(11, "0");
}

/**
 * 後片付け: このテストが作成した動画・その動画に紐づく訪問・店舗(名前で特定)を
 * 直接Firestoreから削除する。UI操作に依存しないため、セットアップ・検証がどの段階で
 * 失敗してもtry/finallyから確実に実行できる(admin-import-existing-shop.spec.tsと同じ方式)。
 */
async function cleanupCreatedData(videoIds: string[], shopNames: string[]): Promise<void> {
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

      for (const videoId of videoIds) {
        const visitsSnapshot = await getDocs(
          query(collection(db, "visits"), where("videoId", "==", videoId)),
        );
        await Promise.all(visitsSnapshot.docs.map((visitDoc) => deleteDoc(visitDoc.ref)));
        await deleteDoc(doc(db, "videos", videoId));
      }

      for (const shopName of shopNames) {
        const shopsSnapshot = await getDocs(
          query(collection(db, "shops"), where("name", "==", shopName)),
        );
        await Promise.all(shopsSnapshot.docs.map((shopDoc) => deleteDoc(shopDoc.ref)));
      }
    });
  } finally {
    await testEnv.cleanup();
  }
}

test.describe("PCでの詳細シート幅(サイドバーとの重なり対策、タスク6-1 review FAIL 1回目対応)", () => {
  test("動画14件・詳細シートを開いた状態でも、サイドバーの別動画(スクロール要)とシート内リンクの両方がクリックできる", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "PC(1280x800)でのレイアウト重なり回帰確認のためデスクトッププロジェクトのみで実施する",
    );

    // daychi-reviewの再現条件(1280x800)に合わせる(devices["Desktop Chrome"]既定の
    // viewportとは別に明示指定する)
    await page.setViewportSize({ width: 1280, height: 800 });

    const testId = uniqueTestId("e2e-sidebar-layout");
    const shopTopName = `【E2Eテスト】シート幅店(上) ${testId}`;
    const shopBottomName = `【E2Eテスト】シート幅店(下) ${testId}`;
    const shopTopAddress = `東京都テスト区テスト2-2-2 ${shopTopName}`;
    const shopBottomAddress = `東京都テスト区テスト2-2-2 ${shopBottomName}`;
    const shopTopLat = 35.5 + Math.random() * 0.05;
    const shopTopLng = 139.5 + Math.random() * 0.05;
    const shopBottomLat = 35.85 + Math.random() * 0.05;
    const shopBottomLng = 139.95 + Math.random() * 0.05;

    const videoIds: string[] = [];
    const shopNames = [shopTopName, shopBottomName];

    try {
      await blockMapTiles(page);
      await loginAsAdmin(page, "e2e-sidebar-layout-admin");

      // oEmbedはURLに含まれる動画ID(uniqueVideoIdが埋め込む)から決定的にタイトルを
      // 組み立てて返す1つのハンドラで、複数動画の作成に共通して対応する
      await page.route("**/api/admin/oembed**", async (route) => {
        const requestUrl = new URL(route.request().url());
        const youtubeUrl = requestUrl.searchParams.get("url") ?? "";
        const match = /v=([a-zA-Z0-9_-]{11})/.exec(youtubeUrl);
        const videoId = match ? match[1] : "unknown0000";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ videoId, title: `【E2Eテスト】シート幅動画 ${videoId}` }),
        });
      });

      await mockGeocode(page, {
        [shopTopAddress]: { lat: shopTopLat, lng: shopTopLng },
        [shopBottomAddress]: { lat: shopBottomLat, lng: shopBottomLng },
      });

      /** 店舗を作成し公開する */
      async function createPublishedShop(
        name: string,
        address: string,
        lat: number,
        lng: number,
      ): Promise<void> {
        await page.getByRole("link", { name: "店舗" }).click();
        await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
        await page.getByTestId("shop-create-name").fill(name);
        await page.getByTestId("shop-create-address").fill(address);
        await page.getByTestId("shop-create-businesshours").fill("9:00-18:00(テストデータ)");
        await page.getByTestId("shop-create-infoasof").fill("2026-06-01");
        await page.getByTestId("shop-create-geocode").click();
        await expect(page.getByTestId("shop-create-location-preview")).toContainText(
          `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        );
        await page.getByRole("button", { name: "作成" }).click();
        const row = page.getByTestId("shop-row").filter({ hasText: name });
        await expect(row).toBeVisible();
        await row.getByTestId("shop-status-toggle").click();
        await expect(row.getByTestId("shop-status")).toHaveText("公開");
      }

      /** 動画を作成し公開する(公開日でソート順を制御する) */
      async function createPublishedVideo(
        publishedAt: string,
      ): Promise<{ videoId: string; title: string }> {
        const videoId = uniqueVideoId();
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const title = `【E2Eテスト】シート幅動画 ${videoId}`;

        await page.getByRole("link", { name: "動画" }).click();
        await expect(page.getByRole("heading", { name: "動画マスタ" })).toBeVisible();
        await page.getByTestId("video-create-url").fill(youtubeUrl);
        await page.getByTestId("video-create-fetch").click();
        await expect(page.getByTestId("video-create-title")).toHaveValue(title);
        await page.getByTestId("video-create-publishedat").fill(publishedAt);
        await page.getByRole("button", { name: "作成" }).click();

        const row = page.getByTestId("video-row").filter({ hasText: title });
        await expect(row).toBeVisible();
        await row.getByTestId("video-status-toggle").click();
        await expect(row.getByTestId("video-status")).toHaveText("公開");
        videoIds.push(videoId);
        return { videoId, title };
      }

      /** 作成済みの店舗×動画の訪問を作成し公開する */
      async function createPublishedVisit(shopName: string, videoTitle: string): Promise<void> {
        await page.getByRole("link", { name: "訪問" }).click();
        await expect(page.getByRole("heading", { name: "訪問登録" })).toBeVisible();
        await page.getByTestId("visit-create-shop").selectOption({ label: shopName });
        await page.getByTestId("visit-create-video").selectOption({ label: videoTitle });
        await page.getByTestId("visit-create-consumption-addrow").click();
        const consumptionRow = page.getByTestId("visit-create-consumption-row").nth(0);
        await consumptionRow
          .getByTestId("visit-create-consumption-performer")
          .selectOption({ label: "【テスト用】メイン出演者" });
        await consumptionRow
          .getByTestId("visit-create-consumption-item")
          .nth(0)
          .fill(`【テスト用】シート幅テストメニュー ${testId}`);
        await page.getByRole("button", { name: "作成" }).click();

        const row = page
          .getByTestId("visit-row")
          .filter({ hasText: videoTitle })
          .filter({ hasText: shopName });
        await expect(row).toBeVisible();
        await row.getByTestId("visit-status-toggle").click();
        await expect(row.getByTestId("visit-status")).toHaveText("公開");
      }

      await createPublishedShop(shopTopName, shopTopAddress, shopTopLat, shopTopLng);
      await createPublishedShop(shopBottomName, shopBottomAddress, shopBottomLat, shopBottomLng);

      // videoTop: 公開日を最も新しくし、常にサイドバー上部(スクロール無しで見える位置)に
      // 表示させる。videoBottom: 公開日を最も古くし、常にサイドバー下部(スクロールが
      // 必要な位置)に表示させる。間の12件はリストの高さを稼ぐためのダミー(店舗紐付けなし)
      const videoTop = await createPublishedVideo("2027-06-01");
      for (let i = 0; i < 12; i += 1) {
        await createPublishedVideo(`2024-0${(i % 9) + 1}-01`);
      }
      const videoBottom = await createPublishedVideo("2018-01-01");

      await createPublishedVisit(shopTopName, videoTop.title);
      await createPublishedVisit(shopBottomName, videoBottom.title);

      // --- 公開ページで検証する ---
      await blockMapTiles(page);
      const response = await page.goto("/");
      expect(response?.ok()).toBe(true);

      const topItem = page.locator(
        `[data-testid="sidebar-video-item"][data-video-id="${videoTop.videoId}"]`,
      );
      const bottomItem = page.locator(
        `[data-testid="sidebar-video-item"][data-video-id="${videoBottom.videoId}"]`,
      );
      await expect(topItem).toBeVisible();

      // videoTopをクリックしてshopTopの詳細シートを開く
      await topItem.click();
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopTopName);

      // シートを開いたまま、PCでは詳細シートの左端がサイドバーの右端以上であること
      // (=動画一覧と重ならない。daychi-review FAIL 1回目の再発防止)
      const sidebarBox = await page.getByTestId("video-sidebar").boundingBox();
      const sheetBoxWhileOpen = await page.getByTestId("detail-sheet").boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(sheetBoxWhileOpen).not.toBeNull();
      expect(sheetBoxWhileOpen!.x).toBeGreaterThanOrEqual(
        sidebarBox!.x + sidebarBox!.width - 1,
      );

      // シートを開いたまま、サイドバーの下の方(スクロールが必要)の動画をクリックできる。
      // .click()は対象要素をスクロールコンテナ内で自動的にscrollIntoViewしてからクリックする
      await bottomItem.click();
      await expect(bottomItem).toHaveAttribute("data-selected", "true");
      // クリックが実際にボタン(handleVideoClick)まで届いたことは、詳細シートが
      // shopBottomに切り替わったことでも確認できる(オーバーレイに奪われて閉じるだけなら
      // ここは「シートが閉じたまま」になり、shopBottomのテキストにはならない)
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopBottomName);

      // 詳細シート内の動画リンク(target="_blank")もクリックできる。実際のYouTubeへの
      // 到達は避け、新しいタブが要求したURLを捕捉して検証する
      let capturedYoutubeUrl: string | null = null;
      await context.route("https://www.youtube.com/**", async (route) => {
        capturedYoutubeUrl = route.request().url();
        await route.abort();
      });
      const popupPromise = context.waitForEvent("page");
      await page.getByTestId("detail-sheet-video-link").first().click();
      const popup = await popupPromise;
      await popup.close();
      expect(capturedYoutubeUrl).toContain(`watch?v=${videoBottom.videoId}`);
    } finally {
      await cleanupCreatedData(videoIds, shopNames);
    }
  });

  test("モバイルでは詳細シートが従来通り画面全幅で表示される(左オフセットなし)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル幅でのレイアウト確認のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    const pin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]');
    await expect(pin).toBeVisible();
    // タスク6-1b(P-023再発・P-025)対応: e2e/support/pin-click.ts参照
    await clickMapPinWithZoom(page, pin);
    await expect(page.getByTestId("detail-sheet-shop-name")).toBeVisible();

    const sheetBox = await page.getByTestId("detail-sheet").boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x).toBeLessThanOrEqual(1);
  });
});
