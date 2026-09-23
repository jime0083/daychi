/**
 * AI抽出パイプライン共通のエラー型(タスク4-3e、P-017対応)。
 *
 * gemini-adapter.ts(サーバー専用。GEMINI_API_KEYを扱う)と、
 * src/lib/admin-import-client.ts・src/app/admin/import/page.tsx(クライアント)の
 * 両方から参照するため、値そのものは秘密情報を持たない独立ファイルとして分離する
 * (「@/lib/ai-extraction/gemini-adapter」を直接クライアントからimportしないための設計。
 * 既存のADMIN_IMPORT_CLIENTが type-only importでサーバー専用モジュールを避けているのと
 * 同じ考え方)。
 */

/** Gemini無料枠の1日あたり上限(RPD)を使い切った場合のエラーコード */
export const GEMINI_DAILY_QUOTA_EXCEEDED_CODE = "GEMINI_DAILY_QUOTA_EXCEEDED" as const;

/**
 * Geminiの1日あたり無料枠を使い切った場合に投げる専用エラー(problem.txt P-017)。
 * 通常の一時的エラー(429の短時間制限・5xx・通信失敗)とは異なり、当日中は再試行しても
 * 回復しないため、呼び出し側(取り込み画面)は残りの選択動画の処理を中止すべきことを示す。
 */
export class GeminiDailyQuotaExceededError extends Error {
  readonly code = GEMINI_DAILY_QUOTA_EXCEEDED_CODE;

  constructor(message: string) {
    super(message);
    this.name = "GeminiDailyQuotaExceededError";
  }
}
