import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { createEmulatorTestUser } from "./support/emulator-auth";
import { mockGeocode } from "./support/geocode-mock";

/**
 * タスク5-3(公開ページのタグ絞り込み)のE2Eテスト。
 *
 * requirements.md「3.1 公開ページ」の
 * 「コーヒータイプタグフィルタ: 店舗に付与されたタグで絞り込む。複数のタグを選んだ場合は、
 *   いずれかのタグが付いた店舗を表示する(OR)。出演者フィルタとタグフィルタを両方使う場合は、
 *   両方の条件を満たす店舗だけを表示する」「詳細シートの店名の近くに、その店舗のタグを
 *   表示する」に基づき、
 * - タグフィルタUI(TagFilter)にタグマスタの全件が選択肢として表示されること
 * - タグを選択すると、選択タグのいずれかが付いた店舗のピンのみ表示され(OR)、
 *   選択解除で全published店舗のピンに戻ること
 * - 出演者フィルタと併用した場合、両方の条件を満たす店舗のみが表示されること(AND)
 * - 詳細シートの店名近くにその店舗のタグ名(order昇順)が表示され、タグが無い店舗では
 *   何も表示されないこと
 * を検証する。
 *
 * 使用するタグは scripts/seed.ts が投入する固定タグ tag-test-unused / tag-test-assigned
 * (タスク5-1のE2E用シード)を読み取り専用で参照する(タグ自体のドキュメントは変更しない。
 * 選択対象として使うだけ)。tag-test-assignedはseedの shop-test-published-01 に
 * 既に付与されている(P-018注記どおりこの値は書き換えない)。
 *
 * このテストが書き込むのは自分で作成した店舗・訪問のみで、他specが参照する共有データ
 * (shop-test-published-01等)は一切変更しない(P-018参照)。作成したテスト専用データは
 * try/finally内で必ず削除する(e2e/shop-tag-assignment.spec.tsと同じ方針。ただし
 * 削除は管理画面UI操作で行う。e2e/performer-filter.spec.tsと同じ方式)。
 *
 * 地図タイル(外部ネットワーク依存)はe2e/public-map.spec.ts等と同様ブロックする。
 * ピンの絞り込み結果は data-testid="map-pin"(data-shop-id / aria-label)で検証する。
 */
const TEST_PASSWORD = "e2e-test-password-123";

// scripts/seed.ts が投入する固定タグ(タスク5-1のE2E用シード。読み取り専用で使う)
const TAG_UNUSED_ID = "tag-test-unused";
const TAG_UNUSED_NAME = "【テスト用】タグ(未使用)";
const TAG_ASSIGNED_ID = "tag-test-assigned";
const TAG_ASSIGNED_NAME = "【テスト用】タグ(店舗紐付け)";

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

interface CreatePublishedShopParams {
  name: string;
  address: string;
  lat: number;
  lng: number;
  tagIds: string[];
}

