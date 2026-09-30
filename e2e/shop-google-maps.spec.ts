import { expect, test, type Page } from "@playwright/test";

import { buildGoogleMapsSearchUrl } from "@/lib/google-maps";
import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { getShopRawFieldsByName } from "./support/firestore-raw";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク6-3(「Googleマップで開く」ボタン・Place ID・営業時間空欄時の案内、P-021)のE2Eテスト。
 *
 * requirements.md「4. データモデル」shops.googlePlaceId と「3.1 公開ページ」詳細シート
 * (店舗情報欄の下部にGoogleマップで開くボタンを表示する、営業時間空欄時の案内、
 * 2026-09-25決定)に基づき、以下を検証する:
 * 1. 店舗管理画面(/admin/shops)の作成・編集フォームでGoogle Place IDを登録・保存でき、
 *    再表示(編集フォームを開き直す)しても保持される。英数字・ハイフン・アンダースコア
 *    以外を含む値はエラーになり保存されない。空欄にして保存すると実際に消える
 * 2. AI取り込みレビュー画面(ReviewShopCard、「店舗情報を保存」)でも同様に登録・保持・
 *    不正値エラーができる
 * 3. 公開ページの詳細シートで「Googleマップで開く」ボタンが常に表示され、
 *    店名+住所(+登録されていればquery_place_id)を検索語にしたURLを新しいタブ
 *    (target="_blank", rel="noopener noreferrer")で開く。日本語(店名・住所)が
 *    正しくURLエンコードされる
 * 4. 営業時間(businessHours)が空欄(空白のみ含む)の店舗は、詳細シートの営業時間欄に
 *    「Googleマップでご確認ください」と表示される。入力ありの店舗は従来通りその内容が
 *    表示される
 *
 * 地図タイル(外部ネットワーク依存)は他のE2Eと同様ブロックする。ジオコーディングは
 * e2e/support/geocode-mock.tsでモックし、実際のGSIには依存しない。座標はseed店舗
 * (shop-test-published-01: 35.6938, 139.7536)の近傍(数km圏内)に寄せる
 * (e2e/shop-instagram-link.spec.tsのコメント・problem.txt P-023参照。フルE2E同時実行時に
 * 遠方座標を使うと無関係なテストのfitBounds/ピンクリックを巻き込んで失敗させるため)。
 *
 * テスト用データはこのファイル自身が作成・削除する(共有seedの値は書き換えない。P-018)。
 */
const TEST_PASSWORD = "e2e-test-password-123";
const VALID_PLACE_ID = "ChIJTestPlaceId_e2e-123";
const INVALID_PLACE_ID = "invalid place id!";

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

/** 店舗一覧から名前でshop-row(表示モード)を1件特定する */
function shopRowByName(page: Page, name: string) {
  return page.getByTestId("shop-row").filter({ hasText: name });
}

async function deleteShopByName(page: Page, name: string): Promise<void> {
  const row = shopRowByName(page, name);
  if ((await row.count()) === 0) {
    return;
  }
  await row.getByRole("button", { name: "削除" }).click();
  await page.getByTestId("shop-delete-confirm-confirm").click();
  await expect(shopRowByName(page, name)).toHaveCount(0);
}

