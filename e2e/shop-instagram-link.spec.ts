import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { getShopRawFieldsByName } from "./support/firestore-raw";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク6-2(店舗のInstagramリンク、P-020)のE2Eテスト。
 *
 * requirements.md「4. データモデル」shops.instagramUrl と「3.1 公開ページ」詳細シート
 * (店舗情報欄の下部にInstagramアイコンを表示する、2026-09-25決定)に基づき、以下を検証する:
 * 1. 店舗管理画面(/admin/shops)の作成・編集フォームでInstagram URLを登録・保存でき、
 *    再表示(編集フォームを開き直す)しても保持される。https://www.instagram.com/ で
 *    始まらないURLはエラーになり保存されない
 * 2. AI取り込みレビュー画面(ReviewShopCard、「店舗情報を保存」)でも同様に登録・保持・
 *    不正URLのエラーができる
 * 3. 公開ページの詳細シートで、Instagram登録済みの店舗のみアイコン(リンク)が表示され、
 *    新しいタブ(target="_blank", rel="noopener noreferrer")で当該URLを開く。未登録の
 *    店舗はアイコンが表示されない
 *
 * 地図タイル(外部ネットワーク依存)は他のE2Eと同様ブロックする。ジオコーディングは
 * e2e/support/geocode-mock.tsでモックし、実際のNominatimには依存しない。
 * 座標はseed店舗・他タスクのE2Eと重ならない決定的な値を使う(problem.txt P-009対応の方針)。
 *
 * テスト用データはこのファイル自身が作成・削除する(共有seedの値は書き換えない。P-018)。
 */
const TEST_PASSWORD = "e2e-test-password-123";
const VALID_INSTAGRAM_URL = "https://www.instagram.com/daychi_coffee_e2e/";
const INVALID_INSTAGRAM_URL = "https://example.com/daychi_coffee_e2e/";

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

