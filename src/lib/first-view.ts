/**
 * ファーストビュー(タスク7-2)の表示制御に使う小さな純粋関数群。
 *
 * requirements.md 3.1.1「デザイン・ファーストビュー」の
 * - 「表示はブラウザのタブごとに初回のみ(同じタブでの再読み込みでは表示しない)」
 * - 「動きを減らす設定(prefers-reduced-motion)の利用者にはアニメーションなしで表示する」
 * に対応する。
 *
 * sessionStorage/matchMediaはブラウザAPIであり、テスト環境(Node/Vitest)やプライベート
 * モード等の一部環境ではアクセス自体が例外を投げることがあるため、すべてtry/catchで包み、
 * 失敗時は要件上許容されている安全側のフォールバック値を返す(requirements.mdの
 * 「storageが使えない環境でも落ちないこと(その場合は毎回表示でよい)」に対応)。
 */

/**
 * sessionStorageのキー。layout.tsxのブロッキングスクリプト(タスク7-2 FAIL修正)・
 * e2e/support/first-view.tsからも同じ値を使うため、ここからimportして使うこと
 * (値を複数箇所にハードコードしない)。
 */
export const FIRST_VIEW_STORAGE_KEY = "daychi-first-view-seen";
const STORAGE_KEY = FIRST_VIEW_STORAGE_KEY;

/** このタブでファーストビューを既に表示したかどうか */
export function hasSeenFirstView(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** このタブでファーストビューを表示したことを記録する(以後の再読み込みでは表示しない) */
export function markFirstViewSeen(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // storageが使えない環境は毎回表示になるが、要件上許容されているため無視してよい
  }
}

/** 動きを減らす設定(prefers-reduced-motion: reduce)が有効かどうか */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
