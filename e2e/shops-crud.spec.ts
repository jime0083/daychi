import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク2-4(店舗登録CRUD・地図ピン位置指定)のE2Eテスト。
 * タスク2-4c(problem.txt P-011対応)で緯度経度の数値入力欄を撤去し、
 * 「住所からピンを立てる」ボタン(/api/admin/geocode)経由の座標指定に変更。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops に基づき、
 * /admin/shops での「フォーム入力(店名・住所・営業時間・情報基準日)→
 * 住所からピンを立てる→保存→一覧表示→編集→削除」の一連操作を検証する。
 *
 * 地図タイル(MapLibre GL + OpenFreeMap)は外部ネットワーク依存であり、
 * E2Eの決定性・速度に影響するため tiles.openfreemap.org へのリクエストは
 * すべてブロックする。座標の確定はアプリ側の設計上、地図クリック/ドラッグにも
 * 依存できるが、本テストでは/api/admin/geocodeをモックして(e2e/support/
 * geocode-mock.ts)決定的に座標を設定する(地図はUI補助という位置づけ。
 * src/components/admin/ShopLocationPicker.tsx のコメント参照)。これにより
 * 地図・外部ジオコーディングAPIが原因でテストがflakyになることを避ける。
 *
 * ログイン方式・一意ID生成方式は e2e/videos-crud.spec.ts と同様。
 */
const TEST_PASSWORD = "e2e-test-password-123";

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `${uniqueTestId("e2e-shops-admin")}@example.com`;
  await createEmulatorTestUser({ email, password: TEST_PASSWORD, admin: true });

  await page.goto("/admin");
  await page.getByTestId("emulator-test-email").fill(email);
  await page.getByTestId("emulator-test-password").fill(TEST_PASSWORD);
  await page.getByTestId("emulator-test-login-submit").click();
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
}

test.describe("店舗登録CRUD(/admin/shops)", () => {
  test("フォーム入力+座標指定→保存→一覧表示→編集→削除ができる", async ({ page }) => {
    // 地図タイル/スタイルへのネットワークリクエストは外部依存のためブロックする
    // (MapLibreの初期化自体は行われるが、タイル取得の成否はこのテストの検証対象外)
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page);

    const shopId = uniqueTestId("e2e-shop");
    const name = `【E2Eテスト】${shopId}`;
    const updatedName = `${name}-更新後`;
    const address = "東京都渋谷区道玄坂1-2-3";
    const updatedAddress = "愛知県名古屋市中村区名駅1-1-1";
    const businessHours = "8:00-18:00(月曜定休)";

    // ジオコード結果は住所文字列ごとに決定的な座標を返すようモックする
    // (実際のNominatimへのネットワークアクセスには依存しない)
    await mockGeocode(page, {
      [address]: { lat: 35.658034, lng: 139.701636 },
      [updatedAddress]: { lat: 35.17, lng: 136.8816 },
    });

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    // フォーム入力: 店名・住所・営業時間・情報基準日→「住所からピンを立てる」で座標を取得
    await page.getByTestId("shop-create-name").fill(name);
    await page.getByTestId("shop-create-address").fill(address);
    await page.getByTestId("shop-create-businesshours").fill(businessHours);
    await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
    await page.getByTestId("shop-create-geocode").click();
    await expect(page.getByTestId("shop-create-location-preview")).toContainText(
      "35.658034, 139.701636",
    );
    await page.getByRole("button", { name: "作成" }).click();

    // 一覧表示: 入力した項目・座標が反映される(ステータスはdraftデフォルト=下書き)
    const row = page.getByTestId("shop-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(address);
    await expect(row).toContainText(businessHours);
    await expect(row).toContainText("2026/5/1");
    await expect(row).toContainText("下書き");
    await expect(row.getByTestId("shop-location")).toHaveText("35.658034, 139.701636");
    // タスク2-7: 作成成功時に一時的な成功メッセージが表示される
    await expect(page.getByTestId("shop-success")).toContainText("店舗を作成しました");

    // 編集: 店名・住所を変更し「住所からピンを立てる」で座標を再取得して保存する
    // (タスク2-7: 成功メッセージも表示される)
    await row.getByRole("button", { name: "編集" }).click();
    await page.getByTestId("shop-edit-name").fill(updatedName);
    await page.getByTestId("shop-edit-address").fill(updatedAddress);
    await page.getByTestId("shop-edit-geocode").click();
    await expect(page.getByTestId("shop-edit-location-preview")).toContainText(
      "35.170000, 136.881600",
    );
    await page.getByRole("button", { name: "保存" }).click();

    const updatedRow = page.getByTestId("shop-row").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.getByTestId("shop-location")).toHaveText("35.170000, 136.881600");
    await expect(page.getByTestId("shop-success")).toContainText("店舗を更新しました");

    // 削除: 確認ダイアログ(タスク2-7)で確認すると一覧から削除される
    await updatedRow.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("shop-delete-confirm")).toBeVisible();
    await page.getByTestId("shop-delete-confirm-confirm").click();
    await expect(page.getByTestId("shop-row").filter({ hasText: updatedName })).toHaveCount(0);
  });

  test("必須項目未入力で作成しようとするとエラーメッセージが表示され作成されない(タスク2-7)", async ({
    page,
  }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page);

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    // 店名・住所・情報基準日を未入力のまま作成する(座標は内部stateのデフォルト値が使われる)
    await page.getByRole("button", { name: "作成" }).click();

    const errorList = page.getByTestId("shop-create-error");
    await expect(errorList).toContainText("店名を入力してください");
    await expect(errorList).toContainText("住所を入力してください");
    await expect(errorList).toContainText("情報基準日を入力してください");
  });

  test("削除確認ダイアログでキャンセルすると削除されない(タスク2-7)", async ({ page }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page);

    const shopId = uniqueTestId("e2e-shop-cancel");
    const name = `【E2Eテスト】削除キャンセル店 ${shopId}`;

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    await page.getByTestId("shop-create-name").fill(name);
    await page.getByTestId("shop-create-address").fill("東京都渋谷区テスト2-2-2");
    await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
    await page.getByRole("button", { name: "作成" }).click();

    const row = page.getByTestId("shop-row").filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("shop-delete-confirm")).toBeVisible();
    await page.getByTestId("shop-delete-confirm-cancel").click();

    await expect(page.getByTestId("shop-delete-confirm")).toHaveCount(0);
    await expect(row).toBeVisible();

    // 後片付け
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("shop-delete-confirm-confirm").click();
    await expect(page.getByTestId("shop-row").filter({ hasText: name })).toHaveCount(0);
  });

  test("ジオコード結果が0件の場合は分かりやすいエラーが表示される(タスク2-4c)", async ({
    page,
  }) => {
    await page.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });

    await loginAsAdmin(page);

    // 何も登録していない住所文字列はmockGeocode側で404(見つからない)として扱われる
    await mockGeocode(page, {});

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    await page.getByTestId("shop-create-address").fill("存在しない架空の住所12345");
    await page.getByTestId("shop-create-geocode").click();

    await expect(page.getByTestId("shop-create-geocode-error")).toContainText(
      "住所から座標が見つかりませんでした",
    );
  });
});
