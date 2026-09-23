/**
 * AI抽出結果からFirestore保存用のdraftデータを組み立てる純粋関数群(タスク4-3)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「videos / shops / visits に status:"draft" で保存」「既存published店舗との重複検出」に
 * 対応する。ここでは純粋関数(Firestoreへのアクセスを一切行わない)として組み立てのみ行い、
 * 実際の書き込みは save-draft.ts(saveDraftExtraction)が別途行う。
 */
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { GeoLocation } from "@/types/common";

import type { ExtractionResult } from "./types";

/** 動画名の全角/半角・大文字小文字・空白の違いを吸収した比較用文字列に正規化する */
function normalizeName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 店名を正規化する(重複検出の比較キーとして使う。normalizeNameと同じロジック) */
export function normalizeShopName(name: string): string {
  return normalizeName(name);
}

/**
 * 出演者名(AI抽出結果由来)を、既知の出演者マスタ(performers)のIDに解決する。
 * 正規化(全角/半角・大文字小文字・空白の違いを無視)して一致するものを探す。
 * 見つからない場合(未登録の出演者)は null を返す(実保存側で扱いを決める)。
 */
export function resolvePerformerId(
  performerName: string,
  knownPerformers: readonly Performer[],
): string | null {
  const normalized = normalizeName(performerName);
  const match = knownPerformers.find((performer) => normalizeName(performer.name) === normalized);
  return match?.id ?? null;
}

/** 店舗重複検出の結果 */
export interface ShopDuplicateMatch {
  isDuplicate: boolean;
  existingShopId: string | null;
}

/**
 * 抽出された店名が既存店舗と重複しているかを、店名の正規化一致で判定する。
 * 一致した場合は既存のshopIdを返す(新規作成せず既存店舗を使い回す)。
 */
export function findDuplicateShop(
  shopName: string,
  existingShops: readonly Shop[],
): ShopDuplicateMatch {
  const normalized = normalizeShopName(shopName);
  const match = existingShops.find((shop) => normalizeShopName(shop.name) === normalized);
  return match ? { isDuplicate: true, existingShopId: match.id } : { isDuplicate: false, existingShopId: null };
}

/** draft作成対象の動画情報(YouTube動画IDと、YouTube Data APIから取得済みのtitle/publishedAt) */
export interface DraftVideoPlan {
  videoId: string;
  title: string;
  /** YouTube Data APIのpublishedAt(ISO 8601文字列)。Timestamp変換は保存側の責務とする */
  publishedAt: string;
}

/** draft作成対象の店舗1件分の計画(新規作成 or 既存店舗の使い回し) */
export interface DraftShopPlan {
  name: string;
  addressCandidate: string | null;
  /** ジオコード結果(取得できなかった場合はnull。保存側でプレースホルダ座標を補う) */
  location: GeoLocation | null;
  isDuplicate: boolean;
  /** isDuplicate === true の場合のみ非null(重複先の既存shopId) */
  existingShopId: string | null;
}

/** draft作成対象の飲食メニュー1件分の計画 */
export interface DraftConsumptionPlan {
  /** 出演者マスタに解決できた場合のperformerId。解決できない場合はnull */
  performerId: string | null;
  performerName: string;
  items: string[];
}

/** draft作成対象の訪問(visit)1件分の計画。店舗は shops[shopIndex] を参照する */
export interface DraftVisitPlan {
  shopIndex: number;
  consumptions: DraftConsumptionPlan[];
}

/** buildDraftSavePlan の出力(実保存関数 saveDraftExtraction への入力) */
export interface DraftSavePlan {
  /**
   * このパイプラインが作るvideos/shops/visitsはすべてstatus:"draft"であることを明示する
   * (requirements.md「5. AI自動抽出パイプライン」参照。管理画面での承認操作でのみ
   * "published"に変わる)。常に"draft"固定値であり、ユニットテストで直接検証できるように
   * 計画オブジェクトのトップレベルに持たせている。
   */
  status: "draft";
  video: DraftVideoPlan;
  shops: DraftShopPlan[];
  visits: DraftVisitPlan[];
}

/** buildDraftSavePlan への入力 */
export interface BuildDraftSavePlanInput {
  video: DraftVideoPlan;
  extraction: ExtractionResult;
  knownPerformers: readonly Performer[];
  /** 重複検出の比較対象とする既存店舗一覧(requirements.mdの想定に合わせ、通常はpublished店舗) */
  existingPublishedShops: readonly Shop[];
  /** extraction.shops と同じ順序・同じ長さのジオコード結果(取得できない要素はnull) */
  geocodeResults: ReadonlyArray<GeoLocation | null>;
}

/**
 * AI抽出結果(ExtractionResult)から、videos/shops/visitsのdraft保存計画を組み立てる純粋関数。
 * Firestoreへのアクセスは行わない(実際の書き込みは save-draft.ts の責務)。
 */
export function buildDraftSavePlan(input: BuildDraftSavePlanInput): DraftSavePlan {
  const shops: DraftShopPlan[] = input.extraction.shops.map((shop, index) => {
    const duplicate = findDuplicateShop(shop.name, input.existingPublishedShops);
    return {
      name: shop.name,
      addressCandidate: shop.addressCandidate,
      location: input.geocodeResults[index] ?? null,
      isDuplicate: duplicate.isDuplicate,
      existingShopId: duplicate.existingShopId,
    };
  });

  const visits: DraftVisitPlan[] = input.extraction.shops.map((shop, index) => ({
    shopIndex: index,
    consumptions: shop.consumptions.map((consumption) => ({
      performerId: resolvePerformerId(consumption.performerName, input.knownPerformers),
      performerName: consumption.performerName,
      items: consumption.items,
    })),
  }));

  return { status: "draft", video: input.video, shops, visits };
}
