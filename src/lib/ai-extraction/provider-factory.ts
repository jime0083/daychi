/**
 * AI抽出プロバイダのファクトリ(タスク4-3)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「既定は無料枠の Google Gemini API」「Claude API アダプタは実装するが実行は保留
 * (APIキー設定+明示的な選択時のみ動作。既定では呼ばれない)」に対応する。
 *
 * 環境変数 AI_PROVIDER で切替える(既定 "gemini")。"claude" を明示的に指定した場合のみ
 * Claudeアダプタを生成する。それ以外の値・未設定の場合はGeminiアダプタを生成する
 * (Claudeアダプタのモジュール自体は import されるが、インスタンス化・呼び出しは
 * AI_PROVIDER="claude" を明示した場合にしか行われない)。
 */
import { createClaudeExtractionProvider } from "./claude-adapter";
import { createGeminiExtractionProvider } from "./gemini-adapter";
import type { ExtractionProvider } from "./types";

/** getExtractionProvider に渡せるオプション(すべて省略可能) */
export interface GetExtractionProviderOptions {
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む(AI_PROVIDERを参照する) */
  env?: NodeJS.ProcessEnv;
}

function readEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

/**
 * 環境変数 AI_PROVIDER の値に応じた抽出プロバイダを返す。
 * "claude"(大文字小文字を区別しない)を明示的に指定した場合のみClaudeアダプタを返し、
 * それ以外(未設定・"gemini"・不明な値)はすべてGeminiアダプタを返す
 * (既定=Geminiであることを安全側に倒すため)。
 */
export function getExtractionProvider(options: GetExtractionProviderOptions = {}): ExtractionProvider {
  const env = readEnv(options.env);
  const providerName = env.AI_PROVIDER?.trim().toLowerCase();

  if (providerName === "claude") {
    return createClaudeExtractionProvider({ env });
  }
  return createGeminiExtractionProvider({ env });
}
