import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Playwright globalSetup(タスク1-6: Playwright E2E基盤)。
 *
 * playwright.config.ts の `webServer`(Firebase Emulator Suite → Next.js dev server の順)
 * が全て起動完了した後にPlaywrightが自動的に呼び出す。そのためここでは追加の
 * ポーリングをせず、Emulatorへのシード投入(npm run seed)をそのまま実行できる。
 *
 * シード投入(scripts/seed.ts)は固定IDへの setDoc() による冪等な処理のため、
 * テストを何度実行してもEmulator上のデータは同じ内容になる(flaky防止)。
 */
export default async function globalSetup(): Promise<void> {
  try {
    const { stdout, stderr } = await execAsync("npm run seed");
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
  } catch (error) {
    // シード投入失敗時はテストを開始せず、原因(scripts/seed.tsの出力)を
    // そのままエラーとして表面化させる
    throw new Error(`E2E用シードデータの投入に失敗しました: ${String(error)}`);
  }
}
