import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, deleteDoc, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

import { clickMapPinWithZoom } from "./support/pin-click";

/**
 * タスク6-1b(P-023再発・P-025)のE2Eテスト。
 *
 * problem.txt P-023/P-025の調査で、店舗が広範囲(実測では60〜90km以上)に分散している
 * 状態でfitBoundsが大きくズームアウトすると、実距離では数km程度しか離れていない
 * 別の店舗どうしのMarker要素が画面上で重なり、DOM描画順で手前にある側がクリックを
 * 奪ってしまう(=狙った店舗と異なる店舗が開いてしまう)ことを特定した。
 *
 * requirements.md「3.1 公開ページ」の2026-09-26決定により、この重なり自体はアプリの
 * 仕様どおりの挙動(一般的な地図と同じくそのまま重ねて表示し、手前のピンが押される。
 * 利用者が拡大すれば分かれる。まとめ表示(クラスタリング)は行わない)であり、
 * PublicMap.tsxのクリック判定は変更しない。
 *
 * そのためこのE2Eは、東京〜大阪程度(約400km)離れた店舗が同時に公開されている状態でも、
 * (1) 全てのピンが地図コンテナ内に表示される(コンテナからはみ出さない)こと、
 * (2) 実際の利用者と同じように地図を拡大すれば、元々近接している seed店舗どうし
 *     (shop-test-published-01・shop-test-published-import-01。実距離約6km)を含む
 *     全てのピンをそれぞれ正しくクリックでき、正しい店舗の詳細シートが開くこと
 * を検証する(店舗近接を前提にしない)。
 *
 * このテストが動的に作成するのはこのテスト専用の店舗1件のみ(他specの共有シード
 * shop-test-published-01・shop-test-published-import-01は読み取り専用で使う。P-018)。
 * 後片付けはtry/finally内でFirestore直接削除により行う(admin-import-existing-shop.spec.ts
 * ・tags-crud.spec.tsと同じ@firebase/rules-unit-testing方式)。
 *
 * ピンのクリックには通常のlocator.click()(Playwrightの操作可能性チェックあり)を使う
 * ヘルパー(./support/pin-click.ts)を使う。force:trueや固定時間の待機は使わない。
 * 詳細はヘルパー内のコメントを参照。
 */

// scripts/seed.ts の SEED_PROJECT_ID / playwright.config.ts の E2E_EMULATOR_PROJECT_ID と一致
const EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

// scripts/seed.ts が投入する既存published店舗(読み取り専用で使う。書き換えない)
const SEED_SHOP_NEAR_A = "shop-test-published-01"; // 35.6938, 139.7536(東京都千代田区付近)
const SEED_SHOP_NEAR_B = "shop-test-published-import-01"; // 35.658, 139.7016(SEED_SHOP_NEAR_Aから実距離約6km)

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

// 大阪駅付近の座標(東京都心から実距離約400km)。このテスト専用の一時店舗の位置に使う。
// chromium-desktop/chromium-mobileの各プロジェクトが同じspecファイルを並列実行する
// (--repeat-eachでの同一spec多重実行も含む)ため、testIdから決定的なジッター
// (緯度経度それぞれ±2度、最大約220km)を加え、同時にpublishされる自分自身の
// 遠方店舗どうしが同一座標付近で重ならないようにする。ジッター後も東京(北緯35度台)からは
// 十分離れた位置になり、「東京〜大阪程度離れた店舗」という検証意図は変わらない
function distantLocationFor(testId: string): { lat: number; lng: number } {
  const latOffset = ((hashString(`${testId}:lat`) % 4000) / 1000) - 2; // -2以上2未満
  const lngOffset = ((hashString(`${testId}:lng`) % 4000) / 1000) - 2; // -2以上2未満
  return { lat: 34.7024 + latOffset, lng: 135.4959 + lngOffset };
}

async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
}

async function withDistantShop<T>(
  shopId: string,
  name: string,
  location: { lat: number; lng: number },
  fn: () => Promise<T>,
): Promise<T> {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: {
      rules: readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
  });
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const now = Timestamp.now();
      await setDoc(doc(context.firestore(), "shops", shopId), {
        name,
        address: `【E2Eテスト】6-1b遠方店舗住所 ${shopId}`,
        businessHours: "",
        infoAsOf: now,
        location,
        closed: false,
        tagIds: [],
        status: "published",
        createdAt: now,
        updatedAt: now,
      });
    });
    return await fn();
  } finally {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), "shops", shopId));
    });
    await testEnv.cleanup();
  }
}

