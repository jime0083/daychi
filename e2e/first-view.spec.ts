import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  WORDMARK_BIG_FONT_FAMILY,
  WORDMARK_BIG_FONT_WEIGHT,
  WORDMARK_BIG_TEXT,
  WORDMARK_SMALL_FONT_FAMILY,
  WORDMARK_SMALL_FONT_WEIGHT,
  WORDMARK_SMALL_TEXT,
} from "@/components/brand/Wordmark";

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

/**
 * タスク8-1a(problem.txt P-033)review FAIL 1回目(2026-10-01)対応の回帰テスト用ヘルパー。
 *
 * review FAIL 1回目の指摘:
 * (1) 書体の読み込みが遅いと代替書体(フォールバック)で崩れたロゴが一瞬表示されていた
 *     (実機確認: e2e/artifacts/review-8-1a/realdelay-at-visible-1663ms.png)。
 * (2) 旧E2Eの`delayFontRequests`はファイル名に".p."を含むかどうかで遅延対象を判定していたが、
 *     実際にロゴが使うOleo Script/Vollkornの基本ラテン文字(U+0-FF)用ファイルは
 *     ".p."を含む側だった(例: 38e65f5608205462-s.p.*.woff2 = Oleo Script U+0-FF)。
 *     つまり旧実装は遅延対象を取り違えており、常に偽陰性(実際には遅延されていない)になっていた。
 *
 * この反省を踏まえ、ファイル名のパターンでの判定は一切行わず、ブラウザが実際に解決した
 * CSSの@font-faceルール(document.styleSheets)を読み、
 * 「font-familyがOleo Script/Vollkornで、unicode-rangeがロゴの文字(基本ラテン)を
 * カバーしているルール」のsrc urlだけを機械的に抽出する(findLogoFontUrls)。
 * これにより、next/fontがビルドごとに割り当てるハッシュ化ファイル名に依存せず、
 * 「ロゴの描画に実際に使われるファイル」だけを確実に特定できる。
 *
 * 抽出には、遅延を仕込む前の素のページ読み込み(書体リクエストを一切邪魔しない、
 * 専用の使い捨てブラウザコンテキスト)を1回行う。同じブラウザ内の別コンテキストを使うのは、
 * 本番のテスト対象ページ(呼び出し元のpage)のsessionStorage(ファーストビュー
 * 「タブごとに初回のみ」判定)を汚さないため(別コンテキストはストレージも完全に分離される)。
 */

/** findLogoFontUrlsが照合する対象(Wordmark.tsxが公開する実際のロゴの書体・文字と同じもの) */
const LOGO_FONT_TARGETS = [
  { family: WORDMARK_BIG_FONT_FAMILY, text: WORDMARK_BIG_TEXT },
  { family: WORDMARK_SMALL_FONT_FAMILY, text: WORDMARK_SMALL_TEXT },
];

/**
 * 素のページ読み込み(遅延なし)を1回行い、CSSの@font-faceルールのうち「ロゴが実際に使う
 * 書体ファミリーで、かつunicode-rangeがロゴの文字を全てカバーしているもの」のsrc urlを
 * 抽出する(タスク8-1a review FAIL 1回目対応。上記コメント参照)。
 *
 * 戻り値は絶対URLの配列(ページ側で`new URL(url, location.href).href`により解決済み)。
 * 呼び出し元はこのURLに対してpage.route(exact URL)で遅延/中断を仕込む。
 */
