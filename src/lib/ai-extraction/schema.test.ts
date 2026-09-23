/**
 * src/lib/ai-extraction/schema.ts のユニットテスト(タスク4-3)。
 * Gemini/Claude両アダプタが共通で使う応答スキーマ検証(validateExtractionResult)を検証する。
 */
import { describe, expect, it } from "vitest";

import { buildExtractionJsonSchema, validateExtractionResult } from "@/lib/ai-extraction/schema";

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

describe("buildExtractionJsonSchema", () => {
  function getPerformerNameSchema(schema: ReturnType<typeof buildExtractionJsonSchema>) {
    return schema.properties.shops.items.properties.consumptions.items.properties.performerName as {
      type: string;
      description: string;
      examples?: string[];
    };
  }

  it("performerNameの説明で、既知の出演者は一覧どおりの表記のまま返すよう明示する(タスク4-3d, P-016対応)", () => {
    const schema = buildExtractionJsonSchema(["だいち", "ゲストA"]);
    const performerNameSchema = getPerformerNameSchema(schema);

    expect(performerNameSchema.type).toBe("string");
    expect(performerNameSchema.description).toMatch(/一覧に記載された表記/);
    expect(performerNameSchema.description).toMatch(/一覧に含まれないゲスト等の出演者については/);
  });

  it("既知の出演者名をperformerNameのexamplesとして候補提示する(一覧外の名前を禁止するenumにはしない)", () => {
    const schema = buildExtractionJsonSchema(["だいち", "ゲストA"]);
    const performerNameSchema = getPerformerNameSchema(schema);

    expect(performerNameSchema.examples).toEqual(["だいち", "ゲストA"]);
    expect(performerNameSchema).not.toHaveProperty("enum");
  });

  it("既知の出演者名が空の場合はexamplesを付けない", () => {
    const schema = buildExtractionJsonSchema([]);
    const performerNameSchema = getPerformerNameSchema(schema);

    expect(performerNameSchema).not.toHaveProperty("examples");
  });

  it("shops/consumptions等の必須スキーマ構造はvalidateExtractionResultが検証する項目と一致する", () => {
    const schema = buildExtractionJsonSchema(["だいち"]);

    expect(schema.required).toEqual(["shops"]);
    expect(schema.properties.shops.items.required).toEqual(["name", "addressCandidate", "consumptions"]);
    expect(schema.properties.shops.items.properties.consumptions.items.required).toEqual([
      "performerName",
      "items",
    ]);
  });
});
