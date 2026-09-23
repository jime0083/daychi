/**
 * 未割り当て出演者(unresolvedConsumptions)の解消ロジック(タスク4-4)。
 *
 * requirements.md「4. データモデル」visits.unresolvedConsumptions の
 * 「レビュー画面で既存出演者に割り当てるか新規登録してconsumptionsへ移す」に対応する。
 * 既存出演者への割り当て・新規出演者登録のいずれも「performerIdが決まった行を
 * unresolvedConsumptionsからconsumptionsへ移す」という同じ操作になるため、
 * 呼び出し側(レビュー画面)は新規出演者登録(performers.createPerformer)を行った後の
 * performerIdをこの関数に渡すだけでよい。
 *
 * Firestoreへのアクセスを行わない純粋関数として切り出し、ユニットテストする。
 */
import type { VisitConsumption, VisitUnresolvedConsumption } from "@/types/visit";

export interface ResolveUnresolvedConsumptionResult {
  consumptions: VisitConsumption[];
  unresolvedConsumptions: VisitUnresolvedConsumption[];
}

/**
 * unresolvedConsumptions[targetIndex] を、指定したperformerIdの飲食メニューとして
 * consumptionsへ移す。イミュータブルに新しい配列を返す(引数の配列は変更しない)。
 *
 * targetIndex が範囲外の場合はErrorを投げる(呼び出し側のUIは常に表示中の行の
 * インデックスを渡すため、通常到達しない防御的ガード)。
 */
export function resolveUnresolvedConsumption(
  consumptions: readonly VisitConsumption[],
  unresolvedConsumptions: readonly VisitUnresolvedConsumption[],
  targetIndex: number,
  performerId: string,
): ResolveUnresolvedConsumptionResult {
  const target = unresolvedConsumptions[targetIndex];
  if (target === undefined) {
    throw new Error(`unresolvedConsumptionsの範囲外のインデックスが指定されました: ${targetIndex}`);
  }

  return {
    consumptions: [...consumptions, { performerId, items: [...target.items] }],
    unresolvedConsumptions: unresolvedConsumptions.filter((_, index) => index !== targetIndex),
  };
}