async function findLogoFontUrls(browser: Browser): Promise<string[]> {
  const discoveryContext = await browser.newContext();
  try {
    const discoveryPage = await discoveryContext.newPage();
    await discoveryPage.route("**/tiles.openfreemap.org/**", async (route) => {
      await route.abort();
    });
    await discoveryPage.goto("/", { waitUntil: "domcontentloaded" });

    const urls = await discoveryPage.evaluate((targets) => {
      function parseUnicodeRange(value: string): Array<[number, number]> {
        return value.split(",").map((token) => {
          const trimmed = token.trim().replace(/^U\+/i, "");
          const [startHex, endHex] = trimmed.split("-");
          const start = Number.parseInt(startHex, 16);
          const end = endHex !== undefined ? Number.parseInt(endHex, 16) : start;
          return [start, end];
        });
      }
      function rangesCoverText(ranges: Array<[number, number]>, text: string): boolean {
        return Array.from(text).every((char) => {
          const code = char.codePointAt(0);
          return code !== undefined && ranges.some(([start, end]) => code >= start && code <= end);
        });
      }

      const found = new Set<string>();
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          // クロスオリジン等でcssRulesにアクセスできないstylesheetは対象外(next/fontは
          // 常に同一オリジンから配信されるため、ロゴの書体を見逃すことはない)
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSFontFaceRule)) {
            continue;
          }
          const family = rule.style.getPropertyValue("font-family").replace(/^["']|["']$/g, "");
          const target = targets.find((candidate) => candidate.family === family);
          if (!target) {
            continue;
          }
          const unicodeRangeValue = rule.style.getPropertyValue("unicode-range");
          if (!unicodeRangeValue || !rangesCoverText(parseUnicodeRange(unicodeRangeValue), target.text)) {
            continue;
          }
          const src = rule.style.getPropertyValue("src");
          const match = /url\((["']?)(.*?)\1\)/.exec(src);
          if (match) {
            // CSSのurl()は「そのCSSファイル自身のURL」を基準に相対解決される(ページの
            // location.hrefではない)。next/fontの@font-faceは外部CSSファイル
            // (例: /_next/static/css/xxxx.css)に出力されるため、sheet.hrefを基準にしないと
            // 誤ったURLになる(実機確認で発覚。location.href基準だと本来存在しないパスを
            // 生成してしまい、page.routeでの遅延/中断が一切効かない偽陰性になっていた)。
            // インラインの<style>要素(sheet.hrefがnull)の場合はページ自身のURLを基準にする
            found.add(new URL(match[2], sheet.href ?? location.href).href);
          }
        }
      }
      return Array.from(found);
    }, LOGO_FONT_TARGETS);

    return urls;
  } finally {
    await discoveryContext.close();
  }
}

/**
 * findLogoFontUrlsで見つけた正確なURL群に対してのみ、リクエストを遅延(またはabort)させる。
 * ファイル名パターンでの推測は行わない(review FAIL 1回目対応。上記コメント参照)。
 */
async function delayExactUrls(page: Page, urls: readonly string[], delayMs: number): Promise<void> {
  for (const url of urls) {
    await page.route(url, async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
      await route.continue();
    });
  }
}

/** abortExactUrlsで見つけた正確なURL群へのリクエストを常に失敗させる(書体が一切届かない環境の再現) */
async function abortExactUrls(page: Page, urls: readonly string[]): Promise<void> {
  for (const url of urls) {
    await page.route(url, async (route) => {
      await route.abort();
    });
  }
}

/**
 * fontFrameSamplerInitが1フレームごとに記録するサンプル(タスク8-1a review FAIL 1回目対応)。
 * 「ロゴが見えているかどうか」と「ロゴの実書体が読み込み済みかどうか」を毎フレーム対応させて
 * 記録することで、「実書体が読み込まれていない間に1フレームでもロゴが見えていないか」
 * (review FAILの核心の再発防止)を、スクリーンショットの目視ではなく決定的に検証できる。
 */
interface FontFrameSample {
  t: number;
  /** ファーストビュー内のロゴ(Wordmark)が visibility:hidden でない(見えている)かどうか */
  wordmarkVisible: boolean;
  /** ロゴが実際に使う書体(実書体。代替書体は含まない)が読み込み済みかどうか */
  fontsLoaded: boolean;
  /** 最後の文字(P)の塗りが完全に不透明(描き終わった)かどうか */
  lastLetterFilled: boolean;
  /** ファーストビューのオーバーレイがまだDOMに存在するか */
  overlayPresent: boolean;
  /** オーバーレイがフェードアウト(closing、opacity-0クラス付与)を開始しているか */
  overlayClosing: boolean;
}

type WindowWithFontFrameLog = typeof globalThis & { __fontFrames?: FontFrameSample[] };

/** fontFrameSamplerInitに渡す引数(page.addInitScriptは単一の引数しか渡せないため1つにまとめる) */
interface FontFrameSamplerOptions {
  maxFrames: number;
  bigFamily: string;
  bigWeight: number;
  bigText: string;
  smallFamily: string;
  smallWeight: number;
  smallText: string;
}

/**
 * ナビゲーション開始直後からrequestAnimationFrameで上記FontFrameSampleを記録する
 * (page.addInitScriptで登録。既存のframeSamplerInitと同じ技法)。
 */
