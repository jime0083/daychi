import { devices } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

/**
 * 管理画面(/admin)はPC専用(requirements.md 3.2、2026-09-30決定・problem.txt P-030)。
 * 管理画面の操作でデータを作ってから公開ページをモバイル幅で確認するE2Eのために、
 * 管理画面を操作する区間だけPC幅に切り替え、公開ページの検証区間はモバイル幅
 * (chromium-mobileプロジェクトの実ビューポート)に戻すためのヘルパー。
 *
 * chromium-desktopプロジェクトの実行時はもともとPC幅のため何もしない
 * (Viewportの変更は chromium-mobile 実行時のみ行う)。
 */

/** 管理画面操作に使うPC幅(sidebar-detail-sheet-layout.spec.tsのdaychi-review再現条件と同じ値) */
const ADMIN_VIEWPORT = { width: 1280, height: 800 };

function getMobileViewport(): { width: number; height: number } {
  const viewport = devices["iPhone 13"].viewport;
  if (!viewport) {
    throw new Error("devices['iPhone 13'] にviewportが定義されていません");
  }
  return viewport;
}

/**
 * 管理画面の操作(ログイン・フォーム入力・一覧操作等)の直前に呼ぶ。
 * chromium-mobile実行時のみPC幅に切り替える。
 */
export async function useAdminViewport(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === "chromium-mobile") {
    await page.setViewportSize(ADMIN_VIEWPORT);
  }
}

/**
 * 公開ページ(/)の検証の直前に呼ぶ。chromium-mobile実行時のみ、そのプロジェクトが
 * 本来使うモバイル幅(iPhone 13相当)に戻す。
 */
export async function usePublicViewport(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === "chromium-mobile") {
    await page.setViewportSize(getMobileViewport());
  }
}
