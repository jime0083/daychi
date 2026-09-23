/**
 * Claude API アダプタ(タスク4-3: AI抽出。実装のみ・既定では呼ばれない)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「Claude API アダプタは実装するが実行は保留(APIキー設定+明示的な選択時のみ動作。
 * 既定では呼ばれない)」に対応する。
 *
 * 公式SDK(@anthropic-ai/sdk)を使う(fetch直書きは禁止。CLAUDE_API_KEYはSDKの
 * apiKeyオプションに明示的に渡す。process.env.ANTHROPIC_API_KEYへの暗黙フォールバックは
 * 使わない)。
 *
 * - モデル: claude-opus-5
 * - JSON取得: structured outputs(output_config.format = { type: "json_schema", schema })。
 *   アシスタントのprefill(assistant roleでの先頭テキスト固定)は使わない(400エラーになる
 *   ため。本アダプタはuserメッセージのみを送る)
 * - thinking: { type: "adaptive" }(要約付き拡張思考)
 * - response.stop_reason === "refusal" の場合は必ずErrorをthrowする(ポリシー上の
 *   拒否をdraft保存に流さないため)
 *
 * SDKクライアントはDI(ClaudeMessagesClient)で差し替え可能にしており、ユニットテストでは
 * 実際のClaude APIを叩かずモックしたクライアントで検証する。
 */
import Anthropic from "@anthropic-ai/sdk";

import { buildExtractionPrompt } from "./prompt";
import { EXTRACTION_JSON_SCHEMA, validateExtractionResult } from "./schema";
import type { ExtractionInput, ExtractionProvider, ExtractionResult } from "./types";

/** 既定のClaudeモデル */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

/** 応答が打ち切られないよう十分な余裕を持たせた既定のmax_tokens */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * env省略時は呼び出し時点のprocess.envを直接返す
 * (src/lib/youtube-data-api.tsのreadEnv()と同じ考え方)。
 */
function readEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("環境変数 CLAUDE_API_KEY が設定されていません");
  }
  return apiKey;
}

/** Claude Messages APIへ渡すリクエストのうち、本アダプタが組み立てるパラメータ */
export interface ClaudeMessagesCreateParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user"; content: string }>;
  output_config: { format: { type: "json_schema"; schema: Record<string, unknown> } };
  thinking: { type: "adaptive" };
}

/** Claude Messages APIの応答のうち、本アダプタが使う最小限の形(DI/モック用の狭い型) */
export interface ClaudeMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
}

/** createClaudeExtractionProvider に渡すMessagesクライアントの最小限インターフェース(DI用) */
export interface ClaudeMessagesClient {
  create(params: ClaudeMessagesCreateParams): Promise<ClaudeMessagesResponse>;
}

/**
 * @anthropic-ai/sdk の実クライアントをラップし、ClaudeMessagesClientの形に合わせる。
 * 実SDKの型(Anthropic.MessageCreateParamsNonStreaming / Anthropic.Message)を使った
 * 呼び出しはこの関数内に閉じ込め、DI用の型(ClaudeMessagesClient)は実SDKの型に
 * 依存しない狭いインターフェースのままにする(テストでのモックを容易にするため)。
 */
function createDefaultClaudeMessagesClient(apiKey: string): ClaudeMessagesClient {
  const anthropic = new Anthropic({ apiKey });

  return {
    async create(params: ClaudeMessagesCreateParams): Promise<ClaudeMessagesResponse> {
      const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
        model: params.model,
        max_tokens: params.max_tokens,
        messages: params.messages,
        output_config: params.output_config,
        thinking: params.thinking,
      };
      const message = await anthropic.messages.create(requestParams);

      return {
        content: message.content.map((block) => ({
          type: block.type,
          text: block.type === "text" ? block.text : undefined,
        })),
        stop_reason: message.stop_reason,
      };
    },
  };
}

/** createClaudeExtractionProvider に渡せるオプション(すべて省略可能) */
export interface ClaudeExtractionProviderOptions {
  /** 省略時は環境変数 CLAUDE_API_KEY を使う(未設定ならError) */
  apiKey?: string;
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む */
  env?: NodeJS.ProcessEnv;
  /** 省略時は DEFAULT_CLAUDE_MODEL を使う */
  model?: string;
  /** 省略時は DEFAULT_MAX_TOKENS を使う */
  maxTokens?: number;
  /** テスト用のクライアント差し替え(DI)。省略時は @anthropic-ai/sdk の実クライアントを使う */
  client?: ClaudeMessagesClient;
}

/**
 * Claude APIアダプタを生成する(実装のみ・既定のファクトリからは呼ばれない。
 * AI_PROVIDER=claude を明示的に選択し、CLAUDE_API_KEYを設定した場合のみ動作する)。
 */
export function createClaudeExtractionProvider(
  options: ClaudeExtractionProviderOptions = {},
): ExtractionProvider {
  return {
    name: "claude",
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const model = options.model ?? DEFAULT_CLAUDE_MODEL;
      const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
      // クライアントをDIで受け取る場合、実SDKクライアントの生成(≒APIキー解決)は
      // 不要なため、client未指定時のみ環境変数/optionsからAPIキーを解決する。
      const client =
        options.client ??
        createDefaultClaudeMessagesClient(options.apiKey ?? resolveApiKey(readEnv(options.env)));

      const response = await client.create({
        model,
        max_tokens: maxTokens,
        // アシスタントのprefillは使わない(400になるため)。userメッセージのみ送る。
        messages: [{ role: "user", content: buildExtractionPrompt(input) }],
        output_config: {
          format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA as Record<string, unknown> },
        },
        thinking: { type: "adaptive" },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude APIが応答を拒否しました(stop_reason: refusal)");
      }

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock?.text) {
        throw new Error("Claude応答にテキストが含まれていません");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new Error("Claude応答が不正なJSONです");
      }

      return validateExtractionResult(parsed);
    },
  };
}
