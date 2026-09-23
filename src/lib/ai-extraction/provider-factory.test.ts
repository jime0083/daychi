/**
 * src/lib/ai-extraction/provider-factory.ts のユニットテスト(タスク4-3)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「既定では呼ばれない(Claudeアダプタ)」を担保することが目的の中心。
 * createClaudeExtractionProvider をモックし、既定(AI_PROVIDER未設定/"gemini")では
 * 一度も呼び出されないことを検証する。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getExtractionProvider } from "@/lib/ai-extraction/provider-factory";

const createClaudeExtractionProviderMock = vi.fn();
const createGeminiExtractionProviderMock = vi.fn();

vi.mock("@/lib/ai-extraction/claude-adapter", () => ({
  createClaudeExtractionProvider: (...args: unknown[]) => createClaudeExtractionProviderMock(...args),
}));
vi.mock("@/lib/ai-extraction/gemini-adapter", () => ({
  createGeminiExtractionProvider: (...args: unknown[]) => createGeminiExtractionProviderMock(...args),
}));

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("getExtractionProvider", () => {
  beforeEach(() => {
    createClaudeExtractionProviderMock.mockReset();
    createGeminiExtractionProviderMock.mockReset();
    createGeminiExtractionProviderMock.mockReturnValue({ name: "gemini", extract: vi.fn() });
    createClaudeExtractionProviderMock.mockReturnValue({ name: "claude", extract: vi.fn() });
  });

  it("AI_PROVIDER未設定時はGeminiプロバイダを返し、Claudeアダプタは一度も呼ばれない", () => {
    const provider = getExtractionProvider({ env: makeEnv() });

    expect(provider.name).toBe("gemini");
    expect(createGeminiExtractionProviderMock).toHaveBeenCalledTimes(1);
    expect(createClaudeExtractionProviderMock).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER="gemini"を明示しても常にGeminiプロバイダを返す(Claudeは呼ばれない)', () => {
    const provider = getExtractionProvider({ env: makeEnv({ AI_PROVIDER: "gemini" }) });

    expect(provider.name).toBe("gemini");
    expect(createClaudeExtractionProviderMock).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER="claude"を明示した場合のみClaudeプロバイダを返す', () => {
    const provider = getExtractionProvider({ env: makeEnv({ AI_PROVIDER: "claude" }) });

    expect(provider.name).toBe("claude");
    expect(createClaudeExtractionProviderMock).toHaveBeenCalledTimes(1);
    expect(createGeminiExtractionProviderMock).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER="CLAUDE"(大文字)でも明示的な選択として扱う', () => {
    const provider = getExtractionProvider({ env: makeEnv({ AI_PROVIDER: "CLAUDE" }) });

    expect(provider.name).toBe("claude");
  });

  it("AI_PROVIDERに不明な値が設定されている場合は安全側(Gemini)にフォールバックする", () => {
    const provider = getExtractionProvider({
      env: makeEnv({ AI_PROVIDER: "unknown-provider" }),
    });

    expect(provider.name).toBe("gemini");
    expect(createClaudeExtractionProviderMock).not.toHaveBeenCalled();
  });
});
