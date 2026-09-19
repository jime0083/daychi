import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク3-3(サイドバー動画一覧)のE2Eテスト。
 *
 * requirements.md「3.1 公開ページ」の
 * 「左サイドバーに動画一覧(サムネイル + タイトル)。動画をクリックすると、
 *   その動画で紹介された店舗を地図上でフォーカス・ハイライトする」に基づき、
 * - デスクトップ幅でサイドバーに published 動画が公開日降順で表示され、draft動画は
 *   表示されないこと
 * - 動画をクリックすると、その動画で紹介された店舗のピンがハイライトされること
 *   (1動画1店舗、1動画複数店舗の両方のケース)
 * - モバイル幅ではサイドバーが表示されない(地図が全画面のまま)こと
 * を検証する。
 *
 * ハイライトの検証は、地図のflyTo/fitBoundsアニメーション完了やタイル描画結果に
 * 依存せず、PublicMap.tsxが各ピン要素に付与する data-highlighted="true"/"false"
 * 属性(DOM属性)のみで決定的に判定する。
 *
 * 地図タイル(外部ネットワーク依存)はe2e/public-map.spec.ts等と同様ブロックする。
 *
 * 公開日降順・複数店舗ハイライトのケースはseedデータ(1動画=1店舗のみ)だけでは
 * 再現できないため、e2e/detail-sheet.spec.tsと同様にこのテスト自身が管理画面から
 * 一意な店舗・動画・訪問を作成・公開し、検証後に削除する
 * (他タスクのE2Eに影響を与えないため)。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
}

