/**
 * 動画単位のレビュー承認可否判定(タスク4-4: 管理画面 取り込み実行とレビューUI)。
 *
 * requirements.md「4. データモデル」「5. AI自動抽出パイプライン(Phase 4)」の
 * 2026-09-23決定に基づく:
 * - shops.locationConfirmed が false の店舗が1件でもあれば承認(published化)できない
 * - visits.unresolvedConsumptions が1件でも残っている訪問があれば承認できない
 *
 * 純粋関数として切り出し、Firestore・UIから独立してユニットテストできるようにする
 * (progress.txt タスク4-4「承認不可判定は純粋関数に切り出してユニットテストする」に対応)。
 */

/** 判定対象の店舗1件分(判定に必要な最小限のフィールドのみ) */
export interface ApprovalCheckShop {
  id: string;
  name: string;
  locationConfirmed?: boolean;
}

/** 判定対象の訪問1件分(判定に必要な最小限のフィールドのみ) */
export interface ApprovalCheckVisit {
  id: string;
  unresolvedConsumptions?: ReadonlyArray<{ performerName: string; items: string[] }>;
}

/** checkVideoDraftApproval の結果 */
export interface VideoDraftApprovalResult {
  /** true の場合のみ「承認して公開」操作を実行できる */
  canApprove: boolean;
  /** 承認できない理由(人間が読める説明文)。canApprove === true の場合は空配列 */
  reasons: string[];
  /** 座標未確定の店舗ID一覧(UIでの個別ハイライトに使う) */
  blockingShopIds: string[];
  /** 未割り当て出演者が残っている訪問ID一覧(UIでの個別ハイライトに使う) */
  blockingVisitIds: string[];
}

/**
 * 動画1本分の下書き(店舗一覧・訪問一覧)から、承認(published化)の可否と
 * 承認できない場合の理由一覧を判定する。
 *
 * - shop.locationConfirmed が明示的に false の店舗は座標未確定として承認をブロックする
 *   (未設定 = 確定済み扱い。requirements.md「4. データモデル」shops.locationConfirmed参照)
 * - visit.unresolvedConsumptions が1件以上ある訪問は未割り当て出演者ありとして承認をブロックする
 */
export function checkVideoDraftApproval(
  shops: readonly ApprovalCheckShop[],
  visits: readonly ApprovalCheckVisit[],
): VideoDraftApprovalResult {
  const unconfirmedShops = shops.filter((shop) => shop.locationConfirmed === false);
  const unresolvedVisits = visits.filter(
    (visit) => (visit.unresolvedConsumptions?.length ?? 0) > 0,
  );

  const reasons: string[] = [
    ...unconfirmedShops.map(
      (shop) => `店舗「${shop.name}」の座標が未確定です。地図でピンの位置を確定して保存してください`,
    ),
    ...(unresolvedVisits.length > 0
      ? [
          `未割り当ての出演者が残っている訪問が${unresolvedVisits.length}件あります。` +
            "既存出演者への割り当て、または新規出演者としての登録が必要です",
        ]
      : []),
  ];

  return {
    canApprove: reasons.length === 0,
    reasons,
    blockingShopIds: unconfirmedShops.map((shop) => shop.id),
    blockingVisitIds: unresolvedVisits.map((visit) => visit.id),
  };
}
