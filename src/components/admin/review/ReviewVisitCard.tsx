"use client";

/**
 * レビュー画面(/admin/review/[videoId])の訪問1件分の表示・修正カード(タスク4-4)。
 *
 * requirements.md「4. データモデル」visits に基づき、出演者ごとの飲食メニュー
 * (consumptions)の編集(既存の src/components/admin/VisitConsumptionsForm.tsx を再利用)と、
 * unresolvedConsumptions(登録済み出演者に一致しなかった飲食記録)の解消
 * (既存出演者への割り当て、または新規出演者としての登録)を行う。
 *
 * unresolvedConsumptionsの解消ロジック自体は src/lib/review/consumption-resolution.ts
 * (純粋関数)に切り出しており、このコンポーネントはFirestore書き込み
 * (updateVisit・新規登録時はcreatePerformer)と状態管理のみを担当する。
 *
 * 状態管理の設計判断: このコンポーネントは親(/admin/review/[videoId])から
 * 都度新しいvisitオブジェクト(reload後の最新値)を受け取るが、useEffectでlocal
 * stateをpropsに同期させる実装は「setStateをuseEffect内で直接呼ぶ」react-hooks
 * lintルール(set-state-in-effect)に抵触する。そのため:
 * - consumptions(飲食メニュー編集state)はunresolvedConsumptions解消時にも
 *   ローカルstateを基準に更新し(assignToPerformer内でsetConsumptionsも呼ぶ)、
 *   Firestoreへの書き込み後は直接ローカルへ反映することでprops再同期を不要にする
 * - 未割り当て行の選択中performerIdは、行のインデックスではなく行の内容
 *   (performerName+items)をキーにしたMapで保持する。解消された行は自然に
 *   表示から消えるため、インデックスのズレによる誤割り当てが起きない
 */
import { useState } from "react";

import { VisitConsumptionsForm } from "@/components/admin/VisitConsumptionsForm";
import { resolveUnresolvedConsumption } from "@/lib/review/consumption-resolution";
import { createPerformer } from "@/repositories/performers";
import { updateVisit } from "@/repositories/visits";
import type { Performer } from "@/types/performer";
import type { Visit, VisitConsumption, VisitUnresolvedConsumption } from "@/types/visit";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 未割り当て行を選択状態Mapのキーにする(同一行を安定して指し示すための識別子) */
function unresolvedRowKey(item: VisitUnresolvedConsumption): string {
  return `${item.performerName}::${item.items.join("|")}`;
}

interface ReviewVisitCardProps {
  visit: Visit;
  shopName: string;
  performers: Performer[];
  onSaved: () => void;
}

