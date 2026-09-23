/**
 * Google Gemini API アダプタ(タスク4-3: AI抽出、既定プロバイダ)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「既定は無料枠の Google Gemini API」に対応する。
 *
 * Gemini REST API(generativelanguage v1beta の :generateContent)をfetchで直接呼び出す
 * (SDK不要)。JSON出力を強制するため responseMimeType: "application/json" と
 * 共通スキーマ(buildExtractionJsonSchema)を responseJsonSchema として渡す。
 * (Gemini独自形式の responseSchema は addressCandidate の type: ["string","null"] のような
 * 型の配列を受け付けず400になるため使わない。JSON Schema形式をそのまま渡せる
 * responseJsonSchema を使う。problem.txt P-014参照、実APIで解消を確認済み)
 *
 * タスク4-3c(P-015対応): このチャンネルは概要欄に店舗詳細が書かれず、字幕も自動生成のみで
 * 取得できないため、テキストだけでは抽出材料が不足する(problem.txt P-015参照)。
 * そのため contents に「動画そのもの(YouTube URLをfile_data.file_uriとして渡す動画パート)」と
 * 「タイトル+概要欄+字幕(取得できた場合)のテキストパート」の両方を渡し、
 * generationConfig.mediaResolution=MEDIA_RESOLUTION_LOW(低解像度・低コスト設定)を指定する。
 * 実APIで33分動画・約18万トークン・約27秒で成功することを確認済み(problem.txt P-015)。
 *
 * また、Gemini APIの一時的な過負荷エラー(429/500/502/503/504)、および通信自体の失敗
 * (fetchの例外)は、いずれも指数バックオフで数回リトライする(requirements.md
 * 「AI APIの一時的な過負荷エラー(503等)や通信自体の失敗は自動で数回リトライする」、
 * 2026-09-23決定、P-016)。400/401/403等の非一時的エラーは即座に失敗させる。
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない)。
 * - APIキー: 環境変数 GEMINI_API_KEY を `x-goog-api-key` ヘッダーで送る
 * - モデル: gemini-3.6-flash(gemini-2.5-flash は新規ユーザー提供終了のため使用不可)
 *
 * HTTP取得層はfetch関数を引数(DI)として差し替え可能にしており、ユニットテストでは
 * 実際のGemini APIを叩かずモックしたfetchで検証する(実API疎通確認はタスク4-5)。
 * リトライの待機処理も引数(DI)として差し替え可能にしており、ユニットテストでは
 * 実時間を待たずにリトライ挙動を検証する。
 */
import { buildExtractionJsonSchema, validateExtractionResult } from "./schema";
import { buildExtractionPrompt } from "./prompt";
import type { ExtractionInput, ExtractionProvider, ExtractionResult } from "./types";
import { buildYoutubeWatchUrl } from "@/lib/youtube";

type FetchLike = typeof fetch;

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** 既定のGeminiモデル(gemini-2.5-flashは新規ユーザー提供終了のため使用不可) */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/** リトライ対象とする一時的エラーのHTTPステータス(429=レート制限、5xx=サーバー側の一時的過負荷) */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** 一時的エラー時の既定リトライ回数(初回呼び出しを含まない再試行回数) */
export const DEFAULT_MAX_RETRIES = 3;

/** 指数バックオフの基準待機時間(ミリ秒)。n回目のリトライ前に BASE * 2^(n-1) ms 待つ */
const RETRY_BASE_DELAY_MS = 1000;

/** リトライ待機を行う関数の型(テストでは即時解決する実装に差し替える) */
type WaitFn = (delayMs: number) => Promise<void>;

async function defaultWait(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

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
  /** 一時的エラー(429/5xx)時の最大リトライ回数(初回呼び出しを含まない)。省略時は DEFAULT_MAX_RETRIES */
  maxRetries?: number;
  /** テスト用のリトライ待機差し替え。省略時は実時間で指数バックオフ待機する */
  waitImpl?: WaitFn;
}

/**
 * Gemini REST APIを呼び出しJSONを返す。
 * 一時的エラー(429/500/502/503/504)、および通信自体の失敗(fetchの例外。DNS解決不可・
 * タイムアウト等)は、いずれも maxRetries 回まで指数バックオフで再試行する
 * (requirements.md「5.」抽出の入力「AI APIの一時的な過負荷エラー...や通信自体の失敗は
 * 自動で数回リトライする」、2026-09-23決定、P-016)。
 * それ以外の非2xx(400/401/403等)、および再試行回数を使い切った一時的エラー・通信失敗は
 * エラーをthrowする。
 */
async function fetchGeminiJson(
  url: string,
  apiKey: string,
  body: unknown,
  fetchImpl: FetchLike,
  maxRetries: number,
  wait: WaitFn,
): Promise<GeminiGenerateContentResponse> {
  let attempt = 0;

  for (;;) {
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
      if (attempt >= maxRetries) {
        throw new Error("Gemini APIへの接続に失敗しました");
      }
      attempt += 1;
      await wait(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      return (await response.json()) as GeminiGenerateContentResponse;
    }

    const canRetry = RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries;
    if (!canRetry) {
      throw new Error(`Gemini APIがエラーを返しました(status: ${response.status})`);
    }

    attempt += 1;
    await wait(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }
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
      const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
      const wait = options.waitImpl ?? defaultWait;

      const url = `${GEMINI_API_BASE_URL}/models/${model}:generateContent`;
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              { file_data: { file_uri: buildYoutubeWatchUrl(input.videoId) } },
              { text: buildExtractionPrompt(input) },
            ],
          },
        ],
        generationConfig: {
          mediaResolution: "MEDIA_RESOLUTION_LOW",
          responseMimeType: "application/json",
          responseJsonSchema: buildExtractionJsonSchema(input.knownPerformerNames),
        },
      };

      const data = await fetchGeminiJson(url, apiKey, body, fetchImpl, maxRetries, wait);
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
