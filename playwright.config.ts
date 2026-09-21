import { defineConfig, devices } from "@playwright/test";

/**
 * Daychi COFFEE MAP の E2E テスト設定(タスク1-6: Playwright E2E基盤)。
 *
 * `npm run e2e` を実行するだけで以下が自動的に立ち上がってからテストが実行される
 * (手動で別ターミナルを開く必要はない)。
 *   1. Firebase Emulator Suite (firestore:8080 / auth:9099 / UI:4000)
 *   2. シードデータ投入(globalSetup。Emulatorの起動完了を待ってから実行される)
 *   3. Next.js dev server (NEXT_PUBLIC_USE_EMULATOR=true でEmulatorに接続)
 *
 * Playwrightは `webServer` を配列で指定した場合、配列の要素を「1つ目の起動完了を
 * 待ってから2つ目を起動する」という順序で処理し、globalSetupはその後(=全webServer
 * 起動完了後)に実行される。そのためEmulator起動完了の待ち合わせを自前で
 * ポーリング実装する必要がない(タイミング制御はPlaywright本体に任せる)。
 *
 * テスト失敗時のスクリーンショット・トレース・HTMLレポートは、Gitで管理しない
 * e2e/artifacts/ 配下(.gitignore済み)に保存する。
 */

const DEV_SERVER_PORT = 3000;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;
// Firebase Emulator UIは、firestore/auth両エミュレータの起動が完了した後にのみ
// 応答可能になる(手元検証済み)。そのためEmulator起動完了の判定に使う。
const EMULATOR_UI_URL = "http://127.0.0.1:4000/";
// scripts/seed.ts の SEED_PROJECT_ID と一致させる固定値(P-010対応)。
// dev server起動時にこの値を明示することで、Next.jsが自動読込する .env.local に
// 別のprojectIdが設定されていても、E2Eは常にseedデータと同じEmulator名前空間へ
// 接続する(webServer.envはprocess.env/.env.localより優先される)。
const E2E_EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "./e2e/artifacts/html-report", open: "never" }]],
  use: {
    // webServerを配列指定する場合、baseURLは明示設定が必須(Playwrightの仕様)
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: [
    {
      // Firebase Emulator Suite(firestore + auth)。
      // firebase.json / npm run emulator と同じ構成で起動する
      command: "npm run emulator",
      url: EMULATOR_UI_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      // 既定(SIGKILL)だと、firebase-tools配下のJava製Firestore Emulator子プロセスが
      // (別プロセスグループのため)終了シグナルを受け取れずポート残留する。
      // SIGINTでfirebase-tools自身の正常終了処理(子プロセスの後始末)を発火させる
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
    },
    {
      // Next.js dev server。Emulatorに接続するため NEXT_PUBLIC_USE_EMULATOR=true を付与する
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_USE_EMULATOR: "true",
        // seedデータと同じEmulator名前空間に固定接続するため明示する(P-010対応)。
        // .env.local 等の外部設定に本番projectIdが入っていてもこちらが優先される
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: E2E_EMULATOR_PROJECT_ID,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Phase 3(モバイルUI)の検証で使用するモバイルビューポート(iPhone相当)プロジェクト。
      // 導入済みブラウザはChromiumのみのため、iPhoneのビューポート/UA/タッチ特性を
      // Chromiumのモバイルエミュレーション機能(isMobile/hasTouch)で再現する
      // (WebKit実体を起動するわけではない)
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
});
