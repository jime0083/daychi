/**
 * AI自動抽出パイプライン(タスク4-3)の共通型定義。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「AIプロバイダはプロバイダ非依存の抽出インターフェースで抽象化し、Gemini と Claude の
 * 両アダプタを実装する」に対応する。抽出結果のスキーマ(店名/住所候補/出演者ごとの
 * 飲食メニュー)はプロバイダ間で共通であり、このファイルで定義する型が「唯一の正」となる
 * (Gemini/Claude両アダプタは、この型を満たす値をvalidateExtractionResult経由で返す)。
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない)。
 */
import type { GeoLocation } from "@/types/common";

/**
 * AI抽出への入力(動画1本分)。
 * knownPerformerNames は performers コレクションに登録済みの出演者名一覧であり、
 * プロンプト内でAIに「この中から選ぶ」よう指示するために使う
 * (draft保存時の出演者名→performerId解決の精度を上げるため)。
 *
 * videoId(YouTube動画ID)は、requirements.md「5. AI自動抽出パイプライン」の
 * 「抽出の入力(2026-09-23変更、P-015)」に対応する。Geminiアダプタはこの値から
 * YouTube視聴URLを組み立て、動画そのものを入力(file_data)として渡す
 * (Claudeアダプタは動画を直接入力できないため、videoIdはプロンプトには含めずテキストのみ使う)。
 */
export interface ExtractionInput {
  videoId: string;
  videoTitle: string;
  description: string;
  transcript: string | null;
  knownPerformerNames: string[];
}

/** 出演者ごとの飲食メニュー(抽出結果1件分。visits.consumptionsの元になる) */
export interface ExtractedConsumption {
  performerName: string;
  items: string[];
}

/** 抽出された店舗1件分(shops/visitsの元になる) */
export interface ExtractedShop {
  name: string;
  /** 住所候補(AIが概要欄・字幕から読み取れなかった場合は null) */
  addressCandidate: string | null;
  consumptions: ExtractedConsumption[];
}

/** AI抽出の共通出力スキーマ(プロバイダ間で共通) */
export interface ExtractionResult {
  shops: ExtractedShop[];
}

/** プロバイダ非依存の抽出インターフェース(Gemini/Claude両アダプタが実装する) */
export interface ExtractionProvider {
  readonly name: "gemini" | "claude";
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/**
 * 抽出された店舗1件分のジオコーディング結果(pipeline.geocodeExtractedShops の要素)。
 * normalizedAddress は国土地理院(GSI)の正規化住所(geocodeWithGsiのdisplayName)であり、
 * draft-plan.buildDraftSavePlan が番地レベルまで特定できたか(locationConfirmed)の
 * 判定に使う(requirements.md「5.」下書き保存時の扱い、2026-09-23決定、P-016)。
 */
export interface GeocodedShopLocation {
  location: GeoLocation;
  /** GSIの正規化住所。取得できなかった場合はundefined */
  normalizedAddress?: string;
}
