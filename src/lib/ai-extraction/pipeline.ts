/**
 * AI抽出→ジオコーディング→draft保存計画の組み立てまでを繋ぐオーケストレーション
 * (タスク4-3)。実際のFirestore書き込みは行わない(save-draft.tsの責務)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「AI(LLM)で...JSON抽出 → ジオコーディング...で緯度経度の候補を取得 →
 * videos/shops/visitsにstatus:"draft"で保存」の、抽出〜ジオコーディング〜計画組み立て部分
 * に対応する(管理画面の「取り込み実行」ボタン(タスク4-4)・実API通し確認(タスク4-5)から
 * 呼び出される想定)。
 */
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { GeoLocation } from "@/types/common";

import { geocodeWithGsi } from "@/lib/geocode";

import { buildDraftSavePlan, type DraftSavePlan, type DraftVideoPlan } from "./draft-plan";
import type { ExtractedShop, ExtractionProvider } from "./types";

type FetchLike = typeof fetch;

/** geocodeExtractedShops に渡せるオプション(すべて省略可能) */
export interface GeocodeExtractedShopsOptions {
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う(geocodeWithGsiに委譲) */
  fetchImpl?: FetchLike;
}

/**
 * 抽出された店舗一覧の住所候補(addressCandidate)を、国土地理院GSIで順にジオコーディングする。
 * 住所候補が無い(null・空文字)場合、およびジオコーディングが失敗した場合(通信エラー・
 * 該当なし)は、いずれもその要素をnullとして返す(全体を止めない。
 * src/lib/youtube-transcript.tsの字幕取得フォールバックと同じ考え方)。
 *
 * @returns shops と同じ順序・同じ長さの配列(取得できた要素は {lat, lng}、それ以外はnull)
 */
export async function geocodeExtractedShops(
  shops: readonly ExtractedShop[],
  options: GeocodeExtractedShopsOptions = {},
): Promise<Array<GeoLocation | null>> {
  const results: Array<GeoLocation | null> = [];

  for (const shop of shops) {
    const address = shop.addressCandidate?.trim();
    if (!address) {
      results.push(null);
      continue;
    }

    try {
      const geocoded = await geocodeWithGsi(address, { fetchImpl: options.fetchImpl });
      results.push(geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null);
    } catch {
      results.push(null);
    }
  }

  return results;
}

/** buildDraftPlanFromVideo への入力 */
export interface BuildDraftPlanFromVideoInput {
  /** getExtractionProvider() などで取得した抽出プロバイダ(Gemini/Claudeいずれか) */
  provider: ExtractionProvider;
  video: DraftVideoPlan;
  /** src/lib/youtube-transcript.ts の fetchVideoTextContent() の結果を想定 */
  textContent: { description: string; transcript: string | null };
  knownPerformers: readonly Performer[];
  existingPublishedShops: readonly Shop[];
  /** テスト用のfetch差し替え(ジオコーディングに使う)。省略時はグローバルfetchを使う */
  geocodeFetchImpl?: FetchLike;
}

/**
 * 動画1本分について、AI抽出→ジオコーディング→draft保存計画の組み立てまでを実行する。
 * 戻り値(DraftSavePlan)は save-draft.ts の saveDraftExtraction() にそのまま渡せる。
 */
export async function buildDraftPlanFromVideo(input: BuildDraftPlanFromVideoInput): Promise<DraftSavePlan> {
  const extraction = await input.provider.extract({
    videoId: input.video.videoId,
    videoTitle: input.video.title,
    description: input.textContent.description,
    transcript: input.textContent.transcript,
    knownPerformerNames: input.knownPerformers.map((performer) => performer.name),
  });

  const geocodeResults = await geocodeExtractedShops(extraction.shops, {
    fetchImpl: input.geocodeFetchImpl,
  });

  return buildDraftSavePlan({
    video: input.video,
    extraction,
    knownPerformers: input.knownPerformers,
    existingPublishedShops: input.existingPublishedShops,
    geocodeResults,
  });
}
