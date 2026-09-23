/**
 * src/lib/ai-extraction/claude-adapter.ts のユニットテスト(タスク4-3)。
 * 実際のClaude API(@anthropic-ai/sdk)は呼び出さず、ClaudeMessagesClientをモックして
 * 検証する(実行はrequirements.md「5. AI自動抽出パイプライン」の方針どおり保留のため、
 * 実APIを使った疎通確認自体を行わない)。
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CLAUDE_MODEL,
  type ClaudeMessagesClient,
  type ClaudeMessagesResponse,
  createClaudeExtractionProvider,
} from "@/lib/ai-extraction/claude-adapter";
import type { ExtractionInput } from "@/lib/ai-extraction/types";

const SAMPLE_INPUT: ExtractionInput = {
  videoId: "abcdefghijk",
  videoTitle: "世田谷の名店に行ってみた",
  description: "概要欄のテキストです",
  transcript: "字幕テキストです",
  knownPerformerNames: ["だいち", "ゲストA"],
};

const SAMPLE_EXTRACTION_JSON = JSON.stringify({
  shops: [
    {
      name: "喫茶ダイチ",
      addressCandidate: "東京都世田谷区北沢3-31-3",
      consumptions: [{ performerName: "だいち", items: ["ブレンドコーヒー"] }],
    },
  ],
});

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

function makeClient(response: ClaudeMessagesResponse): ClaudeMessagesClient & {
  create: ReturnType<typeof vi.fn>;
} {
  return { create: vi.fn().mockResolvedValue(response) };
}

describe("createClaudeExtractionProvider", () => {
  it("name は 'claude' である", () => {
    const client = makeClient({ content: [], stop_reason: "end_turn" });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });
    expect(provider.name).toBe("claude");
  });

  it("応答テキストをJSONとしてパースし、共通スキーマで検証して返す", async () => {
    const client = makeClient({
      content: [{ type: "text", text: SAMPLE_EXTRACTION_JSON }],
      stop_reason: "end_turn",
    });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    const result = await provider.extract(SAMPLE_INPUT);

    expect(result).toEqual(JSON.parse(SAMPLE_EXTRACTION_JSON));
    const params = client.create.mock.calls[0]?.[0];
    expect(params.model).toBe(DEFAULT_CLAUDE_MODEL);
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config.format.type).toBe("json_schema");
    // アシスタントのprefillを使わない(userメッセージのみ送る)
    expect(params.messages).toEqual([{ role: "user", content: expect.any(String) }]);
  });

  it("動画は渡さずテキスト(タイトル+概要欄+字幕)のみ送る(タスク4-3c, P-015対応)", async () => {
    const client = makeClient({
      content: [{ type: "text", text: SAMPLE_EXTRACTION_JSON }],
      stop_reason: "end_turn",
    });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    await provider.extract(SAMPLE_INPUT);

    const params = client.create.mock.calls[0]?.[0];
    // messagesはuserのテキストメッセージ1件のみ(file_data等の動画パートを持つ余地がない形)
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(typeof params.messages[0].content).toBe("string");
    const content = params.messages[0].content as string;
    // 送信テキストにvideoId(YouTube動画ID)が含まれない(=動画情報として送っていない)ことを確認する
    expect(content).not.toContain(SAMPLE_INPUT.videoId);
    expect(content).toContain(SAMPLE_INPUT.videoTitle);
    expect(content).toContain(SAMPLE_INPUT.description);
  });

  it("apiKeyを環境変数(CLAUDE_API_KEY)から解決できる(clientは指定されているため呼ばれない)", async () => {
    const client = makeClient({
      content: [{ type: "text", text: SAMPLE_EXTRACTION_JSON }],
      stop_reason: "end_turn",
    });
    const provider = createClaudeExtractionProvider({
      client,
      env: makeEnv({ CLAUDE_API_KEY: "env-api-key" }),
    });

    await expect(provider.extract(SAMPLE_INPUT)).resolves.toBeDefined();
  });

  it("CLAUDE_API_KEYが未設定でclient未指定の場合はErrorをthrowする", async () => {
    const provider = createClaudeExtractionProvider({ env: makeEnv() });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("CLAUDE_API_KEY");
  });

  it("stop_reasonがrefusalの場合はErrorをthrowする", async () => {
    const client = makeClient({
      content: [{ type: "text", text: SAMPLE_EXTRACTION_JSON }],
      stop_reason: "refusal",
    });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("refusal");
  });

  it("応答にtextブロックが含まれない場合はErrorをthrowする", async () => {
    const client = makeClient({ content: [{ type: "tool_use" }], stop_reason: "end_turn" });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("テキストが含まれていません");
  });

  it("応答テキストが不正なJSONの場合はErrorをthrowする", async () => {
    const client = makeClient({
      content: [{ type: "text", text: "{ not json" }],
      stop_reason: "end_turn",
    });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("不正なJSON");
  });

  it("応答JSONが共通スキーマに違反する場合はErrorをthrowする", async () => {
    const client = makeClient({
      content: [{ type: "text", text: JSON.stringify({ shops: "not an array" }) }],
      stop_reason: "end_turn",
    });
    const provider = createClaudeExtractionProvider({ apiKey: "test-key", client });

    await expect(provider.extract(SAMPLE_INPUT)).rejects.toThrow("AI応答のスキーマが不正です");
  });
});