/** 指定した店舗IDのピンが地図コンテナの矩形に完全に収まっていることを検証する */
async function expectPinContainedInMapContainer(page: Page, shopId: string): Promise<void> {
  const pin = page.locator(`[data-testid="map-pin"][data-shop-id="${shopId}"]`);
  await expect(pin).toHaveCount(1);
  const container = page.getByTestId("public-map");
  const [pinBox, containerBox] = await Promise.all([pin.boundingBox(), container.boundingBox()]);
  expect(pinBox, `${shopId}のピンのboundingBoxが取得できません`).not.toBeNull();
  expect(containerBox, "地図コンテナのboundingBoxが取得できません").not.toBeNull();
  if (pinBox === null || containerBox === null) {
    return;
  }
  expect(pinBox.y, `${shopId}のピン上端が地図コンテナの上端より上にはみ出しています`).toBeGreaterThanOrEqual(
    containerBox.y,
  );
  expect(
    pinBox.y + pinBox.height,
    `${shopId}のピン下端が地図コンテナの下端より下にはみ出しています`,
  ).toBeLessThanOrEqual(containerBox.y + containerBox.height);
  expect(pinBox.x, `${shopId}のピン左端が地図コンテナの左端より左にはみ出しています`).toBeGreaterThanOrEqual(
    containerBox.x,
  );
  expect(
    pinBox.x + pinBox.width,
    `${shopId}のピン右端が地図コンテナの右端より右にはみ出しています`,
  ).toBeLessThanOrEqual(containerBox.x + containerBox.width);
}

/**
 * 指定した店舗IDのピンについて、地図コンテナ内に表示されていることを確認したうえで、
 * (重なっていれば地図を拡大してから)クリックすると、その店舗自身の詳細シートが開くことを
 * 検証する。他のピンとの重なりの影響を受けないよう、呼び出しごとに公開ページを再読み込みし、
 * 全店舗が収まる初期のfitBounds状態からやり直す
 */
async function expectPinContainedAndOpensOwnDetailSheet(page: Page, shopId: string): Promise<void> {
  await blockMapTiles(page);
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expectPinContainedInMapContainer(page, shopId);

  const pin = page.locator(`[data-testid="map-pin"][data-shop-id="${shopId}"]`);
  const expectedName = await pin.getAttribute("aria-label");
  expect(expectedName, `${shopId}のピンにaria-labelがありません`).not.toBeNull();

  await clickMapPinWithZoom(page, pin);

  await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(expectedName ?? "");
  await page.getByTestId("detail-sheet-close").click();
  await expect(page.getByTestId("detail-sheet-shop-name")).toHaveCount(0);
}

test.describe("店舗が広範囲に分散していてもピンが正しくクリックできる(タスク6-1b・P-023再発/P-025)", () => {
  test("東京〜大阪程度(約400km)離れた店舗を含む状態でも、近接するseed店舗どうしを含む全ピンが地図コンテナ内に表示され、拡大すればそれぞれ正しい店舗のピンとしてクリックできる", async ({
    page,
  }, testInfo) => {
    // 3店舗それぞれについて公開ページの再読み込み+(必要なら)地図の拡大を行うため、
    // 既定の30秒では並列実行時の負荷次第で不足することがある
    testInfo.setTimeout(120_000);
    const testId = uniqueTestId("e2e-distant-shop");
    const distantShopId = `e2e-distant-shop-${testId}`;
    const distantShopName = `【E2Eテスト】6-1b遠方店舗 ${testId}`;

    await withDistantShop(distantShopId, distantShopName, distantLocationFor(testId), async () => {
      const targetShopIds = [SEED_SHOP_NEAR_A, SEED_SHOP_NEAR_B, distantShopId];

      // 店舗ごとに公開ページを開き直し(全店舗が収まる初期状態から)、
      // ピンが地図コンテナ内に表示されていること、拡大すれば正しい店舗としてクリックできることを
      // 検証する(近接するSEED_SHOP_NEAR_AとSEED_SHOP_NEAR_Bが画面上で重なっていても、
      // 利用者と同じく地図を拡大すれば分離してクリックできることを確認する)
      for (const shopId of targetShopIds) {
        await expectPinContainedAndOpensOwnDetailSheet(page, shopId);
      }
    });
  });
});
