import { expect, test, type Page } from "@playwright/test";

/**
 * タスク7-2(ファーストビュー)のE2Eテスト。
 *
 * requirements.md 3.1.1「デザイン・ファーストビュー」に基づき、以下を検証する:
 * - 公開ページ(/)を初めて開いたとき、地図の前にファーストビュー(ロゴ「DayChi COFFEE MAP」+
 *   「タップでスキップ」の案内)が表示されること
 * - 約3秒後に自動的にファーストビューが消え、地図画面(公開ページ本体)が使えること
 * - 画面をクリックすると、3秒を待たずに即座にファーストビューが消えること
 * - 同じタブでの再読み込み(reload)ではファーストビューが表示されないこと
 * (sessionStorageによる「タブごとに初回のみ」判定。src/lib/first-view.ts)
 *
 * これらの検証は「初回表示を確認する」ことが目的のため、他specで使う
 * e2e/support/first-view.tsのskipFirstView()はここでは使わない(意図的に使わない唯一のspec)。
 * PC(chromium-desktop)・モバイル(chromium-mobile)の両プロジェクトで実行する
 * (test.skipで特定プロジェクトを除外しない)。
 *
 * 地図タイル(外部ネットワーク依存)は他specと同様ブロックする
 * (ファーストビューの裏側で地図の読み込みが進んでも、タイル取得自体はE2Eの決定性に
 * 影響させたくないため)。
 *
 * 待ち合わせは固定待ち(waitForTimeout等)を使わず、常に「ファーストビューが消える
 * (非表示になる)こと」を条件にポーリングする(expect().toBeHidden()/toBeVisible())。
 *
 * review FAIL 1回目(2026-10-01)のフリッカー(初回アクセス時、JS読み込み前の生HTMLの
 * 時点でオーバーレイが存在せず、数フレームだけ背景の公開ページが透けて見えていた問題)の
 * 回帰テストとして、page.addInitScript + requestAnimationFrameでナビゲーション開始直後
 * からのフレームを記録し、「初回アクセスで1フレームも背景が見えないこと」
 * 「再読み込みで1フレームもオーバーレイが見えないこと」を決定的に検証するテストを追加した
 * (frameSamplerInit/collectFrameLog参照)。
 */
async function blockMapTiles(page: Page): Promise<void> {
  await page.route("**/tiles.openfreemap.org/**", async (route) => {
    await route.abort();
  });
}

/** 1フレームぶんのサンプル(frameSamplerInitが画面中央の最前面要素を記録したもの) */
interface FirstViewFrameSample {
  t: number;
  overlayCoversCenter: boolean;
}

/** frameSamplerInitがwindowに生やすプロパティの型(page.evaluate/addInitScript内で使う) */
type WindowWithFrameLog = typeof globalThis & { __firstViewFrames?: FirstViewFrameSample[] };

/**
 * review FAIL 1回目(フリッカー)対応の回帰テスト用フレーム計測(タスク7-2)。
 *
 * page.addInitScriptでドキュメント生成前に注入し、requestAnimationFrameで画面中央の
 * 最前面要素(document.elementFromPoint)を毎フレーム記録する。ファーストビューの
 * オーバーレイ(#DADADA背景、position:fixed inset:0)が実際に描画されていれば、
 * 画面中央はそのオーバーレイ自身(またはその子孫)が最前面になるはずである。
 * 「初回アクセスで1フレームも背景(オーバーレイに覆われていない状態)が見えないこと」
 * 「再読み込みで1フレームもオーバーレイが見えないこと」を、スクリーンショットの
 * 目視ではなく決定的に検証するために使う。
 *
 * ページ側スクリプトの読み込み・hydrationのタイミングに左右されず、ナビゲーション開始
 * 直後(=ブラウザが最初に何かを描画しうる最初の機会)からサンプリングを開始できるのが
 * addInitScriptを使う利点(通常のpage.evaluateはナビゲーション完了後にしか実行できない)。
 */
