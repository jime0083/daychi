/**
 * Google Gemini API アダプタ(タスク4-3: AI抽出、既定プロバイダ)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「既定は無料枠の Google Gemini API」に対応する。
 *
 * Gemini REST API(generativelanguage v1beta の :generateContent)をfetchで直接呼び出す
 * (SDK不要)。JSON出力を強制するため responseMimeType: "application/json" と
 * 共通スキーマ(EXTRACTION_JSON_SCHEMA)を responseJsonSchema として渡す。
 * (Gemini独自形式の responseSchema は addressCandidate の type: ["string","null"] のような
 * 型の配列を受け付けず400になるため使わない。JSON Schema形式をそのまま渡せる
 * responseJsonSchema を使う。problem.txt P-014参照、実APIで解消を確認済み)
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない)。
 * - APIキー: 環境変数 GEMINI_API_KEY を `x-goog-api-key` ヘッダーで送る
 * - モデル: gemini-3.6-flash(gemini-2.5-flash は新規ユーザー提供終了のため使用不可)
 *
 * HTTP取得層はfetch関数を引数(DI)として差し替え可能にしており、ユニットテストでは
 * 実際のGemini APIを叩かずモックしたfetchで検証する(実API疎通確認はタスク4-5)。
 */
import { EXTRACTION_JSON_SCHEMA, validateExtractionResult } from "./schema";
import { buildExtractionPrompt } from "./prompt";
import type { ExtractionInput, ExtractionProvider, ExtractionResult } from "./types";

type FetchLike = typeof fetch;

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** 既定のGeminiモデル(gemini-2.5-flashは新規ユーザー提供終了のため使用不可) */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/**
 * env省略時は呼び出し時点のprocess.envを直接返す
 * (src/lib/youtube-data-api.tsのreadEnv()と同じ考え方)。
 */
function readEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("環境変数 GEMINI_API_KEY が設定されていません");
  }
  return apiKey;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/** createGeminiExtractionProvider に渡せるオプション(すべて省略可能) */
export interface GeminiExtractionProviderOptions {
  /** 省略時は環境変数 GEMINI_API_KEY を使う(未設定ならError) */
  apiKey?: string;
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う */
  fetchImpl?: FetchLike;
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む */
  env?: NodeJS.ProcessEnv;
  /** 省略時は DEFAULT_GEMINI_MODEL を使う */
  model?: string;
}

/**
 * Gemini REST APIを呼び出しJSONを返す。非2xxはエラーメッセージ付きでthrowする。
 */
async function fetchGeminiJson(
  url: string,
  apiKey: string,
  body: unknown,
  fetchImpl: FetchLike,
): Promise<GeminiGenerateContentResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Gemini APIへの接続に失敗しました");
  }

  if (!response.ok) {
    throw new Error(`Gemini APIがエラーを返しました(status: ${response.status})`);
  }

  return (await response.json()) as GeminiGenerateContentResponse;
}

/**
 * Gemini APIアダプタを生成する(既定プロバイダ)。
 * extract()は、共通プロンプト(buildExtractionPrompt)を投げ、応答テキストをJSONとして
 * パースしたのち validateExtractionResult() で共通スキーマ検証してから返す。
 */
export function createGeminiExtractionProvider(
  options: GeminiExtractionProviderOptions = {},
): ExtractionProvider {
  return {
    name: "gemini",
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const env = readEnv(options.env);
      const apiKey = options.apiKey ?? resolveApiKey(env);
      const fetchImpl = options.fetchImpl ?? fetch;
      const model = options.model ?? DEFAULT_GEMINI_MODEL;

      const url = `${GEMINI_API_BASE_URL}/models/${model}:generateContent`;
      const body = {
        contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(input) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: EXTRACTION_JSON_SCHEMA,
        },
      };

      const data = await fetchGeminiJson(url, apiKey, body, fetchImpl);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text === undefined || text.trim() === "") {
        throw new Error("Gemini応答にテキストが含まれていません");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Gemini応答が不正なJSONです");
      }

      return validateExtractionResult(parsed);
    },
  };
}
