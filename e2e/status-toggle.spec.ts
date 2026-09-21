import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク2-6(公開ステータス管理)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」に基づき、shops/videos/visits の
 * 各一覧で draft⇔published を切り替えるトグルボタン(PublishStatusToggle。
 * src/components/admin/PublishStatusToggle.tsx)が、リポジトリのupdateでstatusのみ
 * 更新し、一覧表示に即時反映されることを3画面すべてで検証する。
 *
 * 各テストは(既存のCRUD系specと同様)seedデータの既存draftレコードを書き換えるのではなく、
 * このテスト自身が作成した一意な新規レコードに対して切替操作を行う。これにより
 * 並列実行される他のspec(seedのdraftフィクスチャを参照する可能性がある)や、
 * リトライ時の状態に影響しない。
 *
 * ログイン方式・一意ID生成方式は e2e/videos-crud.spec.ts 等と同様。
 */
const TEST_PASSWORD = "e2e-test-password-123";

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

test.describe("公開ステータス管理(draft⇔published切替)", () => {
  test("動画一覧: draft→published→draftに切り替えると一覧表示が即時反映される", async ({
    page,
  }) => {
    await loginAsAdmin(page, "e2e-status-videos-admin");

    const videoId = uniqueVideoId();
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const title = `【E2Eテスト】ステータス切替動画 ${videoId}`;

    await page.route("**/api/admin/oembed**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ videoId, title }),
      });
    });

    await page.getByRole("link", { name: "動画" }).click();
    await expect(page.getByRole("heading", { name: "動画マスタ" })).toBeVisible();

    await page.getByTestId("video-create-url").fill(youtubeUrl);
    await page.getByTestId("video-create-fetch").click();
    await expect(page.getByTestId("video-create-title")).toHaveValue(title);
    await page.getByTestId("video-create-publishedat").fill("2026-05-01");
    await page.getByRole("button", { name: "作成" }).click();

    const row = page.getByTestId("video-row").filter({ hasText: title });
    await expect(row).toBeVisible();
    const statusCell = row.getByTestId("video-status");
    await expect(statusCell).toHaveText("下書き");
    const toggle = row.getByTestId("video-status-toggle");
    await expect(toggle).toHaveText("公開する");

    // draft → published(タスク2-7: 切替成功時に一時的な成功メッセージが表示される)
    await toggle.click();
    await expect(statusCell).toHaveText("公開");
    await expect(toggle).toHaveText("下書きに戻す");
    await expect(page.getByTestId("video-success")).toContainText("動画を公開しました");

    // published → draft
    await toggle.click();
    await expect(statusCell).toHaveText("下書き");
    await expect(toggle).toHaveText("公開する");
    await expect(page.getByTestId("video-success")).toContainText("動画を下書きに戻しました");

    // 後片付け(削除確認ダイアログ(タスク2-7)で確認する)
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: title })).toHaveCount(0);
  });

  test("店舗一覧: draft→published→draftに切り替えると一覧表示が即時反映される", async ({
    page,
  }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page, "e2e-status-shops-admin");

    const shopId = uniqueTestId("e2e-status-shop");
    const name = `【E2Eテスト】ステータス切替店 ${shopId}`;
    const address = "東京都渋谷区テスト1-1-1";
    await mockGeocode(page, { [address]: { lat: 35.658, lng: 139.7016 } });

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    await page.getByTestId("shop-create-name").fill(name);
    await page.getByTestId("shop-create-address").fill(address);
    await page.getByTestId("shop-create-businesshours").fill("10:00-19:00");
    await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
    await page.getByTestId("shop-create-geocode").click();
    await expect(page.getByTestId("shop-create-location-preview")).toContainText(
      "35.658000, 139.701600",
    );
    await page.getByRole("button", { name: "作成" }).click();

    const row = page.getByTestId("shop-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    const statusCell = row.getByTestId("shop-status");
    await expect(statusCell).toHaveText("下書き");
    const toggle = row.getByTestId("shop-status-toggle");
    await expect(toggle).toHaveText("公開する");

    // draft → published(タスク2-7: 切替成功時に一時的な成功メッセージが表示される)
    await toggle.click();
    await expect(statusCell).toHaveText("公開");
    await expect(toggle).toHaveText("下書きに戻す");
    await expect(page.getByTestId("shop-success")).toContainText("店舗を公開しました");

    // published → draft
    await toggle.click();
    await expect(statusCell).toHaveText("下書き");
    await expect(toggle).toHaveText("公開する");
    await expect(page.getByTestId("shop-success")).toContainText("店舗を下書きに戻しました");

    // 後片付け(削除確認ダイアログ(タスク2-7)で確認する)
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("shop-delete-confirm-confirm").click();
    await expect(page.getByTestId("shop-row").filter({ hasText: name })).toHaveCount(0);
  });

  test("訪問一覧: draft→published→draftに切り替えると一覧表示が即時反映される", async ({
    page,
  }) => {
    await loginAsAdmin(page, "e2e-status-visits-admin");

    const testId = uniqueTestId("e2e-status-visit");
    const item = `【E2Eテスト】${testId}-ブレンドコーヒー`;

    await page.getByRole("link", { name: "訪問" }).click();
    await expect(page.getByRole("heading", { name: "訪問登録" })).toBeVisible();

    const shopSelect = page.getByTestId("visit-create-shop");
    const videoSelect = page.getByTestId("visit-create-video");
    await expect(shopSelect).toContainText("喫茶テスト 公開店");
    await expect(videoSelect).toContainText("公開済み動画");
    await shopSelect.selectOption({ label: "【テスト用】喫茶テスト 公開店" });
    await videoSelect.selectOption({ label: "【テスト用】公開済み動画" });

    await page.getByTestId("visit-create-consumption-addrow").click();
    const createRow = page.getByTestId("visit-create-consumption-row").nth(0);
    await createRow
      .getByTestId("visit-create-consumption-performer")
      .selectOption({ label: "【テスト用】メイン出演者" });
    await createRow.getByTestId("visit-create-consumption-item").nth(0).fill(item);

    await page.getByRole("button", { name: "作成" }).click();

    const row = page.getByTestId("visit-row").filter({ hasText: testId });
    await expect(row).toBeVisible();
    const statusCell = row.getByTestId("visit-status");
    await expect(statusCell).toHaveText("下書き");
    const toggle = row.getByTestId("visit-status-toggle");
    await expect(toggle).toHaveText("公開する");

    // draft → published(タスク2-7: 切替成功時に一時的な成功メッセージが表示される)
    await toggle.click();
    await expect(statusCell).toHaveText("公開");
    await expect(toggle).toHaveText("下書きに戻す");
    await expect(page.getByTestId("visit-success")).toContainText("訪問を公開しました");

    // published → draft
    await toggle.click();
    await expect(statusCell).toHaveText("下書き");
    await expect(toggle).toHaveText("公開する");
    await expect(page.getByTestId("visit-success")).toContainText("訪問を下書きに戻しました");

    // 後片付け(削除確認ダイアログ(タスク2-7)で確認する)
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("visit-delete-confirm-confirm").click();
    await expect(page.getByTestId("visit-row").filter({ hasText: testId })).toHaveCount(0);
  });
});
