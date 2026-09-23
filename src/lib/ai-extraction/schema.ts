/**
 * AI抽出結果(ExtractionResult)のJSON Schemaと検証ロジック(タスク4-3)。
 *
 * Gemini・Claudeいずれのアダプタも、LLMの生応答(JSON文字列)をパースした後、
 * 必ず validateExtractionResult() を通してから ExtractionResult として扱う。
 * 検証に失敗した場合(必須フィールド欠落・型不一致など)は、原因が分かる
 * メッセージ付きのErrorをthrowする(不正なデータをdraft保存に流さないため)。
 */
import type { ExtractedConsumption, ExtractedShop, ExtractionResult } from "./types";

/** performerNameフィールドの説明文(既知の出演者は一覧どおりの表記で返すことを再度明示する) */
const PERFORMER_NAME_DESCRIPTION =
  "動画に映っている人物が「既知の出演者一覧」に含まれる場合は、一覧に記載された表記" +
  "(敬称や括弧書きを含む)を一字一句変更せずそのまま返してください。一覧に含まれないゲスト等の" +
  "出演者については、動画内・本文中の表記をそのまま使って構いません。";

/**
 * LLMへの構造化出力指定(Gemini generationConfig.responseJsonSchema /
 * Claude output_config.format.schema)に渡すJSON Schemaを組み立てる。
 * ExtractionResult型と対応する(店名/住所候補/出演者ごとの飲食メニュー)。
 *
 * knownPerformerNames を渡すと、performerNameフィールドの examples として既知の出演者名を
 * 候補提示する(あくまで例示であり、一覧に無いゲスト名を禁止するenumにはしない。
 * requirements.md「5.」下書き保存時の扱い、2026-09-23決定、P-016)。
 */
export function buildExtractionJsonSchema(knownPerformerNames: readonly string[] = []) {
  return {
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
                  performerName: {
                    type: "string",
                    description: PERFORMER_NAME_DESCRIPTION,
                    ...(knownPerformerNames.length > 0 ? { examples: [...knownPerformerNames] } : {}),
                  },
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
  };
}

/**
 * 既知の出演者名を含まない基本形のJSON Schema(後方互換用・テスト等での参照に使う)。
 * 実際のAPI呼び出しでは buildExtractionJsonSchema(knownPerformerNames) を使う。
 */
export const EXTRACTION_JSON_SCHEMA = buildExtractionJsonSchema();

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