function fontFrameSamplerInit(options: FontFrameSamplerOptions): void {
  const { maxFrames, bigFamily, bigWeight, bigText, smallFamily, smallWeight, smallText } = options;
  const globalWithLog = window as WindowWithFontFrameLog;
  const frames: FontFrameSample[] = [];
  globalWithLog.__fontFrames = frames;

  const bigSpec = `${bigWeight} 16px "${bigFamily}"`;
  const smallSpec = `${smallWeight} 16px "${smallFamily}"`;

  function sample(): void {
    const overlay = document.querySelector('[data-testid="first-view"]');
    const wordmarkRoot = overlay?.querySelector('[role="img"][aria-label]') ?? null;
    const wordmarkVisible =
      wordmarkRoot !== null && getComputedStyle(wordmarkRoot).visibility !== "hidden";

    let fontsLoaded = false;
    try {
      fontsLoaded = document.fonts.check(bigSpec, bigText) && document.fonts.check(smallSpec, smallText);
    } catch {
      fontsLoaded = false;
    }

    let lastLetterFilled = false;
    const svg = wordmarkRoot?.querySelector("svg") ?? null;
    if (svg) {
      const tspans = Array.from(svg.querySelectorAll("g:nth-of-type(2) tspan"));
      const last = tspans[tspans.length - 1];
      lastLetterFilled = last !== undefined && getComputedStyle(last).opacity === "1";
    }

    frames.push({
      t: performance.now(),
      wordmarkVisible,
      fontsLoaded,
      lastLetterFilled,
      overlayPresent: overlay !== null,
      overlayClosing: overlay !== null && overlay.classList.contains("opacity-0"),
    });
    if (frames.length < maxFrames) {
      requestAnimationFrame(sample);
    }
  }
  requestAnimationFrame(sample);
}

/** fontFrameSamplerInitが規定フレーム数のサンプリングを終えるまで待ってから回収する */
async function collectFontFrameLog(page: Page, maxFrames: number): Promise<FontFrameSample[]> {
  await page.waitForFunction(
    (count) => {
      const frames = (window as WindowWithFontFrameLog).__fontFrames;
      return frames !== undefined && frames.length >= count;
    },
    maxFrames,
    { timeout: 20000 },
  );
  return page.evaluate(() => (window as WindowWithFontFrameLog).__fontFrames ?? []);
}

/**
 * fontFrameSamplerInitに渡す固定引数の一部(ロゴが実際に使う書体・文字。Wordmark.tsxから)。
 * maxFramesだけはテストごとに異なるため、呼び出し側でスプレッドしてmaxFramesを追加する。
 */
const FONT_FRAME_SAMPLER_BASE_OPTIONS = {
  bigFamily: WORDMARK_BIG_FONT_FAMILY,
  bigWeight: WORDMARK_BIG_FONT_WEIGHT,
  bigText: WORDMARK_BIG_TEXT,
  smallFamily: WORDMARK_SMALL_FONT_FAMILY,
  smallWeight: WORDMARK_SMALL_FONT_WEIGHT,
  smallText: WORDMARK_SMALL_TEXT,
};

/**
 * fontFrameSamplerInitでサンプリングするフレーム数(約7.5秒ぶん、60fps想定)。
 * タスク8-1aの3テストのうち最も長くかかるもの(書体が届かず約3秒であきらめて
 * フェードアウト0.3秒 ≈ 3.3秒。フルE2E実行時の並列負荷による遅れも見込む)に
 * 余裕を持たせた値。
 */
