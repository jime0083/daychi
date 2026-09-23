/**
 * draft保存計画(DraftSavePlan)を実際にFirestoreへ書き込む(タスク4-3)。
 *
 * draft-plan.ts(buildDraftSavePlan)が組み立てた計画を、videos/shops/visitsの
 * status:"draft"ドキュメントとして作成する。純粋関数(draft-plan.ts)と実I/O(このファイル)を
 * 分離し、テストは純粋関数側を中心に行う方針とする(このファイルはFirestoreへの
 * 書き込みを行うためユニットテスト対象外。Emulator込みの検証はタスク4-4/4-5で行う)。
 */
import { Timestamp } from "firebase/firestore";

import { createShop } from "@/repositories/shops";
import { createVideo } from "@/repositories/videos";
import { createVisit } from "@/repositories/visits";
import type { GeoLocation } from "@/types/common";

import type { DraftSavePlan } from "./draft-plan";

/**
 * 住所候補が無い、またはジオコーディングに失敗した店舗に暫定的に設定する座標。
 * requirements.mdの管理画面仕様どおり、管理者が地図上でピンをドラッグして
 * 確定させる前提のプレースホルダであり、draft状態のままでは公開ページに表示されない
 * (status: "draft" のため)。あわせて shops.locationConfirmed を false にし、
 * ピンを確定させるまで承認(published化)できないようにする(requirements.md 2026-09-23決定)。
 * ジオコードには成功しても番地まで特定できない住所(町名・丁目止まり)の場合も、
 * 座標自体はジオコード結果(町の中心付近)を使いつつ locationConfirmed=false にする
 * (requirements.md 2026-09-23決定、P-016)。
 */
const UNRESOLVED_GEOCODE_LOCATION: GeoLocation = { lat: 0, lng: 0 };

/** saveDraftExtraction の実行結果 */
export interface SaveDraftExtractionResult {
  videoId: string;
  /** plan.shops と同じ順序(重複店舗は既存shopIdを、新規店舗は作成したshopIdを格納) */
  shopIds: string[];
  /** plan.visits と同じ順序で作成されたvisitのID */
  visitIds: string[];
  /**
   * 出演者マスタ(performers)に見つからず、visitのconsumptionsではなく
   * unresolvedConsumptionsとして保存された出演者名(重複除去済み)。管理画面のレビューUI
   * (タスク4-4)で、出演者マスタへの追加や既存出演者への割り当てを促すために使う想定。
   */
  unresolvedPerformerNames: string[];
}

/**
 * DraftSavePlanをFirestoreに書き込み、videos/shops/visitsをすべてstatus:"draft"で作成する。
 * 重複検出済みの店舗(plan.shops[].isDuplicate)は新規作成せず、既存のexistingShopIdを使う
 * (この場合、既存店舗のlocationConfirmedは変更しない)。
 * 出演者マスタに解決できなかった消費項目(performerId === null)はconsumptionsには含めず、
 * visit.unresolvedConsumptionsに{performerName, items}として保存する
 * (requirements.md 2026-09-23決定。レビュー画面で既存出演者への割り当て・新規登録が
 * 済むまで承認できない)。
 */
export async function saveDraftExtraction(plan: DraftSavePlan): Promise<SaveDraftExtractionResult> {
  const video = await createVideo(plan.video.videoId, {
    title: plan.video.title,
    publishedAt: Timestamp.fromDate(new Date(plan.video.publishedAt)),
    status: plan.status,
  });

  const shopIds: string[] = [];
  for (const shopPlan of plan.shops) {
    if (shopPlan.isDuplicate && shopPlan.existingShopId !== null) {
      shopIds.push(shopPlan.existingShopId);
      continue;
    }

    // 番地レベルまで位置確定できた場合はlocationConfirmedを付けない(未設定=確定済み扱い)。
    // ジオコード失敗(location === null)・番地未満(町名・丁目止まり)の場合は
    // false を付けて承認不可とする(plan.shops[].locationConfirmedはdraft-plan.tsで算出済み)。
    const createdShop = await createShop({
      name: shopPlan.name,
      // AI抽出はname/addressCandidate/consumptionsのみを対象とするため、
      // businessHours等はレビューUI(タスク4-4)での管理者入力を前提に空値で作成する。
      address: shopPlan.addressCandidate ?? "",
      businessHours: "",
      infoAsOf: Timestamp.now(),
      location: shopPlan.location ?? UNRESOLVED_GEOCODE_LOCATION,
      closed: false,
      tagIds: [],
      status: plan.status,
      ...(shopPlan.locationConfirmed ? {} : { locationConfirmed: false }),
    });
    shopIds.push(createdShop.id);
  }

  const unresolvedPerformerNames = new Set<string>();
  const visitIds: string[] = [];
  for (const visitPlan of plan.visits) {
    const consumptions: Array<{ performerId: string; items: string[] }> = [];
    const unresolvedConsumptions: Array<{ performerName: string; items: string[] }> = [];
    for (const consumption of visitPlan.consumptions) {
      if (consumption.performerId === null) {
        unresolvedPerformerNames.add(consumption.performerName);
        unresolvedConsumptions.push({ performerName: consumption.performerName, items: consumption.items });
        continue;
      }
      consumptions.push({ performerId: consumption.performerId, items: consumption.items });
    }

    const createdVisit = await createVisit({
      shopId: shopIds[visitPlan.shopIndex],
      videoId: video.id,
      consumptions,
      status: plan.status,
      ...(unresolvedConsumptions.length > 0 ? { unresolvedConsumptions } : {}),
    });
    visitIds.push(createdVisit.id);
  }

  return {
    videoId: video.id,
    shopIds,
    visitIds,
    unresolvedPerformerNames: [...unresolvedPerformerNames],
  };
}