async function loginAsAdmin(page: Page, emailPrefix: string): Promise<void> {
  const email = `${uniqueTestId(emailPrefix)}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

/** e2e/videos-crud.spec.ts と同じ生成ロジック(YouTube動画ID形式に合致させる) */
function uniqueVideoId(): string {
  const raw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 11).padEnd(11, "0");
}

test.describe("サイドバー動画一覧", () => {
  test("モバイル幅ではサイドバーが表示されず地図が全画面のままである", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル限定表示の検証のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();
    await expect(page.getByTestId("video-sidebar")).toBeHidden();
  });

  test("デスクトップでサイドバーにpublished動画が公開日降順で表示され、クリックで該当店舗がハイライト・フォーカスされる", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "管理画面CRUDセットアップの安定性の都合上デスクトップのみで検証する",
    );

    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-sidebar-admin");

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
        body: JSON.stringify({ videoId, title: `【E2Eテスト】サイドバー動画 ${videoId}` }),
      });
    });

    const testId = uniqueTestId("e2e-sidebar");
    const shopAName = `【E2Eテスト】サイドバー店A ${testId}`;
    const shopBName = `【E2Eテスト】サイドバー店B ${testId}`;
    // desktop/mobileプロジェクトが並行実行されるため座標をジッターさせ、
    // ピンのDOM要素が重ならないようにする(e2e/detail-sheet.spec.tsと同方針)
    const shopALat = (35.60 + Math.random() * 0.05).toFixed(6);
    const shopALng = (139.60 + Math.random() * 0.05).toFixed(6);
    const shopBLat = (35.75 + Math.random() * 0.05).toFixed(6);
    const shopBLng = (139.85 + Math.random() * 0.05).toFixed(6);

    /** 店舗を作成し公開する */
    async function createPublishedShop(
      name: string,
      lat: string,
      lng: string,
    ): Promise<void> {
      await page.getByRole("link", { name: "店舗" }).click();
      await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill("東京都テスト区テスト1-1-1");
      await page.getByTestId("shop-create-businesshours").fill("9:00-18:00(テストデータ)");
      await page.getByTestId("shop-create-infoasof").fill("2026-06-01");
      await page.getByTestId("shop-create-lat").fill(lat);
      await page.getByTestId("shop-create-lng").fill(lng);
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
      const title = `【E2Eテスト】サイドバー動画 ${videoId}`;

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
      return { videoId, title };
    }

    /** draft(未公開)動画を作成する(公開ステータス切替は行わない) */
    async function createDraftVideo(publishedAt: string): Promise<{ videoId: string; title: string }> {
      const videoId = uniqueVideoId();
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const title = `【E2Eテスト】サイドバー動画 ${videoId}`;

      await page.getByRole("link", { name: "動画" }).click();
      await expect(page.getByRole("heading", { name: "動画マスタ" })).toBeVisible();
      await page.getByTestId("video-create-url").fill(youtubeUrl);
      await page.getByTestId("video-create-fetch").click();
      await expect(page.getByTestId("video-create-title")).toHaveValue(title);
      await page.getByTestId("video-create-publishedat").fill(publishedAt);
      await page.getByRole("button", { name: "作成" }).click();

      const row = page.getByTestId("video-row").filter({ hasText: title });
      await expect(row).toBeVisible();
      await expect(row.getByTestId("video-status")).toHaveText("下書き");
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
        .fill(`【テスト用】サイドバーテストメニュー ${testId}`);
      await page.getByRole("button", { name: "作成" }).click();

      // 同じ動画(newVideo)がshopA・shopBの2件の訪問を持つケースがあるため、
      // 動画タイトルだけでなく店舗名でも絞り込んで1件に特定する
      const row = page
        .getByTestId("visit-row")
        .filter({ hasText: videoTitle })
        .filter({ hasText: shopName });
      await expect(row).toBeVisible();
      await row.getByTestId("visit-status-toggle").click();
      await expect(row.getByTestId("visit-status")).toHaveText("公開");
    }

    // 店舗A・Bを作成・公開
    await createPublishedShop(shopAName, shopALat, shopALng);
    await createPublishedShop(shopBName, shopBLat, shopBLng);

    // 動画: 古い方(shopAのみ紹介) / 新しい方(shopA・shopB両方を紹介) / draft(表示されないこと確認用)
    const oldVideo = await createPublishedVideo("2026-03-01");
    const newVideo = await createPublishedVideo("2026-07-01");
    const draftVideo = await createDraftVideo("2026-08-01");

    await createPublishedVisit(shopAName, oldVideo.title);
    await createPublishedVisit(shopAName, newVideo.title);
    await createPublishedVisit(shopBName, newVideo.title);

    // --- 公開ページでサイドバーを検証する ---
    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    // draft動画はサイドバーに表示されない
    await expect(
      page.locator('[data-testid="sidebar-video-item"]').filter({ hasText: draftVideo.title }),
    ).toHaveCount(0);

    // 公開日降順: newVideo(2026-07-01) → oldVideo(2026-03-01) →
    // seedのdAyChiTEST1(2026-01-10、【テスト用】公開済み動画)の順で並ぶこと
    const newItem = page.locator(
      `[data-testid="sidebar-video-item"][data-video-id="${newVideo.videoId}"]`,
    );
    const oldItem = page.locator(
      `[data-testid="sidebar-video-item"][data-video-id="${oldVideo.videoId}"]`,
    );
    const seedItem = page.locator('[data-testid="sidebar-video-item"][data-video-id="dAyChiTEST1"]');
    await expect(newItem).toHaveCount(1);
    await expect(oldItem).toHaveCount(1);
    await expect(seedItem).toHaveCount(1);

    const orderedIds = await page
      .getByTestId("sidebar-video-item")
      .evaluateAll((elements) => elements.map((el) => el.getAttribute("data-video-id")));
    const newIndex = orderedIds.indexOf(newVideo.videoId);
    const oldIndex = orderedIds.indexOf(oldVideo.videoId);
    const seedIndex = orderedIds.indexOf("dAyChiTEST1");
    expect(newIndex).toBeGreaterThanOrEqual(0);
    expect(oldIndex).toBeGreaterThan(newIndex);
    expect(seedIndex).toBeGreaterThan(oldIndex);

    // ピンの特定はaria-label(店名)で行う(自動採番IDを事前に知りえないため)
    const pinA = page.locator(`[data-testid="map-pin"][aria-label="${shopAName}"]`);
    const pinB = page.locator(`[data-testid="map-pin"][aria-label="${shopBName}"]`);
    const pinSeed = page.locator(
      '[data-testid="map-pin"][data-shop-id="shop-test-published-01"]',
    );
    await expect(pinA).toHaveCount(1);
    await expect(pinB).toHaveCount(1);

    // 初期状態ではどのピンもハイライトされていない
    await expect(pinA).toHaveAttribute("data-highlighted", "false");
    await expect(pinB).toHaveAttribute("data-highlighted", "false");

    // oldVideo(shopAのみ紹介)をクリック→shopAのみハイライトされる
    await oldItem.click();
    await expect(pinA).toHaveAttribute("data-highlighted", "true");
    await expect(pinB).toHaveAttribute("data-highlighted", "false");
    await expect(oldItem).toHaveAttribute("data-selected", "true");

    // newVideo(shopA・shopB両方を紹介)をクリック→両方ハイライトされる(複数店舗ケース)
    await newItem.click();
    await expect(pinA).toHaveAttribute("data-highlighted", "true");
    await expect(pinB).toHaveAttribute("data-highlighted", "true");
    await expect(newItem).toHaveAttribute("data-selected", "true");
    await expect(oldItem).toHaveAttribute("data-selected", "false");

    // seedの動画(dAyChiTEST1、shop-test-published-01のみ紹介)をクリック→
    // 直前のハイライト(shopA・shopB)が解除され、shop-test-published-01のみハイライトされる
    await seedItem.click();
    await expect(pinSeed).toHaveAttribute("data-highlighted", "true");
    await expect(pinA).toHaveAttribute("data-highlighted", "false");
    await expect(pinB).toHaveAttribute("data-highlighted", "false");

    // --- 後片付け: 管理画面から作成した訪問・動画・店舗をすべて削除する ---
    await page.goto("/admin");
    await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();

    await page.getByRole("link", { name: "訪問" }).click();
    for (const videoTitle of [oldVideo.title, newVideo.title]) {
      for (const row of await page
        .getByTestId("visit-row")
        .filter({ hasText: videoTitle })
        .all()) {
        await row.getByRole("button", { name: "削除" }).click();
        await page.getByTestId("visit-delete-confirm-confirm").click();
      }
    }

    await page.getByRole("link", { name: "動画" }).click();
    for (const video of [oldVideo, newVideo, draftVideo]) {
      const row = page.getByTestId("video-row").filter({ hasText: video.title });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "削除" }).click();
      await page.getByTestId("video-delete-confirm-confirm").click();
      await expect(page.getByTestId("video-row").filter({ hasText: video.title })).toHaveCount(0);
    }

    await page.getByRole("link", { name: "店舗" }).click();
    for (const shopName of [shopAName, shopBName]) {
      const row = page.getByTestId("shop-row").filter({ hasText: shopName });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "削除" }).click();
      await page.getByTestId("shop-delete-confirm-confirm").click();
      await expect(page.getByTestId("shop-row").filter({ hasText: shopName })).toHaveCount(0);
    }
  });
});
