import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク4-4(管理画面: 取り込み実行とレビューUI)のE2Eテスト。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」2026-09-23決定に基づき、
 * 「取り込み画面で動画を選択→実行→下書き作成→レビュー画面で修正→承認→
 * 公開ページにピンと詳細が出る」までの一連フローと、承認不可の2ケース
 * (座標未確定店舗・未割り当て出演者)がそれぞれ解消すると承認できるようになることを検証する。
 *
 * 実YouTube Data API・Gemini API・GSIジオコーディングAPIには一切依存しない
 * (決定性・emulator環境で完結させるため):
 * - /api/admin/import/unregistered-videos と /api/admin/import/extract は
 *   page.route でこのアプリ自身のエンドポイントをインターセプトしてモックする
 *   (e2e/videos-crud.spec.tsのoEmbedモックと同じ考え方)
 * - /api/admin/import/extract が返す下書き保存計画(DraftSavePlan)は、
 *   座標未確定(location: null)の店舗1件と、未割り当て出演者2件
 *   (1件は既存出演者への割り当て、もう1件は新規出演者登録で解消する)を含む
 *   ように意図的に設計する
 * - /api/admin/geocode は e2e/support/geocode-mock.ts で既存店舗と重ならない
 *   決定的な座標を返すようモックする
 *
 * Firestoreへの実書き込み(saveDraftExtraction・レビュー画面での各種更新・承認)は
 * すべて実際にAuth/Firestore Emulatorに対して行われる(モックしない)。
 */
const TEST_PASSWORD = "e2e-test-password-123";
/** P-009対応: seed店舗・他タスクのE2Eと重ならない決定的な座標(review-shops-crud等と別値) */
const SHOP_LAT = "35.500000";
const SHOP_LNG = "139.500000";

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

