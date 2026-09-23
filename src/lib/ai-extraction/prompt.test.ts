/**
 * src/lib/ai-extraction/prompt.ts のユニットテスト(タスク4-3b, P-014対応)。
 * 住所・出演者名・飲食メニューを本文に無い内容から作り出さないよう指示していることを検証する。
 */
import { describe, expect, it } from "vitest";

import { buildExtractionPrompt } from "@/lib/ai-extraction/prompt";
import type { ExtractionInput } from "@/lib/ai-extraction/types";

const SAMPLE_INPUT: ExtractionInput = {
  videoTitle: "世田谷の名店に行ってみた",
  description: "概要欄のテキストです",
  transcript: "字幕テキストです",
  knownPerformerNames: ["だいち", "ゲストA"],
};

describe("buildExtractionPrompt", () => {
  it("住所を本文に無い内容から推測・補完してはいけないことを明示する", () => {
    const prompt = buildExtractionPrompt(SAMPLE_INPUT);

    expect(prompt).toContain("addressCandidate");
    expect(prompt).toMatch(/住所[\s\S]*(推測|補完)[\s\S]*(禁止|しない|いけない)/);
    expect(prompt).toMatch(/書かれていない[\s\S]*addressCandidateをnull/);
  });

  it("店名・出演者名・飲食メニューも本文に根拠のあるものだけを抽出するよう指示する", () => {
    const prompt = buildExtractionPrompt(SAMPLE_INPUT);

    expect(prompt).toMatch(/一般知識や推測でこれらの情報を補完・作成することは禁止/);
    expect(prompt).toMatch(/登場しない出演者を新たに作り出さない/);
    expect(prompt).toMatch(/記載がないメニューを[\s\S]*(推測して追加しない|作り出さない)/);
  });

  it("引き続き動画タイトル・概要欄・字幕・既知の出演者一覧を含む", () => {
    const prompt = buildExtractionPrompt(SAMPLE_INPUT);

    expect(prompt).toContain(SAMPLE_INPUT.videoTitle);
    expect(prompt).toContain(SAMPLE_INPUT.description);
    expect(prompt).toContain("だいち、ゲストA");
  });
});
