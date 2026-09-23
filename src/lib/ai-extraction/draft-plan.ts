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

import { isBanchiLevelAddress } from "@/lib/geocode";

import type { ExtractionResult, GeocodedShopLocation } from "./types";

/** 動画名の全角/半角・大文字小文字・空白の違いを吸収した比較用文字列に正規化する */
function normalizeName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 店名を正規化する(重複検出の比較キーとして使う。normalizeNameと同じロジック) */
export function normalizeShopName(name: string): string {
  return normalizeName(name);
}

/** resolvePerformerIdのあいまい一致で吸収する敬称(末尾のみ除去) */
const HONORIFIC_SUFFIX_PATTERN = /(さん|くん|ちゃん)$/;

/** 全角/半角いずれの括弧書き(例:「(カメラマン)」)も除去する(NFKCで全角括弧は半角化される前提) */
const BRACKET_PATTERN = /\([^)]*\)/g;

/**
 * 出演者名の表記ゆれ(敬称「さん/くん/ちゃん」・括弧書きの有無)を吸収した
 * あいまい一致用の比較文字列に正規化する(resolvePerformerIdの完全一致で見つからない場合のみ使用)。
 * 例: 「高橋さん(カメラマン)」「高橋さん」「高橋」は、いずれも「高橋」に正規化される。
 */
function normalizePerformerNameLoosely(name: string): string {
  const withoutBrackets = name.normalize("NFKC").replace(BRACKET_PATTERN, "");
  return withoutBrackets.replace(/\s+/g, "").toLowerCase().replace(HONORIFIC_SUFFIX_PATTERN, "");
}

/**
 * 出演者名(AI抽出結果由来)を、既知の出演者マスタ(performers)のIDに解決する。
 * まず完全一致(全角/半角・大文字小文字・空白の違いを無視した正規化)を優先して探す。
 * 完全一致が無い場合のみ、敬称「さん/くん/ちゃん」・括弧書きの有無を吸収したあいまい一致を試みる
 * (requirements.md「5.」下書き保存時の扱い、2026-09-23決定、P-016)。
 * いずれの段階でも一致候補が複数(あいまい)になる場合、および一致が見つからない場合は
 * null を返す(実保存側でunresolvedConsumptions扱いにする)。
 */
export function resolvePerformerId(
  performerName: string,
  knownPerformers: readonly Performer[],
): string | null {
  const exactNormalized = normalizeName(performerName);
  const exactMatches = knownPerformers.filter((performer) => normalizeName(performer.name) === exactNormalized);
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  if (exactMatches.length > 1) {
    return null;
  }

  const looseNormalized = normalizePerformerNameLoosely(performerName);
  const looseMatches = knownPerformers.filter(
    (performer) => normalizePerformerNameLoosely(performer.name) === looseNormalized,
  );
  return looseMatches.length === 1 ? looseMatches[0].id : null;
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
  /**
   * 番地レベルまで位置が確定できたか。false の場合、保存側(save-draft.ts)が
   * shops.locationConfirmed=false を付与し、管理者がピンを確定するまで承認不可にする
   * (requirements.md「5.」下書き保存時の扱い、2026-09-23決定、P-016)。
   * ジオコード自体に失敗した場合(location === null)もfalseになる。
   */
  locationConfirmed: boolean;
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
  geocodeResults: ReadonlyArray<GeocodedShopLocation | null>;
}

/**
 * AI抽出結果(ExtractionResult)から、videos/shops/visitsのdraft保存計画を組み立てる純粋関数。
 * Firestoreへのアクセスは行わない(実際の書き込みは save-draft.ts の責務)。
 */
export function buildDraftSavePlan(input: BuildDraftSavePlanInput): DraftSavePlan {
  const shops: DraftShopPlan[] = input.extraction.shops.map((shop, index) => {
    const duplicate = findDuplicateShop(shop.name, input.existingPublishedShops);
    const geocoded = input.geocodeResults[index] ?? null;
    return {
      name: shop.name,
      addressCandidate: shop.addressCandidate,
      location: geocoded?.location ?? null,
      locationConfirmed: geocoded !== null && isBanchiLevelAddress(geocoded.normalizedAddress),
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
