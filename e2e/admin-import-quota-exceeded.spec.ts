import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク4-3e(Gemini利用上限(429)の扱い改善、P-017対応)のE2E検証。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」・progress.txt タスク4-3e(3)の
 * 「取り込み画面で1日上限に達したら残りの選択動画の処理を中止し、その理由を表示する
 * (以降の動画で無駄にリクエストしない)。途中まで成功した動画の結果はそのまま表示」を検証する。
 *
 * /api/admin/import/extract をモックし、1本目=成功、2本目=Gemini1日上限エラー(429 +
 * error.code=GEMINI_DAILY_QUOTA_EXCEEDED)、3本目=成功、の3本を選択して取り込みを実行する。
 * 2本目で処理が中止され、3本目のextractは一切呼ばれないこと・理由(import-quota-exceeded)が
 * 表示されること・1本目の成功結果はそのまま表示され続けることを確認する。
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

test.describe("AI取り込み: Geminiの1日上限に達したら残りの動画の処理を中止する(タスク4-3e, P-017)", () => {
  test("1本目成功→2本目で1日上限→3本目のextractは呼ばれず理由が表示される", async ({ page }) => {
    const testId = uniqueTestId("e2e-import-quota");
    const okVideoId = uniqueVideoId();
    const quotaVideoId = uniqueVideoId();
    const neverVideoId = uniqueVideoId();
    const okTitle = `【E2Eテスト】1本目成功動画 ${testId}`;
    const quotaTitle = `【E2Eテスト】2本目上限動画 ${testId}`;
    const neverTitle = `【E2Eテスト】3本目未実行動画 ${testId}`;
    const publishedAt = "2026-03-10T00:00:00+09:00";
    const quotaMessage =
      "本日のGemini無料枠(1日20回)を使い切りました。日本時間16時ごろ以降に再実行してください";

    const calledVideoIds: string[] = [];

    await page.route("**/api/admin/import/unregistered-videos", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videos: [
            { videoId: okVideoId, title: okTitle, publishedAt },
            { videoId: quotaVideoId, title: quotaTitle, publishedAt },
            { videoId: neverVideoId, title: neverTitle, publishedAt },
          ],
        }),
      });
    });

    await page.route("**/api/admin/import/extract", async (route) => {
      const body = route.request().postDataJSON() as { videoId: string };
      calledVideoIds.push(body.videoId);

      if (body.videoId === okVideoId) {
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
        return;
      }

      if (body.videoId === quotaVideoId) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "GEMINI_DAILY_QUOTA_EXCEEDED", message: quotaMessage },
          }),
        });
        return;
      }

      // neverVideoId が呼ばれた場合はテストの前提が崩れているため、明確に分かる形で失敗させる
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "呼ばれてはいけないリクエストです(3本目)" }),
      });
    });

    await loginAsAdmin(page, "e2e-import-quota-admin");

    await page.getByRole("link", { name: "AI取り込み" }).click();
    await expect(page.getByRole("heading", { name: "AI自動抽出の取り込み" })).toBeVisible();

    await page
      .getByTestId("import-video-row")
      .filter({ hasText: okTitle })
      .getByTestId("import-video-checkbox")
      .check();
    await page
      .getByTestId("import-video-row")
      .filter({ hasText: quotaTitle })
      .getByTestId("import-video-checkbox")
      .check();
    await page
      .getByTestId("import-video-row")
      .filter({ hasText: neverTitle })
      .getByTestId("import-video-checkbox")
      .check();
    await page.getByTestId("import-run").click();

    // 完了(進捗表示が消える)まで待つ
    await expect(page.getByTestId("import-progress")).toHaveCount(0);

    // 1本目(成功)の結果はそのまま表示される
    const okResultRow = page.getByTestId("import-result-row").filter({ hasText: okTitle });
    await expect(okResultRow).toHaveAttribute("data-status", "success");
    await expect(okResultRow.getByTestId("import-result-link")).toBeVisible();

    // 2本目(1日上限)はエラーとして表示される
    const quotaResultRow = page.getByTestId("import-result-row").filter({ hasText: quotaTitle });
    await expect(quotaResultRow).toHaveAttribute("data-status", "error");
    await expect(quotaResultRow.getByTestId("import-result-error")).toContainText("1日20回");

    // 3本目は結果に一切表示されない(処理が中止されたため)
    await expect(page.getByTestId("import-result-row").filter({ hasText: neverTitle })).toHaveCount(0);

    // 理由が目立つ形で表示される
    const quotaBanner = page.getByTestId("import-quota-exceeded");
    await expect(quotaBanner).toBeVisible();
    await expect(quotaBanner).toContainText("Geminiの利用上限");
    await expect(quotaBanner).toContainText(quotaMessage);

    // 3本目のextractは一切呼ばれていない(以降の動画で無駄にリクエストしない)
    expect(calledVideoIds).toEqual([okVideoId, quotaVideoId]);

    // ボタンは再度操作可能に戻る
    await expect(page.getByTestId("import-reload")).toBeEnabled();
    await expect(page.getByTestId("import-run")).toBeDisabled();

    // 後片付け: 成功した1本目の下書き(店舗・訪問は0件のため動画のみ)を削除する
    await page.getByRole("link", { name: "動画" }).click();
    const videoRow = page.getByTestId("video-row").filter({ hasText: okTitle });
    await expect(videoRow).toBeVisible();
    await videoRow.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: okTitle })).toHaveCount(0);
  });
});
