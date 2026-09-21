import { expect, test, type Page } from "@playwright/test";

/**
 * タスク3-5(モバイルUI)のE2Eテスト。
 *
 * requirements.md「3.1 公開ページ」モバイル表示の
 * 「画面下部のタブで『地図』と『動画一覧』を切り替える方式」に基づき、
 * - モバイル幅で画面下部に「地図」「動画一覧」のタブが表示され、タップで表示が
 *   切り替わること(data-activeで選択状態を検証)
 * - モバイルの「動画一覧」タブから動画をタップすると、地図タブに自動的に切り替わり、
 *   その動画で紹介された店舗のピンがハイライトされること(src/app/page.tsxの
 *   handleVideoClick)
 * - モバイルでピンをタップすると詳細シートが表示され、タブUI導入前(タスク3-2)の
 *   挙動を壊していないこと
 * - デスクトップ幅ではタブ自体が表示されない(PC表示は左サイドバー+地図のまま)こと
 * を検証する。
 *
 * 検証対象はscripts/seed.tsが投入する固定IDのデータ
 * (shop-test-published-01 / dAyChiTEST1 / visit-test-published-01)を使う。
 * このテストは動画1件・店舗1件の組み合わせの検証のみで足りるため、
 * e2e/sidebar.spec.ts等と異なり管理画面での追加データ作成は行わない
 * (モバイル幅での管理画面CRUD操作の不安定さを避けるため。CLAUDE.mdの
 * タスク3-5指示に基づく設計判断)。
 *
 * 地図タイル(外部ネットワーク依存)はe2e/public-map.spec.ts等と同様ブロックする。
 *
 * 既知の環境要因(daychi-impl調査済み。アプリのバグではない):
 * このテストはe2e/public-map.spec.ts等と同様に地図タイルリクエストを意図的に
 * ブロックしており、MapLibreがこれをAJAXErrorとしてブラウザコンソールにログ出力する。
 * `next dev`(Playwright設定上、E2Eは常にdev serverに対して実行される。
 * playwright.config.ts参照)は、ページ内で発生したコンソールエラーを検知すると
 * 開発時専用のIssuesインジケーター(画面左下に固定表示されるバッジ)を表示する仕様がある。
 * 実機検証の結果、以下を確認した:
 * - `next.config.ts` の `devIndicators: false` を設定してもこのバッジは抑制されない
 *   (Next.js 16.3.5時点)。本番ビルドにはこのインジケーター自体が含まれないため、
 *   本番環境では発生しない
 * - このバッジは画面下部・左寄りに表示され、本タスクで新設した画面下部の
 *   「地図」「動画一覧」タブ(同じく画面下部に固定表示)と画面座標上で重なる
 * - Playwrightの通常の`.click()`(要素が実際にポインタイベントを受け取れることを
 *   事前確認する)はこの重なりによりタイムアウトする。`.click({ force: true })`は
 *   事前確認こそバイパスするが、実際のマウスイベントはブラウザの実座標に基づく
 *   ヒットテストに従うため、依然としてバッジがクリックを奪ってしまいonClickが
 *   発火しない(実機検証で確認)
 * そのため、このバッジとの重なりが疑われるタブボタンのクリックのみ、
 * 下記 clickBypassingDevOverlay() で対象DOM要素の`.click()`メソッドを直接呼び出す
 * (実座標のヒットテストを経由しないため、開発用バッジの重なりに影響されず
 * 確実にReactのonClickハンドラを発火できる)。アプリ本体の実装・E2Eが検証したい挙動
 * (タブ切り替え)自体には問題がなく、クリック前後で`toBeVisible()`/`toHaveAttribute()`
 * により実際の表示状態・選択状態を厳密に検証しているため、実害の見落としにはならない。
 */
async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
}

/**
 * next devの開発用Issuesインジケーターとの画面座標の重なりを回避するため、
 * 対象要素のDOM `.click()` メソッドを直接呼び出す(上のコメント「既知の環境要因」参照)。
 * モバイルタブバー(mobile-tab-map / mobile-tab-videos)のクリックにのみ使用する。
 */
async function clickBypassingDevOverlay(locator: ReturnType<Page["getByTestId"]>): Promise<void> {
  await locator.evaluate((element) => {
    (element as HTMLElement).click();
  });
}

test.describe("モバイルUI(画面下部タブ)", () => {
  test("モバイル: 下部タブが表示され、地図⇔動画一覧の表示を切り替えられる", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル限定のタブUI検証のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();
    const mapTab = page.getByTestId("mobile-tab-map");
    const videosTab = page.getByTestId("mobile-tab-videos");
    await expect(mapTab).toBeVisible();
    await expect(videosTab).toBeVisible();

    // 初期状態は「地図」タブが選択されており、地図が見え、動画一覧は非表示
    await expect(mapTab).toHaveAttribute("data-active", "true");
    await expect(videosTab).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("public-map")).toBeVisible();
    await expect(page.getByTestId("mobile-video-list")).toBeHidden();

    // 「動画一覧」タブに切り替えると動画一覧が見え、地図は非表示になる
    await clickBypassingDevOverlay(videosTab);
    await expect(videosTab).toHaveAttribute("data-active", "true");
    await expect(mapTab).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("mobile-video-list")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeHidden();

    // 「地図」タブに戻すと元の表示に戻る
    await clickBypassingDevOverlay(mapTab);
    await expect(mapTab).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("public-map")).toBeVisible();
    await expect(page.getByTestId("mobile-video-list")).toBeHidden();
  });

  test("モバイル: 動画一覧から動画をタップすると地図タブに切り替わり該当店舗がハイライトされる", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル限定の動線検証のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await clickBypassingDevOverlay(page.getByTestId("mobile-tab-videos"));
    await expect(page.getByTestId("mobile-video-list")).toBeVisible();

    const pin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]');
    // 動画一覧タブ表示中は地図ビュー自体が非表示のため、ピンのDOM要素はhiddenだが
    // 存在はしている(PublicMapがアンマウントされないことの確認も兼ねる)
    await expect(pin).toHaveCount(1);
    await expect(pin).toHaveAttribute("data-highlighted", "false");

    const videoItem = page.locator(
      '[data-testid="mobile-video-list-item"][data-video-id="dAyChiTEST1"]',
    );
    await expect(videoItem).toBeVisible();
    await videoItem.click();

    // クリックで「地図」タブに自動的に切り替わる
    await expect(page.getByTestId("mobile-tab-map")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("mobile-tab-videos")).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("public-map")).toBeVisible();
    await expect(page.getByTestId("mobile-video-list")).toBeHidden();

    // その動画で紹介された店舗のピンがハイライトされる
    await expect(pin).toHaveAttribute("data-highlighted", "true");
  });

  test("モバイル: ピンタップで詳細シートが表示される(タブUI導入後もモバイルの挙動を壊さない)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "モバイル限定のリグレッション確認のためモバイルプロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    // 初期表示(地図タブ)のままピンをタップできる
    const pin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]');
    await expect(pin).toBeVisible();
    await pin.click();

    await expect(page.getByTestId("detail-sheet-shop-name")).toBeVisible();
    await expect(page.getByTestId("detail-sheet-shop-name")).toHaveText(
      "【テスト用】喫茶テスト 公開店",
    );
  });

  test("デスクトップ: 下部タブは表示されず、従来通り左サイドバー+地図のレイアウトである", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "デスクトップ幅でタブが出ないことの確認のためデスクトッププロジェクトのみで実施する",
    );

    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.getByTestId("mobile-tab-bar")).toBeHidden();
    await expect(page.getByTestId("video-sidebar")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();
  });
});