test.describe("AI取り込み→レビュー→承認(タスク4-4)", () => {
  test("取り込み実行→下書き作成→座標未確定/未割り当て出演者を解消して承認→公開ページに表示される", async ({
    page,
  }) => {
    // 地図タイル(admin側のShopLocationPicker・公開ページの両方で使用)は外部依存のためブロックする
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    const testId = uniqueTestId("e2e-import");
    const videoId = uniqueVideoId();
    const videoTitle = `【E2Eテスト】AI取り込み動画 ${testId}`;
    const publishedAt = "2026-03-01T00:00:00+09:00";
    const shopName = `【E2Eテスト】AI取り込み店 ${testId}`;
    const shopAddress = `東京都渋谷区AI取り込みテスト${testId}`;
    const updatedBusinessHours = `【テスト用】7:00-17:00 ${testId}`;
    const performerNameB = `【E2Eテスト】新規出演者 ${testId}`;

    await mockGeocode(page, { [shopAddress]: { lat: Number(SHOP_LAT), lng: Number(SHOP_LNG) } });

    // /api/admin/import/unregistered-videos: 未登録動画として1本だけ返す
    await page.route("**/api/admin/import/unregistered-videos", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ videos: [{ videoId, title: videoTitle, publishedAt }] }),
      });
    });

    // /api/admin/import/extract: 座標未確定の店舗1件+未割り当て出演者2件を含む
    // 下書き保存計画(DraftSavePlan)を返す
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
              addressCandidate: shopAddress,
              location: null,
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
                  items: ["【テスト用】AIブレンド"],
                },
                {
                  performerId: null,
                  performerName: `AI抽出出演者A ${testId}`,
                  items: ["【テスト用】AIラテ"],
                },
                {
                  performerId: null,
                  performerName: performerNameB,
                  items: ["【テスト用】AIエスプレッソ"],
                },
              ],
            },
          ],
        }),
      });
    });

    await loginAsAdmin(page, "e2e-import-admin");

    // 取り込み画面: 未登録動画一覧から対象を選んで実行する
    await page.getByRole("link", { name: "AI取り込み" }).click();
    await expect(page.getByRole("heading", { name: "AI自動抽出の取り込み" })).toBeVisible();

    const importRow = page.getByTestId("import-video-row").filter({ hasText: videoTitle });
    await expect(importRow).toBeVisible();
    await importRow.getByTestId("import-video-checkbox").check();
    await page.getByTestId("import-run").click();

    const resultRow = page.getByTestId("import-result-row").filter({ hasText: videoTitle });
    await expect(resultRow).toHaveAttribute("data-status", "success");
    const reviewLink = resultRow.getByTestId("import-result-link");
    await expect(reviewLink).toBeVisible();
    await reviewLink.click();

    // レビュー画面: 承認不可(座標未確定+未割り当て出演者の両方)であることを確認する
    await expect(page).toHaveURL(new RegExp(`/admin/review/${videoId}$`));
    await expect(page.getByText(videoTitle)).toBeVisible();
    await expect(page.getByTestId("review-approve-button")).toBeDisabled();
    const reasons = page.getByTestId("review-approval-reasons");
    await expect(reasons).toContainText(shopName);
    await expect(reasons).toContainText("座標が未確定です");
    await expect(reasons).toContainText("未割り当ての出演者が残っている訪問が1件あります");

    // 店舗情報を修正する(営業時間・情報基準日)
    // この動画には店舗が1件だけ紐づくため、テストデータの一意性は
    // shopName(店名テキストボックスの値)ではなくカードが1件であることに依拠する
    // (hasTextフィルタは<input>のvalueをテキストとして扱わないため使わない)
    const shopCard = page.getByTestId("review-shop-card");
    await shopCard.getByTestId("review-shop-businesshours").fill(updatedBusinessHours);
    await shopCard.getByTestId("review-shop-infoasof").fill("2026-04-01");
    await shopCard.getByTestId("review-shop-save").click();

    // 座標未確定を解消する: 住所からピンを立てる→この座標で確定する
    await shopCard.getByTestId("review-shop-geocode").click();
    await expect(shopCard.getByTestId("review-shop-location-preview")).toContainText(
      `${SHOP_LAT}, ${SHOP_LNG}`,
    );
    await shopCard.getByTestId("review-shop-confirm-location").click();
    await expect(shopCard.getByTestId("review-shop-warning")).toHaveCount(0);

    // 座標未確定は解消したが、未割り当て出演者はまだ残っているため承認できない
    await expect(page.getByTestId("review-approve-button")).toBeDisabled();
    await expect(page.getByTestId("review-approval-reasons")).not.toContainText("座標が未確定です");
    await expect(page.getByTestId("review-approval-reasons")).toContainText(
      "未割り当ての出演者が残っている訪問が1件あります",
    );

    // 未割り当て出演者1件目: 既存出演者(【テスト用】出演者A)に割り当てる
    // (この動画には訪問が1件だけ紐づくため、店舗カードと同様にカード自体を直接参照する)
    const visitCard = page.getByTestId("review-visit-card");
    const firstUnresolvedRow = visitCard.getByTestId("review-unresolved-row").first();
    await firstUnresolvedRow
      .getByTestId("review-unresolved-select")
      .selectOption({ label: "【テスト用】出演者A" });
    await firstUnresolvedRow.getByTestId("review-unresolved-assign").click();
    await expect(visitCard.getByTestId("review-unresolved-row")).toHaveCount(1);

    // 未割り当て出演者2件目: 新規出演者として登録する
    await visitCard.getByTestId("review-unresolved-row").first().getByTestId("review-unresolved-register").click();
    await expect(visitCard.getByTestId("review-unresolved-row")).toHaveCount(0);

    // すべて解消したので承認できる
    await expect(page.getByTestId("review-approval-reasons")).toHaveCount(0);
    await expect(page.getByTestId("review-approve-button")).toBeEnabled();

    // モバイルビューポートでは画面下部のnext dev専用Issuesインジケーターとページ末尾の
    // 要素が座標上重なることがある(e2e/mobile-ui.spec.tsの「既知の環境要因」と同じ事象。
    // アプリのバグではない)。承認ボタンはこのページの最下部要素であるため、
    // 通常の.click()(座標ヒットテストを伴う)ではなくDOM要素の.click()を直接呼び出す
    await page.getByTestId("review-approve-button").evaluate((element) => {
      (element as HTMLElement).click();
    });
    await expect(page.getByTestId("review-success")).toContainText("承認して公開しました");
    await expect(page.getByTestId("review-already-published")).toBeVisible();
    await expect(page.getByTestId("review-video-status")).toContainText("公開");

    // 公開ページ: ピンと詳細シートに反映されていることを確認する
    const publicResponse = await page.goto("/");
    expect(publicResponse?.ok()).toBe(true);
    const pin = page.locator(`[data-testid="map-pin"][aria-label="${shopName}"]`);
    await expect(pin).toHaveCount(1);
    await expect(pin).toBeVisible();
    // P-009対応: 座標ヒットテストではなくDOM要素へ直接clickを発火させる
    // (e2e/detail-sheet.spec.tsのopenDetailSheetByShopNameと同じ方針)
    await pin.evaluate((element) => {
      (element as HTMLElement).click();
    });

    await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopName);
    await expect(page.getByTestId("detail-sheet-address")).toHaveText(`住所: ${shopAddress}`);
    await expect(page.getByTestId("detail-sheet-business-hours")).toHaveText(
      `営業時間: ${updatedBusinessHours}`,
    );
    await expect(page.getByTestId("detail-sheet-info-as-of")).toHaveText("※2026年4月1日現在");

    const consumptions = page.getByTestId("detail-sheet-consumption");
    await expect(consumptions).toHaveCount(3);
    await expect(consumptions.nth(0)).toContainText("【テスト用】メイン出演者");
    await expect(consumptions.nth(0)).toContainText("【テスト用】AIブレンド");
    await expect(consumptions.nth(1)).toContainText("【テスト用】出演者A");
    await expect(consumptions.nth(1)).toContainText("【テスト用】AIラテ");
    await expect(consumptions.nth(2)).toContainText(performerNameB);
    await expect(consumptions.nth(2)).toContainText("【テスト用】AIエスプレッソ");

    // 後片付け: 管理画面から作成した訪問・動画・店舗・新規出演者をすべて削除する
    await page.getByTestId("detail-sheet-close").click();
    await page.goto("/admin");
    await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();

    await page.getByRole("link", { name: "訪問" }).click();
    const visitRow = page.getByTestId("visit-row").filter({ hasText: videoTitle });
    await expect(visitRow).toBeVisible();
    await visitRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("visit-delete-confirm-confirm").click();
    await expect(page.getByTestId("visit-row").filter({ hasText: videoTitle })).toHaveCount(0);

    await page.getByRole("link", { name: "動画" }).click();
    const videoRow = page.getByTestId("video-row").filter({ hasText: videoTitle });
    await expect(videoRow).toBeVisible();
    await videoRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: videoTitle })).toHaveCount(0);

    await page.getByRole("link", { name: "店舗" }).click();
    const shopRow = page.getByTestId("shop-row").filter({ hasText: shopName });
    await expect(shopRow).toBeVisible();
    await shopRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("shop-delete-confirm-confirm").click();
    await expect(page.getByTestId("shop-row").filter({ hasText: shopName })).toHaveCount(0);

    await page.getByRole("link", { name: "出演者" }).click();
    const performerRow = page.getByTestId("performer-row").filter({ hasText: performerNameB });
    await expect(performerRow).toBeVisible();
    await performerRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("performer-delete-confirm-confirm").click();
    await expect(page.getByTestId("performer-row").filter({ hasText: performerNameB })).toHaveCount(0);
  });
});