function frameSamplerInit(maxFrames: number): void {
  const globalWithLog = window as WindowWithFrameLog;
  const frames: FirstViewFrameSample[] = [];
  globalWithLog.__firstViewFrames = frames;

  function sample(): void {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const topElement = document.elementFromPoint(x, y);
    const overlay = document.querySelector('[data-testid="first-view"]');
    const overlayCoversCenter =
      topElement !== null &&
      overlay !== null &&
      (topElement === overlay || overlay.contains(topElement));
    frames.push({ t: performance.now(), overlayCoversCenter });
    if (frames.length < maxFrames) {
      requestAnimationFrame(sample);
    }
  }
  requestAnimationFrame(sample);
}

/** frameSamplerInitが規定フレーム数のサンプリングを終えるまで待ってから回収する */
async function collectFrameLog(page: Page, maxFrames: number): Promise<FirstViewFrameSample[]> {
  await page.waitForFunction(
    (count) => {
      const frames = (window as WindowWithFrameLog).__firstViewFrames;
      return frames !== undefined && frames.length >= count;
    },
    maxFrames,
    { timeout: 15000 },
  );
  return page.evaluate(() => (window as WindowWithFrameLog).__firstViewFrames ?? []);
}

/** サンプリングしたフレーム数(約4秒ぶん。オーバーレイの表示期間(約3.3秒)+余裕を含む) */
const FRAME_SAMPLE_COUNT = 240;

