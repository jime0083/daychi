/**
 * AI抽出結果(ExtractionResult)のJSON Schemaと検証ロジック(タスク4-3)。
 *
 * Gemini・Claudeいずれのアダプタも、LLMの生応答(JSON文字列)をパースした後、
 * 必ず validateExtractionResult() を通してから ExtractionResult として扱う。
 * 検証に失敗した場合(必須フィールド欠落・型不一致など)は、原因が分かる
 * メッセージ付きのErrorをthrowする(不正なデータをdraft保存に流さないため)。
 */
import type { ExtractedConsumption, ExtractedShop, ExtractionResult } from "./types";

/**
 * LLMへの構造化出力指定(Gemini generationConfig.responseSchema /
 * Claude output_config.format.schema)に渡すJSON Schema。
 * ExtractionResult型と対応する(店名/住所候補/出演者ごとの飲食メニュー)。
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    shops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          addressCandidate: { type: ["string", "null"] },
          consumptions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                performerName: { type: "string" },
                items: { type: "array", items: { type: "string" } },
              },
              required: ["performerName", "items"],
            },
          },
        },
        required: ["name", "addressCandidate", "consumptions"],
      },
    },
  },
  required: ["shops"],
} as const;

function invalid(detail: string): never {
  throw new Error(`AI応答のスキーマが不正です: ${detail}`);
}

function validateConsumption(raw: unknown, path: string): ExtractedConsumption {
  if (typeof raw !== "object" || raw === null) {
    invalid(`${path} がオブジェクトではありません`);
  }
  const value = raw as Record<string, unknown>;

  if (typeof value.performerName !== "string" || value.performerName.trim() === "") {
    invalid(`${path}.performerName が文字列ではありません`);
  }
  if (!Array.isArray(value.items) || value.items.some((item) => typeof item !== "string")) {
    invalid(`${path}.items が文字列配列ではありません`);
  }

  return {
    performerName: value.performerName as string,
    items: value.items as string[],
  };
}

function validateShop(raw: unknown, path: string): ExtractedShop {
  if (typeof raw !== "object" || raw === null) {
    invalid(`${path} がオブジェクトではありません`);
  }
  const value = raw as Record<string, unknown>;

  if (typeof value.name !== "string" || value.name.trim() === "") {
    invalid(`${path}.name が文字列ではありません`);
  }
  if (value.addressCandidate !== null && typeof value.addressCandidate !== "string") {
    invalid(`${path}.addressCandidate が文字列またはnullではありません`);
  }
  if (!Array.isArray(value.consumptions)) {
    invalid(`${path}.consumptions が配列ではありません`);
  }

  const consumptions = (value.consumptions as unknown[]).map((consumption, index) =>
    validateConsumption(consumption, `${path}.consumptions[${index}]`),
  );

  return {
    name: value.name as string,
    addressCandidate: (value.addressCandidate as string | null) ?? null,
    consumptions,
  };
}

/**
 * LLM応答(JSON.parse済みの値)を共通スキーマ(ExtractionResult)として検証する。
 * 不正な場合は原因の分かるメッセージ付きでErrorをthrowする。
 */
export function validateExtractionResult(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null) {
    invalid("トップレベルがオブジェクトではありません");
  }
  const value = raw as Record<string, unknown>;

  if (!Array.isArray(value.shops)) {
    invalid("shopsが配列ではありません");
  }

  const shops = (value.shops as unknown[]).map((shop, index) => validateShop(shop, `shops[${index}]`));

  return { shops };
}