test.describe("Googleマップで開く・Place ID・営業時間空欄案内(タスク6-3・P-021)", () => {
  test("店舗管理画面でGoogle Place IDを登録・保存・再表示で保持でき、不正な値はエラーになる", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-shop-pid-admin");

    const testId = uniqueTestId("e2e-shop-pid");
    const name = `【E2Eテスト】PlaceIDリンク店 ${testId}`;
    const address = `茨城県つくば市PlaceIDテスト${testId}`;

    await mockGeocode(page, { [address]: { lat: 35.708, lng: 139.75 } });

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    try {
      // Place ID Finderへの案内リンクが新しいタブで表示される
      await expect(page.getByRole("link", { name: "Place IDの調べ方" }).first()).toHaveAttribute(
        "target",
        "_blank",
      );

      // 不正な値(空白・記号を含む)での作成はエラーになり、店舗は作成されない
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill(address);
      await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
      await page.getByTestId("shop-create-place-id").fill(INVALID_PLACE_ID);
      await page.getByTestId("shop-create-geocode").click();
      await expect(page.getByTestId("shop-create-location-preview")).toContainText(
        "35.708000, 139.750000",
      );
      await page.getByRole("button", { name: "作成" }).click();
      await expect(page.getByTestId("shop-create-error")).toContainText(
        "英数字・ハイフン・アンダースコア",
      );
      await expect(shopRowByName(page, name)).toHaveCount(0);

      // 正しい値に直せば作成できる
      await page.getByTestId("shop-create-place-id").fill(VALID_PLACE_ID);
      await page.getByRole("button", { name: "作成" }).click();
      await expect(shopRowByName(page, name)).toBeVisible();
      await expect(page.getByTestId("shop-success")).toContainText("店舗を作成しました");

      // 編集フォームを開くと、保存したPlace IDが保持されている(再表示で保持)
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-place-id")).toHaveValue(VALID_PLACE_ID);

      // 不正な値に変更して保存するとエラーになり、保存されない
      await page.getByTestId("shop-edit-place-id").fill(INVALID_PLACE_ID);
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByTestId("shop-edit-error")).toContainText(
        "英数字・ハイフン・アンダースコア",
      );

      // 編集をキャンセルして開き直しても、直前の不正な入力は保存されておらず元の値のまま
      await page.getByRole("button", { name: "キャンセル" }).click();
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-place-id")).toHaveValue(VALID_PLACE_ID);

      // 空欄(登録なし)に変更して保存できる
      await page.getByTestId("shop-edit-place-id").fill("");
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByTestId("shop-success")).toContainText("店舗を更新しました");
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-place-id")).toHaveValue("");
      await page.getByRole("button", { name: "キャンセル" }).click();

      // 【重点】Firestore上のraw fieldsを直接確認する: googlePlaceIdキー自体が無いか、
      // 空文字であること。古い値(VALID_PLACE_ID)が残っていたらFAIL
      const rawFields = await getShopRawFieldsByName(name);
      expect(rawFields).not.toBeNull();
      const clearedValue = rawFields?.googlePlaceId;
      expect(clearedValue === undefined || clearedValue === "").toBe(true);
      expect(clearedValue).not.toBe(VALID_PLACE_ID);
    } finally {
      await deleteShopByName(page, name);
    }
  });

  test("AI取り込みレビュー画面(ReviewShopCard)でGoogle Place IDを登録・保存・再表示で保持でき、不正な値はエラーになる", async ({
    page,
  }) => {
    await blockMapTiles(page);

    const testId = uniqueTestId("e2e-review-pid");
    const videoId = uniqueVideoId();
    const videoTitle = `【E2Eテスト】PlaceIDレビュー動画 ${testId}`;
    const publishedAt = "2026-03-01T00:00:00+09:00";
    const shopName = `【E2Eテスト】PlaceIDレビュー店 ${testId}`;
    const shopAddress = `茨城県つくば市PlaceIDレビューテスト${testId}`;

    // 承認可否(座標未確定・未割り当て出演者)はこのテストの検証対象外のため、
    // あらかじめ座標確定済み・出演者解決済みの状態で下書き保存計画を返す
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
              addressCandidate: shopAddress,
              location: { lat: 35.71, lng: 139.752 },
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
                  items: ["【テスト用】PlaceIDレビューコーヒー"],
                },
              ],
            },
          ],
        }),
      });
    });

    await loginAsAdmin(page, "e2e-review-pid-admin");

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
    await expect(page.getByText(videoTitle)).toBeVisible();

    try {
      const shopCard = page.getByTestId("review-shop-card");
      await expect(shopCard).toBeVisible();
      await expect(shopCard.getByTestId("review-shop-warning")).toHaveCount(0);
      await expect(
        shopCard.getByRole("link", { name: "Place IDの調べ方" }),
      ).toHaveAttribute("target", "_blank");

      // Google Place IDを登録して保存する
      await shopCard.getByTestId("review-shop-place-id").fill(VALID_PLACE_ID);
      await shopCard.getByTestId("review-shop-save").click();
      await expect(shopCard.getByTestId("review-shop-error")).toHaveCount(0);

      // 再表示(画面リロード)で保持されている
      await page.reload();
      await expect(page.getByText(videoTitle)).toBeVisible();
      const reloadedCard = page.getByTestId("review-shop-card");
      await expect(reloadedCard.getByTestId("review-shop-place-id")).toHaveValue(VALID_PLACE_ID);

      // 不正な値に変更して保存するとエラーになり、保存されない
      await reloadedCard.getByTestId("review-shop-place-id").fill(INVALID_PLACE_ID);
      await reloadedCard.getByTestId("review-shop-save").click();
      await expect(reloadedCard.getByTestId("review-shop-error")).toContainText(
        "英数字・ハイフン・アンダースコア",
      );

      // 再表示しても、直前の不正な入力は保存されておらず元の値のまま
      await page.reload();
      await expect(page.getByText(videoTitle)).toBeVisible();
      await expect(
        page.getByTestId("review-shop-card").getByTestId("review-shop-place-id"),
      ).toHaveValue(VALID_PLACE_ID);
    } finally {
      // 後片付け: このテストが作成した訪問・動画・店舗をすべて削除する
      await page.goto("/admin");
      await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();

      await page.getByRole("link", { name: "訪問" }).click();
      const visitRow = page.getByTestId("visit-row").filter({ hasText: videoTitle });
      if ((await visitRow.count()) > 0) {
        await visitRow.getByRole("button", { name: "削除" }).click();
        await page.getByTestId("visit-delete-confirm-confirm").click();
        await expect(page.getByTestId("visit-row").filter({ hasText: videoTitle })).toHaveCount(
          0,
        );
      }

      await page.getByRole("link", { name: "動画" }).click();
      const videoRow = page.getByTestId("video-row").filter({ hasText: videoTitle });
      if ((await videoRow.count()) > 0) {
        await videoRow.getByRole("button", { name: "削除" }).click();
        await page.getByTestId("video-delete-confirm-confirm").click();
        await expect(page.getByTestId("video-row").filter({ hasText: videoTitle })).toHaveCount(
          0,
        );
      }

      await page.getByRole("link", { name: "店舗" }).click();
      await deleteShopByName(page, shopName);
    }
  });

  test("公開ページの詳細シートに「Googleマップで開く」ボタンが常に表示され、Place IDの有無で正しいURLを新しいタブで開く。営業時間空欄の店舗は案内文言が表示される", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-detail-gmap-admin");

    const testId = uniqueTestId("e2e-detail-gmap");
    const shopWithPidName = `【E2Eテスト】PlaceID登録店 ${testId}`;
    const shopWithPidAddress = `茨城県つくば市PlaceID詳細シートテスト${testId}`;
    const shopWithoutPidName = `【E2Eテスト】PlaceID未登録店(営業時間あり) ${testId}`;
    const shopWithoutPidAddress = `茨城県つくば市PlaceID未登録詳細シートテスト${testId}`;
    const shopEmptyHoursName = `【E2Eテスト】営業時間空欄店 ${testId}`;
    const shopEmptyHoursAddress = `茨城県つくば市営業時間空欄テスト${testId}`;

    // 座標はseed店舗の近傍(数km圏内)に寄せている(e2e/shop-instagram-link.spec.tsの
    // コメント・problem.txt P-023参照)
    await mockGeocode(page, {
      [shopWithPidAddress]: { lat: 35.72, lng: 139.758 },
      [shopWithoutPidAddress]: { lat: 35.725, lng: 139.762 },
      [shopEmptyHoursAddress]: { lat: 35.73, lng: 139.766 },
    });

    async function createAndPublishShop(
      name: string,
      address: string,
      businessHours: string,
      placeId: string,
    ): Promise<void> {
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill(address);
      await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
      if (businessHours !== "") {
        await page.getByTestId("shop-create-businesshours").fill(businessHours);
      }
      if (placeId !== "") {
        await page.getByTestId("shop-create-place-id").fill(placeId);
      }
      await page.getByTestId("shop-create-geocode").click();
      await page.getByRole("button", { name: "作成" }).click();
      const row = shopRowByName(page, name);
      await expect(row).toBeVisible();
      await row.getByTestId("shop-status-toggle").click();
      await expect(row.getByTestId("shop-status")).toHaveText("公開");
      // 次の店舗作成に備えてフォームをリセットする
      await page.getByTestId("shop-create-name").fill("");
      await page.getByTestId("shop-create-address").fill("");
      await page.getByTestId("shop-create-businesshours").fill("");
      await page.getByTestId("shop-create-place-id").fill("");
    }

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    try {
      await createAndPublishShop(
        shopWithPidName,
        shopWithPidAddress,
        "8:00-18:00",
        VALID_PLACE_ID,
      );
      await createAndPublishShop(shopWithoutPidName, shopWithoutPidAddress, "9:00-17:00", "");
      await createAndPublishShop(shopEmptyHoursName, shopEmptyHoursAddress, "", "");

      await blockMapTiles(page);
      const publicResponse = await page.goto("/");
      expect(publicResponse?.ok()).toBe(true);

      // 1. Place ID登録済みの店舗: query_place_idが付与されたURLで新しいタブを開く
      const pinWithPid = page.locator(`[data-testid="map-pin"][aria-label="${shopWithPidName}"]`);
      await expect(pinWithPid).toHaveCount(1);
      await pinWithPid.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopWithPidName);
      const gmapLinkWithPid = page.getByTestId("detail-sheet-google-maps-link");
      await expect(gmapLinkWithPid).toHaveCount(1);
      await expect(gmapLinkWithPid).toHaveText("Googleマップで開く");
      await expect(gmapLinkWithPid).toHaveAttribute("target", "_blank");
      await expect(gmapLinkWithPid).toHaveAttribute("rel", "noopener noreferrer");
      const expectedUrlWithPid = buildGoogleMapsSearchUrl(
        shopWithPidName,
        shopWithPidAddress,
        VALID_PLACE_ID,
      );
      await expect(gmapLinkWithPid).toHaveAttribute("href", expectedUrlWithPid);
      // hrefが日本語(店名・住所)を含むURLを正しくデコードできることも確認する
      const decodedUrlWithPid = new URL(await gmapLinkWithPid.getAttribute("href") ?? "");
      expect(decodedUrlWithPid.searchParams.get("query")).toBe(
        `${shopWithPidName} ${shopWithPidAddress}`,
      );
      expect(decodedUrlWithPid.searchParams.get("query_place_id")).toBe(VALID_PLACE_ID);
      // 営業時間は入力ありのため従来通りの表示
      await expect(page.getByTestId("detail-sheet-business-hours")).toHaveText(
        "営業時間: 8:00-18:00",
      );
      // レビュー証跡: 店舗情報欄下部のボタン配置・崩れの目視確認用スクリーンショット
      await gmapLinkWithPid.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `e2e/artifacts/review-6-3/detail-sheet-google-maps-${test.info().project.name}.png`,
        fullPage: false,
      });
      await page.getByTestId("detail-sheet-close").click();

      // 2. Place ID未登録の店舗: query_place_idを付けないURL
      const pinWithoutPid = page.locator(
        `[data-testid="map-pin"][aria-label="${shopWithoutPidName}"]`,
      );
      await expect(pinWithoutPid).toHaveCount(1);
      await pinWithoutPid.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopWithoutPidName);
      const gmapLinkWithoutPid = page.getByTestId("detail-sheet-google-maps-link");
      await expect(gmapLinkWithoutPid).toHaveCount(1);
      const expectedUrlWithoutPid = buildGoogleMapsSearchUrl(
        shopWithoutPidName,
        shopWithoutPidAddress,
      );
      await expect(gmapLinkWithoutPid).toHaveAttribute("href", expectedUrlWithoutPid);
      expect(expectedUrlWithoutPid).not.toContain("query_place_id");
      await page.getByTestId("detail-sheet-close").click();

      // 3. 営業時間が空欄の店舗: 案内文言が表示される
      const pinEmptyHours = page.locator(
        `[data-testid="map-pin"][aria-label="${shopEmptyHoursName}"]`,
      );
      await expect(pinEmptyHours).toHaveCount(1);
      await pinEmptyHours.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopEmptyHoursName);
      await expect(page.getByTestId("detail-sheet-business-hours")).toHaveText(
        "営業時間: Googleマップでご確認ください",
      );
      // 営業時間が空欄でも「Googleマップで開く」ボタンは表示される
      await expect(page.getByTestId("detail-sheet-google-maps-link")).toHaveCount(1);
      await page.getByTestId("detail-sheet-close").click();
    } finally {
      await page.goto("/admin");
      await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
      await page.getByRole("link", { name: "店舗" }).click();
      await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
      await deleteShopByName(page, shopWithPidName);
      await deleteShopByName(page, shopWithoutPidName);
      await deleteShopByName(page, shopEmptyHoursName);
    }
  });
});