test.describe("ファーストビュー(タスク7-2)", () => {
  test("初回アクセスでロゴと「タップでスキップ」の案内が表示される", async ({ page }) => {
    await blockMapTiles(page);
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    // requirements.md「ロゴに『DayChi COFFEE MAP』のアクセシブルな名前」
    await expect(firstView.getByRole("img", { name: "DayChi COFFEE MAP" })).toBeVisible();
    await expect(page.getByTestId("first-view-skip-hint")).toHaveText("タップでスキップ");

    // 裏側の地図画面(Home本体)は表示されていない状態でもDOM上には既に存在し、
    // 読み込みが進んでいる(requirements.md「ファーストビュー表示中も地図画面はその裏で
    // 読み込んでおく」)。見えている(可視)のはファーストビューのみであることを確認する
    await expect(page.getByTestId("public-map-page")).toBeAttached();
  });

  test("約3秒後に自動的にファーストビューが消え、地図画面が表示される", async ({ page }) => {
    await blockMapTiles(page);
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();

    // AUTO_ADVANCE_MS(3000ms)+フェードアウト(300ms)後にDOMから外れる。
    // 固定待ちではなく「消えること」自体を条件にポーリングする
    await expect(firstView).toBeHidden({ timeout: 6000 });

    // 地図画面(公開ページ本体)が使える状態になっていることを確認する
    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();
    const publishedPin = page.locator(
      '[data-testid="map-pin"][data-shop-id="shop-test-published-01"]',
    );
    await expect(publishedPin).toHaveCount(1);
  });

  test("画面をクリックすると3秒を待たずに即座に地図画面へ切り替わる", async ({ page }) => {
    await blockMapTiles(page);
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();

    await firstView.click();

    // 自動遷移(3000ms)よりはるかに早く消えることを確認する(=クリックで即座に遷移したこと
    // の証明。自動タイマーによる遷移との混同を避けるため、3秒より十分小さいタイムアウトにする)
    await expect(firstView).toBeHidden({ timeout: 1500 });
    await expect(page.getByTestId("public-map-page")).toBeVisible();
  });

  test("キーボード操作(Escape)でも即座に地図画面へ切り替わる", async ({ page }) => {
    await blockMapTiles(page);
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(firstView).toBeHidden({ timeout: 1500 });
    await expect(page.getByTestId("public-map-page")).toBeVisible();
  });

  test("初回アクセスで1フレームも背景(公開ページ)が見えない(review FAIL 1回目の回帰テスト)", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await page.addInitScript(frameSamplerInit, FRAME_SAMPLE_COUNT);
    await page.goto("/");

    // ファーストビューが自動遷移で消えるところまで実際に進める
    await expect(page.getByTestId("first-view")).toBeHidden({ timeout: 6000 });

    const frames = await collectFrameLog(page, FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);

    // オーバーレイが最後に画面中央を覆っていたフレームを探す(見つからなければこの検証の
    // 前提が崩れている=そもそもオーバーレイが一度も表示されていないため、その場合も失敗させる)
    const lastCoveredIndex = frames.reduce(
      (acc, frame, index) => (frame.overlayCoversCenter ? index : acc),
      -1,
    );
    expect(lastCoveredIndex).toBeGreaterThanOrEqual(0);

    // オーバーレイが最終的に画面中央を覆わなくなるまでの間(=まだ表示されているべき区間)は、
    // 1フレームも欠けることなく画面中央を覆っていたことを確認する(review FAIL 1回目は
    // ここが一部false=背景の文字が透けて見える状態だった)
    const framesBeforeHandoff = frames.slice(0, lastCoveredIndex + 1);
    expect(framesBeforeHandoff.every((frame) => frame.overlayCoversCenter)).toBe(true);
  });

  test("同じタブでの再読み込みでは1フレームもファーストビューが表示されない(review FAIL 1回目の回帰テスト)", async ({
    page,
  }) => {
    await blockMapTiles(page);
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    await firstView.click();
    await expect(firstView).toBeHidden({ timeout: 1500 });

    // sessionStorageに「表示済み」が記録された状態で、フレーム計測を仕込んでから再読み込みする
    await page.addInitScript(frameSamplerInit, FRAME_SAMPLE_COUNT);
    await page.reload();
    await expect(page.getByTestId("public-map-page")).toBeVisible();

    const frames = await collectFrameLog(page, FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);
    // 再読み込みでは、計測した全フレームを通じて一度もオーバーレイが画面中央を
    // 覆わない(=表示されない)ことを確認する
    expect(frames.some((frame) => frame.overlayCoversCenter)).toBe(false);
  });

  test("タスク8-1: 1文字ずつ描かれる手書きアニメーションの経過をスクリーンショットで記録する", async ({
    page,
  }, testInfo) => {
    // requirements.md 3.1.1(2026-10-01変更)「1文字ずつ順番に書いていく」の実装(タスク8-1)が
    // 実際に時間をかけて1文字ずつ描かれていく様子を目視確認できるようにするための証跡テスト。
    // 指定された経過時間(0.2/0.5/0.9/1.4/1.9/2.4秒)ごとにスクリーンショットを撮り、
    // e2e/artifacts/impl-8-1/ へ保存する(daychi-reviewの確認観点の1つ)。
    //
    // この経過時間は「ある時点の見た目を記録する」こと自体が目的(アプリ側の状態遷移を
    // 条件にポーリングできる類のものではなく、時間経過それ自体を観察する)であるため、
    // 他のspecのように状態変化をexpect().toBeVisible()等でポーリングする方式は使えない。
    // そのため、記録済みの基準時刻(start)からの残り時間をwaitForTimeoutで待つ
    // (他specで禁止している「状態変化の確認を怠るための固定待ち」ではなく、
    // 「決まった経過時間時点の見た目を記録する」というこのテスト固有の目的に対応する待機)。
    await blockMapTiles(page);
    const start = Date.now();
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();

    const captureTimesMs = [200, 500, 900, 1400, 1900, 2400];
    for (const targetMs of captureTimesMs) {
      const remaining = targetMs - (Date.now() - start);
      if (remaining > 0) {
        await page.waitForTimeout(remaining);
      }
      // requirements.md「書き終わるまで約2.3秒、全体で約3秒で地図画面へ」の範囲内
      // (captureTimesMsの最大値2400ms時点)では、まだファーストビューが表示中であるはずである
      await expect(firstView).toBeVisible();
      await page.screenshot({
        path: `e2e/artifacts/impl-8-1/frame-${targetMs}ms-${testInfo.project.name}.png`,
        fullPage: false,
      });
    }
  });

  test("同じタブでの再読み込みではファーストビューが表示されない", async ({ page }) => {
    await blockMapTiles(page);
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    // 1回目の表示をクリックでスキップし、sessionStorageへ「表示済み」が記録された状態にする
    await firstView.click();
    await expect(firstView).toBeHidden({ timeout: 1500 });

    // 同じタブでリロードすると、地図画面が表示されるまでの間も含めて
    // ファーストビューは一度も表示されない(sessionStorageは同一タブのリロードでは
    // クリアされないため)
    const reloadResponse = await page.reload();
    expect(reloadResponse?.ok()).toBe(true);
    await expect(page.getByTestId("public-map-page")).toBeVisible();
    await expect(page.getByTestId("public-map")).toBeVisible();
    await expect(firstView).toHaveCount(0);
  });
});