/** 管理画面から店舗を作成し公開する(タグを付与可能)。作成後は店舗一覧に戻った状態になる */
async function createPublishedShop(
  page: Page,
  { name, address, lat, lng, tagIds }: CreatePublishedShopParams,
): Promise<void> {
  await mockGeocode(page, { [address]: { lat, lng } });

  await page.getByRole("link", { name: "店舗" }).click();
  await expect(page.getByRole("heading", { name: "店舗マスタ" })).toBeVisible();
  await page.getByTestId("shop-create-name").fill(name);
  await page.getByTestId("shop-create-address").fill(address);
  await page.getByTestId("shop-create-businesshours").fill("10:00-19:00(テストデータ)");
  await page.getByTestId("shop-create-infoasof").fill("2026-06-01");
  await page.getByTestId("shop-create-geocode").click();
  await expect(page.getByTestId("shop-create-location-preview")).toContainText(
    `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
  );
  for (const tagId of tagIds) {
    await page.getByTestId(`shop-create-tag-checkbox-${tagId}`).check();
  }
  await page.getByRole("button", { name: "作成" }).click();
  const shopRow = page.getByTestId("shop-row").filter({ hasText: name });
  await expect(shopRow).toBeVisible();
  await shopRow.getByTestId("shop-status-toggle").click();
  await expect(shopRow.getByTestId("shop-status")).toHaveText("公開");
}

interface CreatePublishedVisitParams {
  shopName: string;
  performerLabel: string;
  itemName: string;
}

/** 既存のseed動画(dAyChiTEST1、published)に紐付けて訪問を作成し公開する */
async function createPublishedVisit(
  page: Page,
  { shopName, performerLabel, itemName }: CreatePublishedVisitParams,
): Promise<void> {
  await page.getByRole("link", { name: "訪問" }).click();
  await expect(page.getByRole("heading", { name: "訪問登録" })).toBeVisible();
  await page.getByTestId("visit-create-shop").selectOption({ label: shopName });
  await page.getByTestId("visit-create-video").selectOption({ label: "【テスト用】公開済み動画" });
  await page.getByTestId("visit-create-consumption-addrow").click();
  const consumptionRow = page.getByTestId("visit-create-consumption-row").nth(0);
  await consumptionRow.getByTestId("visit-create-consumption-performer").selectOption({
    label: performerLabel,
  });
  await consumptionRow.getByTestId("visit-create-consumption-item").nth(0).fill(itemName);
  await page.getByRole("button", { name: "作成" }).click();

  const visitRow = page
    .getByTestId("visit-row")
    .filter({ hasText: "【テスト用】公開済み動画" })
    .filter({ hasText: shopName });
  await expect(visitRow).toBeVisible();
  await visitRow.getByTestId("visit-status-toggle").click();
  await expect(visitRow.getByTestId("visit-status")).toHaveText("公開");
}

/** このテストが作成した訪問(店舗名一致)をすべて削除する */
async function cleanupVisitsForShop(page: Page, shopName: string): Promise<void> {
  await page.goto("/admin");
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
  await page.getByRole("link", { name: "訪問" }).click();
  for (const row of await page
    .getByTestId("visit-row")
    .filter({ hasText: "【テスト用】公開済み動画" })
    .filter({ hasText: shopName })
    .all()) {
    await row.getByRole("button", { name: "削除" }).click();
    await page.getByTestId("visit-delete-confirm-confirm").click();
  }
}

/** このテストが作成した店舗(店舗名一致)を削除する */
async function cleanupShop(page: Page, shopName: string): Promise<void> {
  await page.goto("/admin");
  await expect(page.getByText("Daychi COFFEE MAP 管理画面")).toBeVisible();
  await page.getByRole("link", { name: "店舗" }).click();
  const shopRow = page.getByTestId("shop-row").filter({ hasText: shopName });
  if ((await shopRow.count()) === 0) {
    return;
  }
  await shopRow.getByRole("button", { name: "削除" }).click();
  await page.getByTestId("shop-delete-confirm-confirm").click();
  await expect(page.getByTestId("shop-row").filter({ hasText: shopName })).toHaveCount(0);
}

test.describe("タグ絞り込み", () => {
  test("モバイル幅でもタグフィルタが表示され地図が崩れない", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル幅での最低限の表示崩れ確認のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();

    const assignedOption = page.locator(
      `[data-testid="tag-filter-option"][data-tag-id="${TAG_ASSIGNED_ID}"]`,
    );
    const unusedOption = page.locator(
      `[data-testid="tag-filter-option"][data-tag-id="${TAG_UNUSED_ID}"]`,
    );
    await expect(assignedOption).toBeVisible();
    await expect(unusedOption).toBeVisible();

    // seedのpublished店舗のピンが引き続き表示されること(レイアウト崩れで地図が
    // 機能しなくなっていないことの最低限の確認)
    await expect(
      page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]'),
    ).toHaveCount(1);
  });

  test("デスクトップ: タグ選択でピンが絞り込まれ(OR)、出演者フィルタとの併用は両条件を満たす店舗のみ(AND)、解除で全件に戻る", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "管理画面CRUDセットアップの安定性の都合上デスクトップのみで検証する",
    );

    await loginAsAdmin(page, "e2e-tag-filter-admin");

    const testId = uniqueTestId("e2e-tag-filter");
    const shopName = `【E2Eテスト】タグフィルタ店 ${testId}`;
    const shopAddress = "東京都テスト区テスト9-9-9";
    // desktop/mobileプロジェクトが並行実行されるため座標をジッターさせ、
    // ピンのDOM要素が重ならないようにする(e2e/performer-filter.spec.tsと同方針)
    const shopLat = 35.9 + Math.random() * 0.05;
    const shopLng = 139.85 + Math.random() * 0.05;

    try {
      // tag-test-unused を付与し、performer-test-sub は参加させない店舗を作成する
      // (seedの shop-test-published-01 は tag-test-assigned のみを持ち、
      // performer-test-main/performer-test-subの両方が参加している)
      await createPublishedShop(page, {
        name: shopName,
        address: shopAddress,
        lat: shopLat,
        lng: shopLng,
        tagIds: [TAG_UNUSED_ID],
      });
      await createPublishedVisit(page, {
        shopName,
        performerLabel: "【テスト用】メイン出演者",
        itemName: `【テスト用】タグフィルタ用メニュー ${testId}`,
      });

      // --- 公開ページでタグフィルタを検証する ---
      await blockMapTiles(page);
      const response = await page.goto("/");
      expect(response?.ok()).toBe(true);

      const assignedOption = page.locator(
        `[data-testid="tag-filter-option"][data-tag-id="${TAG_ASSIGNED_ID}"]`,
      );
      const unusedOption = page.locator(
        `[data-testid="tag-filter-option"][data-tag-id="${TAG_UNUSED_ID}"]`,
      );
      await expect(assignedOption).toContainText(TAG_ASSIGNED_NAME);
      await expect(unusedOption).toContainText(TAG_UNUSED_NAME);

      const seedPin = page.locator(
        '[data-testid="map-pin"][data-shop-id="shop-test-published-01"]',
      );
      const newPin = page.locator(`[data-testid="map-pin"][aria-label="${shopName}"]`);

      // フィルタ未適用: 両方のピンが表示される
      await expect(seedPin).toHaveCount(1);
      await expect(newPin).toHaveCount(1);

      // tag-test-unusedを選択: 付与されているnewPinのみ残り、seedPin(tag-test-assignedのみ)は消える
      await unusedOption.locator("input[type=checkbox]").check();
      await expect(unusedOption).toHaveAttribute("data-selected", "true");
      await expect(seedPin).toHaveCount(0);
      await expect(newPin).toHaveCount(1);

      // tag-test-assignedも選択(OR): 両方のピンが表示される
      await assignedOption.locator("input[type=checkbox]").check();
      await expect(assignedOption).toHaveAttribute("data-selected", "true");
      await expect(seedPin).toHaveCount(1);
      await expect(newPin).toHaveCount(1);

      // tag-test-unusedを解除(tag-test-assignedのみ選択中): seedPinのみ残る
      await unusedOption.locator("input[type=checkbox]").uncheck();
      await expect(seedPin).toHaveCount(1);
      await expect(newPin).toHaveCount(0);

      // --- 出演者フィルタとの併用(AND)を検証する ---
      // tag-test-assigned(seedPinのタグ) + performer-test-sub(seedPinの訪問に参加)を
      // 両方選択: 両条件を満たすseedPinのみ表示される(newPinはtag-test-assignedを持たないため
      // performerの一致有無に関わらず非表示のまま)
      const subPerformerOption = page.locator(
        '[data-testid="performer-filter-option"][data-performer-id="performer-test-sub"]',
      );
      await subPerformerOption.locator("input[type=checkbox]").check();
      await expect(seedPin).toHaveCount(1);
      await expect(newPin).toHaveCount(0);

      // tag-test-assignedを解除しtag-test-unusedを選択(performer-test-subは選択したまま):
      // newPinはtag-test-unusedを持つがperformer-test-subが参加していないため非表示、
      // seedPinはperformer-test-subが参加しているがtag-test-unusedを持たないため非表示。
      // どちらも0件になることでOR(いずれか一致で表示)ではなくAND(両方満たす必要)である
      // ことを確認する
      await assignedOption.locator("input[type=checkbox]").uncheck();
      await unusedOption.locator("input[type=checkbox]").check();
      await expect(seedPin).toHaveCount(0);
      await expect(newPin).toHaveCount(0);

      // 全解除: 両方のピンに戻る
      await unusedOption.locator("input[type=checkbox]").uncheck();
      await subPerformerOption.locator("input[type=checkbox]").uncheck();
      await expect(seedPin).toHaveCount(1);
      await expect(newPin).toHaveCount(1);
    } finally {
      await cleanupVisitsForShop(page, shopName);
      await cleanupShop(page, shopName);
    }
  });

  test("デスクトップ: 詳細シートの店名近くにタグ名がorder昇順で表示され、タグが無い店舗では何も表示されない", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "管理画面CRUDセットアップの安定性の都合上デスクトップのみで検証する",
    );

    await loginAsAdmin(page, "e2e-tag-filter-detail-admin");

    const testId = uniqueTestId("e2e-tag-filter-detail");
    const taggedShopName = `【E2Eテスト】タグ表示店 ${testId}`;
    const taggedShopAddress = "東京都テスト区テスト8-8-8";
    const untaggedShopName = `【E2Eテスト】タグ無し店 ${testId}`;
    const untaggedShopAddress = "東京都テスト区テスト7-7-7";
    const taggedLat = 35.95 + Math.random() * 0.02;
    const taggedLng = 139.75 + Math.random() * 0.02;
    const untaggedLat = 35.98 + Math.random() * 0.02;
    const untaggedLng = 139.8 + Math.random() * 0.02;

    try {
      // tag-test-assignedとtag-test-unusedの両方を付与する(TagCheckboxListはorder昇順で
      // 表示するがtagIds自体の指定順序には依存しないことも確認するため、あえて
      // tag-test-assigned→tag-test-unusedの順でチェックする)
      await createPublishedShop(page, {
        name: taggedShopName,
        address: taggedShopAddress,
        lat: taggedLat,
        lng: taggedLng,
        tagIds: [TAG_ASSIGNED_ID, TAG_UNUSED_ID],
      });
      await createPublishedShop(page, {
        name: untaggedShopName,
        address: untaggedShopAddress,
        lat: untaggedLat,
        lng: untaggedLng,
        tagIds: [],
      });

      await blockMapTiles(page);
      const response = await page.goto("/");
      expect(response?.ok()).toBe(true);

      const taggedPin = page.locator(`[data-testid="map-pin"][aria-label="${taggedShopName}"]`);
      await expect(taggedPin).toHaveCount(1);
      await taggedPin.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(taggedShopName);
      const tagsList = page.getByTestId("detail-sheet-tags");
      await expect(tagsList).toBeVisible();
      const tagItems = page.getByTestId("detail-sheet-tag");
      await expect(tagItems).toHaveCount(2);
      // order昇順(tag-test-unused: order 1、tag-test-assigned: order 2)で表示される
      await expect(tagItems.nth(0)).toHaveText(TAG_UNUSED_NAME);
      await expect(tagItems.nth(1)).toHaveText(TAG_ASSIGNED_NAME);
      await page.getByTestId("detail-sheet-close").click();
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveCount(0);

      const untaggedPin = page.locator(
        `[data-testid="map-pin"][aria-label="${untaggedShopName}"]`,
      );
      await expect(untaggedPin).toHaveCount(1);
      await untaggedPin.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(untaggedShopName);
      await expect(page.getByTestId("detail-sheet-tags")).toHaveCount(0);
    } finally {
      await cleanupShop(page, taggedShopName);
      await cleanupShop(page, untaggedShopName);
    }
  });
});
