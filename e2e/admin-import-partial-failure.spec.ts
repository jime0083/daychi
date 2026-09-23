import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク4-4(管理画面: 取り込み実行とレビューUI)レビュー観点3の検証。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」に基づく取り込み実行フローで、
 * 選択した複数動画のうち1本の /api/admin/import/extract が失敗(502)しても、
 * 他の動画の取り込みは続行され、それぞれ独立した成功/失敗として結果表示されることを検証する
 * (src/app/admin/import/page.tsx handleRunImport の for ループ内try/catchに対応)。
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

function uniqueVideoId(): string {
  const raw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 11).padEnd(11, "0");
}

test.describe("AI取り込み: 1本の抽出失敗が他の動画に波及しない(タスク4-4 観点3)", () => {
  test("2本選択し1本目のextractが失敗しても2本目は取り込み成功する", async ({ page }) => {
    const testId = uniqueTestId("e2e-import-partial");
    const failVideoId = uniqueVideoId();
    const okVideoId = uniqueVideoId();
    const failTitle = `【E2Eテスト】取り込み失敗動画 ${testId}`;
    const okTitle = `【E2Eテスト】取り込み成功動画 ${testId}`;
    const publishedAt = "2026-03-10T00:00:00+09:00";

    await page.route("**/api/admin/import/unregistered-videos", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videos: [
            { videoId: failVideoId, title: failTitle, publishedAt },
            { videoId: okVideoId, title: okTitle, publishedAt },
          ],
        }),
      });
    });

    // タスク4-3c(P-015対応): Gemini抽出が動画入力方式になり数十秒かかるようになったため、
    // 取り込み画面に「何本目を処理中か・処理中の動画」の進捗表示(import-progress)が
    // 追加された。本テストでは各動画の処理に意図的な遅延を入れ、その間に進捗表示が
    // 正しい本数目・タイトルで表示されることを決定的に検証する
    async function delay(ms: number): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    await page.route("**/api/admin/import/extract", async (route) => {
      const body = route.request().postDataJSON() as { videoId: string };
      // Playwrightのtoアサーション(toContainText)のポーリング間隔より十分広い進捗表示の
      // 観測ウィンドウを確保するため、意図的に長め(2秒)の遅延を入れる
      await delay(2000);
      if (body.videoId === failVideoId) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "AI抽出処理に失敗しました(E2Eテスト用の意図的な失敗)" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "draft",
          video: { videoId: okVideoId, title: okTitle, publishedAt },
          shops: [],
          visits: [],
        }),
      });
    });

    await loginAsAdmin(page, "e2e-import-partial-admin");

    await page.getByRole("link", { name: "AI取り込み" }).click();
    await expect(page.getByRole("heading", { name: "AI自動抽出の取り込み" })).toBeVisible();

    await page
      .getByTestId("import-video-row")
      .filter({ hasText: failTitle })
      .getByTestId("import-video-checkbox")
      .check();
    await page
      .getByTestId("import-video-row")
      .filter({ hasText: okTitle })
      .getByTestId("import-video-checkbox")
      .check();
    await page.getByTestId("import-run").click();

    // 1本目(失敗する動画)処理中: 進捗表示に「1/2本目」と処理中の動画タイトル、スピナーが出る
    await expect(page.getByTestId("import-progress")).toContainText(`1/2本目を処理中: ${failTitle}`);
    await expect(page.getByTestId("import-progress-spinner")).toBeVisible();
    // 二重実行を防ぐため、処理中は再取得・取り込み実行ボタンがdisabledになる
    await expect(page.getByTestId("import-reload")).toBeDisabled();
    await expect(page.getByTestId("import-run")).toBeDisabled();

    // 2本目(成功する動画)処理中: 進捗表示が切り替わる
    await expect(page.getByTestId("import-progress")).toContainText(`2/2本目を処理中: ${okTitle}`);

    const failResultRow = page.getByTestId("import-result-row").filter({ hasText: failTitle });
    await expect(failResultRow).toHaveAttribute("data-status", "error");
    await expect(failResultRow.getByTestId("import-result-error")).toContainText(
      "E2Eテスト用の意図的な失敗",
    );

    const okResultRow = page.getByTestId("import-result-row").filter({ hasText: okTitle });
    await expect(okResultRow).toHaveAttribute("data-status", "success");
    await expect(okResultRow.getByTestId("import-result-link")).toBeVisible();

    // 完了後は進捗表示が消え、ボタンが再度操作可能になる
    await expect(page.getByTestId("import-progress")).toHaveCount(0);
    await expect(page.getByTestId("import-reload")).toBeEnabled();

    // 成功した動画は実際にFirestoreへdraft保存されている(=1本目の失敗で処理が
    // 中断されず、2本目のsaveDraftExtractionまで実行された証跡)。
    // レビュー画面のリンクから遷移し、下書き動画としてタイトルが表示されることを確認する
    await okResultRow.getByTestId("import-result-link").click();
    await expect(page).toHaveURL(new RegExp(`/admin/review/${okVideoId}$`));
    await expect(page.getByText(okTitle)).toBeVisible();
    await expect(page.getByTestId("review-video-status")).toContainText("下書き");

    // 後片付け: 成功した動画の下書き(店舗・訪問は0件のため動画のみ)を削除する
    await page.getByRole("link", { name: "動画" }).click();
    const videoRow = page.getByTestId("video-row").filter({ hasText: okTitle });
    await expect(videoRow).toBeVisible();
    await videoRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: okTitle })).toHaveCount(0);
  });
});
