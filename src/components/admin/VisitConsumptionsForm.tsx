"use client";

/**
 * 訪問(Visit)の出演者ごとの飲食メニュー(consumptions)を入力する動的フォーム
 * (タスク2-5)。
 *
 * requirements.md「4. データモデル」visits.consumptions
 * ([{ performerId: string, items: string[] }])に準拠する。
 * 「出演者を追加」で行を増やし、各行で出演者を選択、品目(items)を
 * 複数入力(追加/削除)できる。状態はすべて呼び出し側(親ページ)が保持し、
 * このコンポーネントは onChange 経由でイミュータブルな次の配列を通知するのみ
 * (自身では状態を持たない)。
 *
 * data-testid は idPrefix(呼び出し側で "visit-create" / "visit-edit" を渡す)を
 * 接頭辞とし、行・品目の特定はインデックスを埋め込んだtestidではなく、
 * 行コンテナ(`${idPrefix}-consumption-row`)からの相対検索(.nth())で行う設計
 * とする(同じページ内で作成フォーム・編集フォームが混在してもtestidが
 * 衝突しないようにするため。e2e/visits-crud.spec.ts 参照)。
 */
import type { Performer } from "@/types/performer";
import type { VisitConsumption } from "@/types/visit";

interface VisitConsumptionsFormProps {
  idPrefix: string;
  consumptions: VisitConsumption[];
  performers: Performer[];
  onChange: (next: VisitConsumption[]) => void;
}

export function VisitConsumptionsForm({
  idPrefix,
  consumptions,
  performers,
  onChange,
}: VisitConsumptionsFormProps) {
  function addRow(): void {
    onChange([...consumptions, { performerId: performers[0]?.id ?? "", items: [""] }]);
  }

  function removeRow(rowIndex: number): void {
    onChange(consumptions.filter((_, index) => index !== rowIndex));
  }

  function updatePerformer(rowIndex: number, performerId: string): void {
    onChange(
      consumptions.map((row, index) => (index === rowIndex ? { ...row, performerId } : row)),
    );
  }

  function addItem(rowIndex: number): void {
    onChange(
      consumptions.map((row, index) =>
        index === rowIndex ? { ...row, items: [...row.items, ""] } : row,
      ),
    );
  }

  function removeItem(rowIndex: number, itemIndex: number): void {
    onChange(
      consumptions.map((row, index) =>
        index === rowIndex
          ? { ...row, items: row.items.filter((_, itemIndexInRow) => itemIndexInRow !== itemIndex) }
          : row,
      ),
    );
  }

  function updateItem(rowIndex: number, itemIndex: number, value: string): void {
    onChange(
      consumptions.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              items: row.items.map((item, itemIndexInRow) =>
                itemIndexInRow === itemIndex ? value : item,
              ),
            }
          : row,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        出演者ごとの飲食メニュー
      </span>
      {consumptions.map((row, rowIndex) => (
        <div
          key={rowIndex}
          data-testid={`${idPrefix}-consumption-row`}
          className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-48 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
              出演者
              <select
                data-testid={`${idPrefix}-consumption-performer`}
                value={row.performerId}
                onChange={(event) => updatePerformer(rowIndex, event.target.value)}
                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">選択してください</option>
                {performers.map((performer) => (
                  <option key={performer.id} value={performer.id}>
                    {performer.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid={`${idPrefix}-consumption-removerow`}
              onClick={() => removeRow(rowIndex)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              この出演者を削除
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {row.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-center gap-2">
                <input
                  data-testid={`${idPrefix}-consumption-item`}
                  type="text"
                  placeholder="品目(例: ブレンドコーヒー)"
                  value={item}
                  onChange={(event) => updateItem(rowIndex, itemIndex, event.target.value)}
                  className="min-w-56 flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  data-testid={`${idPrefix}-consumption-removeitem`}
                  onClick={() => removeItem(rowIndex, itemIndex)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  削除
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid={`${idPrefix}-consumption-additem`}
              onClick={() => addItem(rowIndex)}
              className="w-fit rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              品目を追加
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        data-testid={`${idPrefix}-consumption-addrow`}
        onClick={addRow}
        className="w-fit rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        出演者を追加
      </button>
    </div>
  );
}