test.describe("店舗のInstagramリンク(タスク6-2・P-020)", () => {
  test("店舗管理画面でInstagram URLを登録・保存・再表示で保持でき、不正なURLはエラーになる", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-shop-ig-admin");

    const testId = uniqueTestId("e2e-shop-ig");
    const name = `【E2Eテスト】Instagramリンク店 ${testId}`;
    const address = `茨城県つくば市Instagramテスト${testId}`;

    await mockGeocode(page, { [address]: { lat: 36.0, lng: 140.0 } });

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    try {
      // 不正なURL(https://www.instagram.com/ から始まらない)での作成はエラーになり、
      // 店舗は作成されない
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill(address);
      await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
      await page.getByTestId("shop-create-instagram").fill(INVALID_INSTAGRAM_URL);
      await page.getByTestId("shop-create-geocode").click();
      await expect(page.getByTestId("shop-create-location-preview")).toContainText(
        "36.000000, 140.000000",
      );
      await page.getByRole("button", { name: "作成" }).click();
      await expect(page.getByTestId("shop-create-error")).toContainText(
        "https://www.instagram.com/",
      );
      await expect(shopRowByName(page, name)).toHaveCount(0);

      // 正しいURLに直せば作成できる
      await page.getByTestId("shop-create-instagram").fill(VALID_INSTAGRAM_URL);
      await page.getByRole("button", { name: "作成" }).click();
      await expect(shopRowByName(page, name)).toBeVisible();
      await expect(page.getByTestId("shop-success")).toContainText("店舗を作成しました");

      // 編集フォームを開くと、保存したInstagram URLが保持されている(再表示で保持)
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-instagram")).toHaveValue(VALID_INSTAGRAM_URL);

      // 不正なURLに変更して保存するとエラーになり、保存されない
      await page.getByTestId("shop-edit-instagram").fill(INVALID_INSTAGRAM_URL);
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByTestId("shop-edit-error")).toContainText(
        "https://www.instagram.com/",
      );

      // 編集をキャンセルして開き直しても、直前の不正な入力は保存されておらず元の値のまま
      await page.getByRole("button", { name: "キャンセル" }).click();
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-instagram")).toHaveValue(VALID_INSTAGRAM_URL);

      // 空欄(登録なし)に変更して保存できる
      await page.getByTestId("shop-edit-instagram").fill("");
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByTestId("shop-success")).toContainText("店舗を更新しました");
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-instagram")).toHaveValue("");
      await page.getByRole("button", { name: "キャンセル" }).click();
    } finally {
      await deleteShopByName(page, name);
    }
  });

  test("AI取り込みレビュー画面(ReviewShopCard)でInstagram URLを登録・保存・再表示で保持でき、不正なURLはエラーになる", async ({
    page,
  }) => {
    await blockMapTiles(page);

    const testId = uniqueTestId("e2e-review-ig");
    const videoId = uniqueVideoId();
    const videoTitle = `【E2Eテスト】Instagramレビュー動画 ${testId}`;
    const publishedAt = "2026-03-01T00:00:00+09:00";
    const shopName = `【E2Eテスト】Instagramレビュー店 ${testId}`;
    const shopAddress = `茨城県つくば市Instagramレビューテスト${testId}`;

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
              location: { lat: 37.0, lng: 141.0 },
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
                  items: ["【テスト用】Instagramレビューコーヒー"],
                },
              ],
            },
          ],
        }),
      });
    });

    await loginAsAdmin(page, "e2e-review-ig-admin");

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
      // 座標確定済み・出演者解決済みのため、承認をブロックする警告は出ない
      await expect(shopCard.getByTestId("review-shop-warning")).toHaveCount(0);

      // Instagram URLを登録して保存する
      await shopCard.getByTestId("review-shop-instagram").fill(VALID_INSTAGRAM_URL);
      await shopCard.getByTestId("review-shop-save").click();
      await expect(shopCard.getByTestId("review-shop-error")).toHaveCount(0);

      // 再表示(画面リロード)で保持されている
      await page.reload();
      await expect(page.getByText(videoTitle)).toBeVisible();
      const reloadedCard = page.getByTestId("review-shop-card");
      await expect(reloadedCard.getByTestId("review-shop-instagram")).toHaveValue(
        VALID_INSTAGRAM_URL,
      );

      // 不正なURLに変更して保存するとエラーになり、保存されない
      await reloadedCard.getByTestId("review-shop-instagram").fill(INVALID_INSTAGRAM_URL);
      await reloadedCard.getByTestId("review-shop-save").click();
      await expect(reloadedCard.getByTestId("review-shop-error")).toContainText(
        "https://www.instagram.com/",
      );

      // 再表示しても、直前の不正な入力は保存されておらず元の値のまま
      await page.reload();
      await expect(page.getByText(videoTitle)).toBeVisible();
      await expect(
        page.getByTestId("review-shop-card").getByTestId("review-shop-instagram"),
      ).toHaveValue(VALID_INSTAGRAM_URL);
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

  test("【重点】登録済みのInstagram URLを編集で空欄にして保存すると、Firestore上のフィールドも実際に消え、詳細シートのアイコンも消える", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-clear-ig-admin");

    const testId = uniqueTestId("e2e-clear-ig");
    const name = `【E2Eテスト】Instagramクリア店 ${testId}`;
    const address = `茨城県つくば市Instagramクリアテスト${testId}`;

    // 座標はseed店舗(shop-test-published-01: 35.6938, 139.7536)の近傍(数km圏内)に
    // あえて寄せている。e2e/detail-sheet.spec.tsのコメント・problem.txt P-023の調査結果の通り、
    // 公開ページのfitBounds()は同時に公開されている全店舗の座標範囲に応じて縮尺を変えるため、
    // 遠方(数十km以上)の座標を使うと、フルE2E同時実行時に他specが公開したseed店舗のピンが
    // 意図せず地図コンテナ外にはみ出し、無関係なテスト(sidebar-detail-sheet-layout.spec.ts等の
    // ピンクリック)を巻き込んで失敗させることをdaychi-reviewで確認した(このテストがpublishする
    // 店舗はテスト実行中の数秒間だけ存在するが、フルE2E全体では常にどこかのテストが店舗を
    // publish/unpublishしているため、遠方座標は使わない方針とする)
    await mockGeocode(page, { [address]: { lat: 35.705, lng: 139.745 } });

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    try {
      // 1. Instagram URL登録済みの店舗を作成し、公開する
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill(address);
      await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
      await page.getByTestId("shop-create-instagram").fill(VALID_INSTAGRAM_URL);
      await page.getByTestId("shop-create-geocode").click();
      await expect(page.getByTestId("shop-create-location-preview")).toContainText(
        "35.705000, 139.745000",
      );
      await page.getByRole("button", { name: "作成" }).click();
      const row = shopRowByName(page, name);
      await expect(row).toBeVisible();
      await row.getByTestId("shop-status-toggle").click();
      await expect(row.getByTestId("shop-status")).toHaveText("公開");

      // 2. Firestore上のraw fieldsを直接確認: instagramUrlが登録した値になっている
      const rawFieldsAfterCreate = await getShopRawFieldsByName(name);
      expect(rawFieldsAfterCreate).not.toBeNull();
      expect(rawFieldsAfterCreate?.instagramUrl).toBe(VALID_INSTAGRAM_URL);

      // 3. 公開ページの詳細シートにアイコンが表示される
      await blockMapTiles(page);
      const publicResponse = await page.goto("/");
      expect(publicResponse?.ok()).toBe(true);
      const pin = page.locator(`[data-testid="map-pin"][aria-label="${name}"]`);
      await expect(pin).toHaveCount(1);
      await pin.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(name);
      await expect(page.getByTestId("detail-sheet-instagram-link")).toHaveCount(1);
      await page.getByTestId("detail-sheet-close").click();

      // 4. 管理画面で編集し、Instagram URLを空欄にして保存する
      await page.goto("/admin");
      await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
      await page.getByRole("link", { name: "店舗" }).click();
      await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
      await shopRowByName(page, name).getByRole("button", { name: "編集" }).click();
      await expect(page.getByTestId("shop-edit-instagram")).toHaveValue(VALID_INSTAGRAM_URL);
      await page.getByTestId("shop-edit-instagram").fill("");
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByTestId("shop-success")).toContainText("店舗を更新しました");

      // 5. 【重点】Firestore上のraw fieldsを直接確認する: instagramUrlキー自体が無いか、
      //    空文字であること。古い値(VALID_INSTAGRAM_URL)が残っていたらFAIL
      const rawFieldsAfterClear = await getShopRawFieldsByName(name);
      expect(rawFieldsAfterClear).not.toBeNull();
      const clearedValue = rawFieldsAfterClear?.instagramUrl;
      expect(clearedValue === undefined || clearedValue === "").toBe(true);
      expect(clearedValue).not.toBe(VALID_INSTAGRAM_URL);

      // 6. 公開ページの詳細シートからアイコンが消えている
      await blockMapTiles(page);
      await page.goto("/");
      const pinAfterClear = page.locator(`[data-testid="map-pin"][aria-label="${name}"]`);
      await expect(pinAfterClear).toHaveCount(1);
      await pinAfterClear.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(name);
      await expect(page.getByTestId("detail-sheet-instagram-link")).toHaveCount(0);
      await page.getByTestId("detail-sheet-close").click();
    } finally {
      await page.goto("/admin");
      await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
      await page.getByRole("link", { name: "店舗" }).click();
      await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
      await deleteShopByName(page, name);
    }
  });

  test("公開ページの詳細シートでは、Instagram登録済みの店舗のみアイコンが表示され新しいタブで開く", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await loginAsAdmin(page, "e2e-detail-ig-admin");

    const testId = uniqueTestId("e2e-detail-ig");
    const shopWithIgName = `【E2Eテスト】Instagram登録店 ${testId}`;
    const shopWithIgAddress = `茨城県つくば市Instagram詳細シートテスト${testId}`;
    const shopWithoutIgName = `【E2Eテスト】Instagram未登録店 ${testId}`;
    const shopWithoutIgAddress = `茨城県つくば市Instagram未登録詳細シートテスト${testId}`;

    // 座標はseed店舗の近傍(数km圏内)に寄せている(上の「重点」テストのコメント・
    // problem.txt P-023参照。遠方座標はフルE2E同時実行時に無関係なテストのピンクリックを
    // 巻き込んで失敗させることをdaychi-reviewで確認したため使わない)
    await mockGeocode(page, {
      [shopWithIgAddress]: { lat: 35.715, lng: 139.76 },
      [shopWithoutIgAddress]: { lat: 35.72, lng: 139.765 },
    });

    async function createAndPublishShop(
      name: string,
      address: string,
      instagramUrl: string,
    ): Promise<void> {
      await page.getByTestId("shop-create-name").fill(name);
      await page.getByTestId("shop-create-address").fill(address);
      await page.getByTestId("shop-create-infoasof").fill("2026-05-01");
      if (instagramUrl !== "") {
        await page.getByTestId("shop-create-instagram").fill(instagramUrl);
      }
      await page.getByTestId("shop-create-geocode").click();
      await page.getByRole("button", { name: "作成" }).click();
      const row = shopRowByName(page, name);
      await expect(row).toBeVisible();
      await row.getByTestId("shop-status-toggle").click();
      await expect(row.getByTestId("shop-status")).toHaveText("公開");
      // 次の店舗作成に備えてフォームをリセットする(shop-create-instagramに前の値が
      // 残らないようにする)
      await page.getByTestId("shop-create-name").fill("");
      await page.getByTestId("shop-create-address").fill("");
      await page.getByTestId("shop-create-instagram").fill("");
    }

    await page.getByRole("link", { name: "店舗" }).click();
    await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();

    try {
      await createAndPublishShop(shopWithIgName, shopWithIgAddress, VALID_INSTAGRAM_URL);
      await createAndPublishShop(shopWithoutIgName, shopWithoutIgAddress, "");

      // 公開ページ: Instagram登録済みの店舗はアイコン(リンク)が表示され、
      // href/target/rel/aria-labelが正しい
      await blockMapTiles(page);
      const publicResponse = await page.goto("/");
      expect(publicResponse?.ok()).toBe(true);

      const pinWithIg = page.locator(`[data-testid="map-pin"][aria-label="${shopWithIgName}"]`);
      await expect(pinWithIg).toHaveCount(1);
      await expect(pinWithIg).toBeVisible();
      await pinWithIg.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopWithIgName);
      const instagramLink = page.getByTestId("detail-sheet-instagram-link");
      await expect(instagramLink).toHaveCount(1);
      await expect(instagramLink).toHaveAttribute("href", VALID_INSTAGRAM_URL);
      await expect(instagramLink).toHaveAttribute("target", "_blank");
      await expect(instagramLink).toHaveAttribute("rel", "noopener noreferrer");
      await expect(instagramLink).toHaveAttribute("aria-label", "Instagram");
      // レビュー証跡: 店舗情報欄下部のInstagramアイコン配置・崩れの目視確認用スクリーンショット
      await instagramLink.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `e2e/artifacts/review-6-2/detail-sheet-instagram-${test.info().project.name}.png`,
        fullPage: false,
      });
      await page.getByTestId("detail-sheet-close").click();

      // 未登録の店舗はアイコンが表示されない
      const pinWithoutIg = page.locator(
        `[data-testid="map-pin"][aria-label="${shopWithoutIgName}"]`,
      );
      await expect(pinWithoutIg).toHaveCount(1);
      await expect(pinWithoutIg).toBeVisible();
      await pinWithoutIg.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(shopWithoutIgName);
      await expect(page.getByTestId("detail-sheet-instagram-link")).toHaveCount(0);
      await page.getByTestId("detail-sheet-close").click();
    } finally {
      // 後片付け: 管理画面へ戻って両店舗を削除する
      await page.goto("/admin");
      await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
      await page.getByRole("link", { name: "店舗" }).click();
      await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
      await deleteShopByName(page, shopWithIgName);
      await deleteShopByName(page, shopWithoutIgName);
    }
  });
});