const FONT_FRAME_SAMPLE_COUNT = 450;

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

  test("書体の読み込みが多少遅れても(1.2秒)ロゴは出さずに待ち、揃ってから全15文字を書き終える(P-033・タスク8-1a review FAIL 1回目対応)", async ({
    page,
    browser,
  }) => {
    // requirements.md 3.1.1(2026-10-01決定、review FAIL 1回目を受けて再決定)
    // 「書体が届くまではロゴを表示せず背景のみで待ち、届いたら手書きアニメーションを始める」
    // の検証(a)。FONT_GIVE_UP_MS(約3秒)以内に収まる遅延なので、あきらめずに
    // アニメーションが実行される想定(src/components/brand/FirstView.tsx参照)。
    const fontUrls = await findLogoFontUrls(browser);
    expect(fontUrls.length).toBeGreaterThan(0);

    await blockMapTiles(page);
    await delayExactUrls(page, fontUrls, 1200);
    await page.addInitScript(fontFrameSamplerInit, {
      ...FONT_FRAME_SAMPLER_BASE_OPTIONS,
      maxFrames: FONT_FRAME_SAMPLE_COUNT,
    });
    // waitUntil: "domcontentloaded"にする理由はテスト(b)のコメント参照
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    await expect(firstView).toBeHidden({ timeout: 8000 });
    await expect(page.getByTestId("public-map-page")).toBeVisible();

    const frames = await collectFontFrameLog(page, FONT_FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);

    // 実書体が読み込まれる前にロゴが見えていたフレームが1つも無いこと
    // (review FAIL 1回目の核心の再発防止。代替書体のロゴを一瞬も見せない)
    expect(frames.every((frame) => !frame.wordmarkVisible || frame.fontsLoaded)).toBe(true);

    // ロゴが実際に見え始めたフレームが存在すること(=1.2秒経過後、書体読み込み完了を
    // 待ってアニメーションが始まったことの確認。一度も見えないまま終わっていないか)
    const firstVisibleFrame = frames.find((frame) => frame.wordmarkVisible);
    expect(firstVisibleFrame).toBeDefined();

    // 最後の文字(P)が塗り終わったフレームは、オーバーレイが閉じ始めるフレーム以前に
    // 存在しなければならない(= 書き終える前に地図へ切り替わらない。P-033の再発防止)
    const lastLetterFilledFrame = frames.find((frame) => frame.lastLetterFilled);
    const closingStartedFrame = frames.find((frame) => frame.overlayClosing);
    expect(lastLetterFilledFrame).toBeDefined();
    expect(closingStartedFrame).toBeDefined();
    expect(lastLetterFilledFrame!.t).toBeLessThanOrEqual(closingStartedFrame!.t);
  });

  test("書体が約3秒届かない場合、ロゴを一切見せずに地図画面へ進む(P-033・タスク8-1a review FAIL 1回目対応)", async ({
    page,
    browser,
  }) => {
    // requirements.md 3.1.1(2026-10-01決定、review FAIL 1回目を受けて再決定)
    // 「約3秒待っても届かない場合はロゴを出さずに地図画面へ進む(代替書体で崩れたロゴは
    // 一切見せない)」の検証(b)。書体のリクエストを中断(abort)し、「書体が最後まで
    // 一切届かない」環境を再現する(「3秒を超える遅延」の極端なケースとして、
    // 遅延ではなく失敗そのものを扱う)。
    //
    // waitUntil: "domcontentloaded"を指定する理由: next/fontはOleo Script/Vollkornを
    // <link rel="preload" as="font">として宣言しており、既定のwaitUntil("load")だと
    // ブラウザの"load"イベントは書体の取得完了(または失敗確定)を待ってから発火する。
    // 書体リクエストを人為的に遅延・中断しているこのテストでは、"load"を待つとpage.gotoの
    // resolveそのものが遅れてしまい、その間にFirstView側の独立したタイマー(約3秒の
    // あきらめ→フェードアウト0.3秒で遷移)が先に完了してしまい、page.goto解決後に
    // オーバーレイを観測しようとしても既に閉じた後、という実機確認した事象が起きる
    // (実際のユーザー体験には影響しない。ブラウザの"load"イベント発火を待たずとも
    // ページは早期にインタラクティブになり、FirstViewはhydration後すぐ独立して動作するため)。
    // そのためこのテストでは"domcontentloaded"で早めにgotoを解決し、以降は実際の表示状態を
    // 条件ポーリング・フレーム計測で確認する。
    const fontUrls = await findLogoFontUrls(browser);
    expect(fontUrls.length).toBeGreaterThan(0);

    await blockMapTiles(page);
    await abortExactUrls(page, fontUrls);
    await page.addInitScript(fontFrameSamplerInit, {
      ...FONT_FRAME_SAMPLER_BASE_OPTIONS,
      maxFrames: FONT_FRAME_SAMPLE_COUNT,
    });
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    // 「約3秒」で地図画面へ進むこと(待たせすぎない)。上限は、本spec全体やフルE2E実行時の
    // 並列実行によるCPU競合でタイマーの発火が後ろ倒しになる余地を見込み、理論値
    // (FONT_GIVE_UP_MS 3000ms + FADE_OUT_MS 300ms ≈ 3.3秒)より十分広めの6秒とする
    // (実機確認: 単独実行時は約4秒、フルspec実行時の並列負荷下では4.5秒を超えることがあった)
    await expect(firstView).toBeHidden({ timeout: 6500 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(6000);
    // あきらめる前(FONT_GIVE_UP_MS)の3秒を待たずに即座に切り替わってしまっていないことも
    // 確認する(= 書体の読み込みを試みる前に即座にあきらめていないか)
    expect(elapsed).toBeGreaterThan(2500);
    await expect(page.getByTestId("public-map-page")).toBeVisible();

    const frames = await collectFontFrameLog(page, FONT_FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);

    // 計測した全フレームを通じて、ロゴが一度も見えていないこと(review FAIL 1回目の
    // 「代替書体のロゴを一瞬も見せない」要件の再発防止。書体が最後まで届かない場合、
    // 動きを減らす設定かどうかに関わらずロゴ自体を一切表示しない)
    expect(frames.some((frame) => frame.wordmarkVisible)).toBe(false);
  });

  test("ロゴの実書体が未読み込みの間は1フレームも表示されない(通常の読み込み速度、P-033・タスク8-1a review FAIL 1回目対応)", async ({
    page,
  }) => {
    // 検証(c): 書体の読み込みを人為的に遅延させない通常の速度でも、
    // 「ロゴが見えている」かつ「実書体が未読み込み」のフレームが1つも無いことを
    // 決定的に検証する(人為的な遅延を伴うテスト(a)(b)だけでなく、通常の読み込み速度
    // でも同じ不変条件が常に成り立つことを確認する)。
    await blockMapTiles(page);
    await page.addInitScript(fontFrameSamplerInit, {
      ...FONT_FRAME_SAMPLER_BASE_OPTIONS,
      maxFrames: FONT_FRAME_SAMPLE_COUNT,
    });
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    await expect(firstView).toBeHidden({ timeout: 6000 });
    await expect(page.getByTestId("public-map-page")).toBeVisible();

    const frames = await collectFontFrameLog(page, FONT_FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => !frame.wordmarkVisible || frame.fontsLoaded)).toBe(true);
    // 通常の読み込み速度では実際にロゴが見える瞬間まで到達していること
    // (常にfalseのまま検証が無意味になっていないかの前提確認)
    expect(frames.some((frame) => frame.wordmarkVisible)).toBe(true);
  });

  test("動きを減らす設定では、実書体が揃ってから完成形を表示し約3秒で切り替わる(coordinator指摘対応、2026-10-02)", async ({
    page,
  }) => {
    // requirements.md 3.1.1・タスク7-2「動きを減らす設定の利用者には完成形を表示し、
    // 約3秒(またはタップ)で地図画面へ切り替える」の検証。タスク8-1a当初の実装は
    // 「書体が揃ってから一律0.7秒」に短縮してしまっていたため、「マウントから約3秒
    // (書体がすぐ揃った通常のケース)」を維持できているかを決定的に検証する
    // (src/components/brand/FirstView.tsxのHOLD_AFTER_LOGO_MSコメント参照)。
    //
    // 書体の読み込みを人為的に遅延させない(通常の速度で検証する。書体を遅延させた場合の
    // 「揃うのが遅ければ揃ってから最低0.7秒は見せる」側の挙動はテスト(a)の
    // reducedMotion版として別途検証するまでもなく、上記のmax()の数式そのものが
    // FirstView.tsxに実装されていることのコメント・コードレビューで確認済み)。
    await page.emulateMedia({ reducedMotion: "reduce" });
    await blockMapTiles(page);
    await page.addInitScript(fontFrameSamplerInit, {
      ...FONT_FRAME_SAMPLER_BASE_OPTIONS,
      maxFrames: FONT_FRAME_SAMPLE_COUNT,
    });
    const start = Date.now();
    await page.goto("/");

    const firstView = page.getByTestId("first-view");
    await expect(firstView).toBeVisible();
    // 「約3秒(動きを減らす設定でもフェードアウトを含め概ね3.3秒)」で切り替わること。
    // 並列実行時のCPU競合による遅延マージンを考慮し、上限は広めに取る
    await expect(firstView).toBeHidden({ timeout: 6500 });
    const elapsed = Date.now() - start;
    // 書体が揃うのを待たずに即座に(アニメーション版のように数百ms等で)切り替わって
    // しまっていないこと(= 要件「約3秒」が短縮されていないことの再発防止)
    expect(elapsed).toBeGreaterThan(2500);
    expect(elapsed).toBeLessThan(6000);
    await expect(page.getByTestId("public-map-page")).toBeVisible();

    const frames = await collectFontFrameLog(page, FONT_FRAME_SAMPLE_COUNT);
    expect(frames.length).toBeGreaterThan(0);

    // 代替書体のロゴを一瞬も見せない(review FAIL 1回目の要件は動きを減らす設定でも同様)
    expect(frames.every((frame) => !frame.wordmarkVisible || frame.fontsLoaded)).toBe(true);
    // 実際にロゴ(完成形)が見える瞬間まで到達していること
    expect(frames.some((frame) => frame.wordmarkVisible)).toBe(true);

    // 動きを減らす設定では描画アニメーションを再生しない(見えた直後から完成形=
    // 最後の文字まで塗られた状態)ことの確認: ロゴが最初に見えたフレームで、
    // 最後の文字(P)も既に塗り終わっていること
    const firstVisibleFrame = frames.find((frame) => frame.wordmarkVisible);
    expect(firstVisibleFrame).toBeDefined();
    expect(firstVisibleFrame!.lastLetterFilled).toBe(true);
  });
});