export function ReviewVisitCard({ visit, shopName, performers, onSaved }: ReviewVisitCardProps) {
  const [consumptions, setConsumptions] = useState<VisitConsumption[]>(() =>
    visit.consumptions.map((row) => ({ ...row, items: [...row.items] })),
  );
  const [consumptionsErrors, setConsumptionsErrors] = useState<string[]>([]);
  const [savingConsumptions, setSavingConsumptions] = useState(false);

  const [selectedByKey, setSelectedByKey] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleSaveConsumptions(): Promise<void> {
    const errors: string[] = [];
    const cleaned: VisitConsumption[] = [];
    consumptions.forEach((row, index) => {
      if (row.performerId === "") {
        errors.push(`${index + 1}件目の出演者を選択してください`);
        return;
      }
      const items = row.items.map((item) => item.trim()).filter((item) => item !== "");
      if (items.length === 0) {
        errors.push(`${index + 1}件目の品目を1件以上入力してください`);
        return;
      }
      cleaned.push({ performerId: row.performerId, items });
    });

    if (errors.length > 0) {
      setConsumptionsErrors(errors);
      return;
    }

    setConsumptionsErrors([]);
    setSavingConsumptions(true);
    try {
      await updateVisit(visit.id, { consumptions: cleaned });
      setConsumptions(cleaned);
      onSaved();
    } catch (error) {
      setConsumptionsErrors([`保存に失敗しました: ${errorMessage(error)}`]);
    } finally {
      setSavingConsumptions(false);
    }
  }

  /**
   * unresolvedConsumptions[rowIndex]をperformerIdの飲食メニューとしてconsumptionsへ移す。
   * ローカルのconsumptions state(未保存の編集内容を含む)を基準にすることで、
   * 「飲食メニューを保存」前の編集内容を消さずに済む。
   */
  async function assignToPerformer(rowIndex: number, performerId: string): Promise<void> {
    const unresolved = visit.unresolvedConsumptions ?? [];
    const result = resolveUnresolvedConsumption(consumptions, unresolved, rowIndex, performerId);
    await updateVisit(visit.id, {
      consumptions: result.consumptions,
      unresolvedConsumptions: result.unresolvedConsumptions,
    });
    setConsumptions(result.consumptions);
    onSaved();
  }

  async function handleAssignExisting(rowIndex: number, rowKey: string): Promise<void> {
    const performerId = selectedByKey[rowKey];
    if (!performerId) {
      setRowError("割り当てる出演者を選択してください");
      return;
    }
    setRowError(null);
    setBusyKey(rowKey);
    try {
      await assignToPerformer(rowIndex, performerId);
    } catch (error) {
      setRowError(`割り当てに失敗しました: ${errorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRegisterNew(rowIndex: number, rowKey: string): Promise<void> {
    const unresolved = visit.unresolvedConsumptions ?? [];
    const target = unresolved[rowIndex];
    if (target === undefined) {
      return;
    }
    setRowError(null);
    setBusyKey(rowKey);
    try {
      const nextOrder = performers.reduce((max, performer) => Math.max(max, performer.order), 0) + 1;
      const newPerformer = await createPerformer({
        name: target.performerName,
        isMain: false,
        order: nextOrder,
      });
      await assignToPerformer(rowIndex, newPerformer.id);
    } catch (error) {
      setRowError(`新規登録に失敗しました: ${errorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  }

  const unresolvedConsumptions = visit.unresolvedConsumptions ?? [];

  return (
    <div
      data-testid="review-visit-card"
      data-visit-id={visit.id}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">店舗: {shopName}</p>

      <VisitConsumptionsForm
        idPrefix={`review-visit-${visit.id}`}
        consumptions={consumptions}
        performers={performers}
        onChange={setConsumptions}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="review-visit-consumptions-save"
          disabled={savingConsumptions}
          onClick={() => {
            void handleSaveConsumptions();
          }}
          className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {savingConsumptions ? "保存中..." : "飲食メニューを保存"}
        </button>
      </div>
      {consumptionsErrors.length > 0 && (
        <ul
          data-testid="review-visit-consumptions-error"
          className="flex flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
        >
          {consumptionsErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {unresolvedConsumptions.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            未割り当ての出演者(承認するには解消してください)
          </p>
          {unresolvedConsumptions.map((item, index) => {
            const rowKey = unresolvedRowKey(item);
            return (
              <div
                key={rowKey}
                data-testid="review-unresolved-row"
                className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-700 dark:bg-amber-950"
              >
                <span className="text-zinc-900 dark:text-zinc-50">
                  {item.performerName}: {item.items.join("、")}
                </span>
                <select
                  data-testid="review-unresolved-select"
                  value={selectedByKey[rowKey] ?? ""}
                  onChange={(event) =>
                    setSelectedByKey((current) => ({ ...current, [rowKey]: event.target.value }))
                  }
                  className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">既存出演者を選択</option>
                  {performers.map((performer) => (
                    <option key={performer.id} value={performer.id}>
                      {performer.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="review-unresolved-assign"
                  disabled={busyKey === rowKey}
                  onClick={() => {
                    void handleAssignExisting(index, rowKey);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  既存出演者に割り当てる
                </button>
                <button
                  type="button"
                  data-testid="review-unresolved-register"
                  disabled={busyKey === rowKey}
                  onClick={() => {
                    void handleRegisterNew(index, rowKey);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  新規出演者として登録
                </button>
              </div>
            );
          })}
          {rowError !== null && (
            <p data-testid="review-unresolved-error" className="text-sm text-red-600 dark:text-red-400">
              {rowError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
