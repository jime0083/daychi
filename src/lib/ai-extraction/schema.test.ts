/**
 * src/lib/ai-extraction/schema.ts のユニットテスト(タスク4-3)。
 * Gemini/Claude両アダプタが共通で使う応答スキーマ検証(validateExtractionResult)を検証する。
 */
import { describe, expect, it } from "vitest";

import { validateExtractionResult } from "@/lib/ai-extraction/schema";

describe("validateExtractionResult", () => {
  it("正しい形式のJSONをExtractionResultとして受け入れる", () => {
    const raw = {
      shops: [
        {
          name: "喫茶ダイチ",
          addressCandidate: "東京都世田谷区北沢3-31-3",
          consumptions: [{ performerName: "だいち", items: ["ブレンドコーヒー", "モンブラン"] }],
        },
      ],
    };

    expect(validateExtractionResult(raw)).toEqual(raw);
  });

  it("addressCandidateがnullでも受け入れる", () => {
    const raw = {
      shops: [{ name: "喫茶ダイチ", addressCandidate: null, consumptions: [] }],
    };

    expect(validateExtractionResult(raw)).toEqual(raw);
  });

  it("shopsが空配列でも受け入れる(店舗が紹介されていない動画)", () => {
    expect(validateExtractionResult({ shops: [] })).toEqual({ shops: [] });
  });

  it("トップレベルがオブジェクトでない場合はErrorをthrowする", () => {
    expect(() => validateExtractionResult("not an object")).toThrow("AI応答のスキーマが不正です");
    expect(() => validateExtractionResult(null)).toThrow("AI応答のスキーマが不正です");
    expect(() => validateExtractionResult([1, 2, 3])).toThrow("AI応答のスキーマが不正です");
  });

  it("shopsが配列でない場合はErrorをthrowする", () => {
    expect(() => validateExtractionResult({ shops: "not an array" })).toThrow("shopsが配列");
  });

  it("shop.nameが文字列でない場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({ shops: [{ name: 123, addressCandidate: null, consumptions: [] }] }),
    ).toThrow("shops[0].name");
  });

  it("shop.nameが空文字列の場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({ shops: [{ name: "", addressCandidate: null, consumptions: [] }] }),
    ).toThrow("shops[0].name");
  });

  it("shop.addressCandidateが文字列でもnullでもない場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({ shops: [{ name: "喫茶ダイチ", addressCandidate: 123, consumptions: [] }] }),
    ).toThrow("shops[0].addressCandidate");
  });

  it("shop.consumptionsが配列でない場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({
        shops: [{ name: "喫茶ダイチ", addressCandidate: null, consumptions: "not an array" }],
      }),
    ).toThrow("shops[0].consumptions");
  });

  it("consumption.performerNameが文字列でない場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({
        shops: [
          {
            name: "喫茶ダイチ",
            addressCandidate: null,
            consumptions: [{ performerName: 123, items: [] }],
          },
        ],
      }),
    ).toThrow("shops[0].consumptions[0].performerName");
  });

  it("consumption.itemsが文字列配列でない場合はErrorをthrowする", () => {
    expect(() =>
      validateExtractionResult({
        shops: [
          {
            name: "喫茶ダイチ",
            addressCandidate: null,
            consumptions: [{ performerName: "だいち", items: [1, 2] }],
          },
        ],
      }),
    ).toThrow("shops[0].consumptions[0].items");
  });
});
