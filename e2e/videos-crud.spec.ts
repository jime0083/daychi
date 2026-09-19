import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";

/**
 * タスク2-3(動画登録CRUD)のE2Eテスト。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」videos に基づき、
 * /admin/videos での「URL貼付→動画ID抽出→oEmbedでタイトル自動取得→保存→
 * 一覧にサムネ表示→編集→削除」の一連操作を検証する。
 *
 * oEmbed取得(/api/admin/oembed)は外部API(youtube.com)への依存を持つため、
 * page.route でこのアプリ自身のエンドポイントをインターセプトしてモックする
 * (youtube.com への実ネットワークアクセスに依存しない決定的なテストにするため)。
 * 動画ID抽出そのものの網羅的な検証は src/lib/youtube.test.ts のユニットテストで担保し、
 * ここではE2Eとして「実際にUI上でURLを貼ってから保存に至る一連の流れ」を確認する。
 *
 * ログイン方式は e2e/performers-crud.spec.ts と同様、Auth Emulator REST APIで
 * 作成したadminクレーム付きテストユーザーで「Emulatorテストログイン」フォームから
 * サインインする。
 *
 * seedスクリプト(scripts/seed.ts)が投入する固定IDの動画(dAyChiTEST1 /
 * dAyChiTEST2)は他タスクの検証データとして使われ続けるため、本テストでは
 * 一意な動画IDの新規動画を作成・編集・削除し、seedデータには一切触れない。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-videos-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

/**
 * テスト実行のたびに一意なYouTube動画ID形式(英数字11文字)の文字列を生成する。
 * Date.now()とMath.random()はいずれもbase36変換で [0-9a-z] のみを含むため、
 * そのまま動画ID(src/lib/youtube.ts のVIDEO_ID_PATTERN: [a-zA-Z0-9_-]{11})の
 * 形式に合致する。
 */
function uniqueVideoId(): string {
  const raw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 11).padEnd(11, "0");
}

test.describe("動画登録CRUD(/admin/videos)", () => {
  test("URL貼付→タイトル自動入力→保存→一覧にサムネ表示→編集→削除ができる", async ({ page }) => {
    await loginAsAdmin(page);

    const videoId = uniqueVideoId();
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const title = `【E2Eテスト】動画 ${videoId}`;
    const updatedTitle = `${title}-更新後`;
    const expectedThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // oEmbed取得(/api/admin/oembed)は外部API依存のためモックする
    await page.route("**/api/admin/oembed**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ videoId, title }),
      });
    });

    await page.getByRole("link", { name: "動画" }).click();
    await expect(page.getByRole("heading", { name: "動画マスタ" })).toBeVisible();

    // URL貼付→動画情報を取得(動画ID抽出+oEmbedタイトル自動取得)
    await page.getByTestId("video-create-url").fill(youtubeUrl);
    await page.getByTestId("video-create-fetch").click();

    // サムネイルプレビューとタイトル自動入力を確認
    await expect(page.getByTestId("video-create-thumbnail")).toHaveAttribute(
      "src",
      expectedThumbnailUrl,
    );
    await expect(page.getByTestId("video-create-title")).toHaveValue(title);

    // 公開日は手入力
    await page.getByTestId("video-create-publishedat").fill("2026-05-01");
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: サムネイル・タイトル・ステータス(draftデフォルト)が反映される
    // (タスク2-7: 成功メッセージも表示される)
    const row = page.getByTestId("video-row").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("video-thumbnail")).toHaveAttribute("src", expectedThumbnailUrl);
    await expect(row).toContainText("下書き");
    await expect(page.getByTestId("video-success")).toContainText("動画を作成しました");

    // 編集: タイトルを変更して保存する(タスク2-7: 成功メッセージも表示される)
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("video-edit-title").fill(updatedTitle);
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("video-row").filter({ hasText: updatedTitle });
    await expect(updatedRow).toBeVisible();
    await expect(page.getByTestId("video-success")).toContainText("動画を更新しました");

    // 削除: 確認ダイアログ(タスク2-7)で確認すると一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("video-delete-confirm")).toBeVisible();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: updatedTitle })).toHaveCount(0);
  });

  test("必須項目未入力で作成しようとするとエラーメッセージが表示され作成されない(タスク2-7)", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.getByRole("link", { name: "動画" }).click();
    await expect(page.getByRole("heading", { name: "動画マスタ" })).toBeVisible();

    // 動画情報取得(oEmbed)を一切実行せず、タイトル・公開日も未入力のまま作成する
    await page.getByRole("button", { name: "作成" }).click();

    const errorList = page.getByTestId("video-create-error");
    await expect(errorList).toContainText("先に「動画情報を取得」を実行してください");
    await expect(errorList).toContainText("タイトルを入力してください");
    await expect(errorList).toContainText("公開日を入力してください");
  });

  test("削除確認ダイアログでキャンセルすると削除されない(タスク2-7)", async ({ page }) => {
    await loginAsAdmin(page);

    const videoId = uniqueVideoId();
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const title = `【E2Eテスト】削除キャンセル動画 ${videoId}`;

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

    await row.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("video-delete-confirm")).toBeVisible();
    await page.getByTestId("video-delete-confirm-cancel").click();

    await expect(page.getByTestId("video-delete-confirm")).toHaveCount(0);
    await expect(row).toBeVisible();

    // 後片付け
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("video-delete-confirm-confirm").click();
    await expect(page.getByTestId("video-row").filter({ hasText: title })).toHaveCount(0);
  });
});
