"use client";

/**
 * 公開トップページ(/)の出演者フィルタUI(タスク3-4)。
 *
 * requirements.md「3.1 公開ページ」の
 * 「出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。
 *   選択した出演者が出演した訪問がある店舗のみ表示」に対応する。
 *
 * 設計判断:
 * - 選択方式は複数選択(チェックボックス)を採用する。単一選択(ラジオボタン/セレクト)
 *   より「複数の推しをまとめて見たい」という利用シーンに自然に対応でき、UIとしても
 *   チェックボックスの方が選択状態が視覚的に分かりやすいため。絞り込みロジック
 *   (src/lib/shop-filter.ts)は選択出演者のいずれかが参加した訪問がある店舗を表示する
 *   OR方式とする(積集合だと0件になりやすく実用性が低いため)。
 * - isMain=false の出演者のみを選択肢として表示する(メイン出演者はフィルタ対象外。
 *   requirements.md「4. データモデル」performers.isMainのコメント「フィルタ対象外にする」
 *   に対応)。表示順は order 昇順(他の出演者一覧表示と同じ方針)。
 * - フィルタ対象の出演者が1人もいない場合(isMain=falseの出演者が0件)は、
 *   UIごと非表示にする(意味のない空フィルタを表示しないため)。
 * - データ取得・絞り込み計算は行わない制御コンポーネント(PublicMap/VideoSidebarと
 *   同じ方針)。選択状態(selectedPerformerIds)とトグルコールバックは呼び出し側
 *   (src/app/page.tsx)が管理する。
 * - 地図の邪魔にならないよう、地図コンテナ右上に浮かせるオーバーレイパネルとして配置する
 *   (呼び出し側で src/components/map/PublicMap.tsx と同じ relative コンテナ内に置く想定)。
 *   本格的なモバイル最適化はタスク3-5で行うため、ここでは幅が画面からはみ出さない程度の
 *   最低限の配慮(max-width指定・折り返し)にとどめる。
 */
import type { Performer } from "@/types/performer";

/** フィルタパネル本体に付与するdata-testid */
export const PERFORMER_FILTER_TEST_ID = "performer-filter";
/** 各出演者の選択肢(label)に付与するdata-testid */
export const PERFORMER_FILTER_OPTION_TEST_ID = "performer-filter-option";

interface PerformerFilterProps {
  /** 出演者一覧(isMain=trueも含む全件)。このコンポーネント内でisMain=falseのみに絞り込む */
  performers: Performer[];
  /** 選択中の出演者ID一覧 */
  selectedPerformerIds: string[];
  /** 出演者選択のトグル時に呼ばれるコールバック */
  onTogglePerformer: (performerId: string) => void;
}

export function PerformerFilter({
  performers,
  selectedPerformerIds,
  onTogglePerformer,
}: PerformerFilterProps) {
  const filterablePerformers = performers
    .filter((performer) => !performer.isMain)
    .sort((a, b) => a.order - b.order);

  if (filterablePerformers.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={PERFORMER_FILTER_TEST_ID}
      className="absolute right-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-col gap-1.5 rounded-lg bg-white/95 p-3 text-sm shadow dark:bg-zinc-950/95"
    >
      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        出演者で絞り込み
      </span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {filterablePerformers.map((performer) => {
          const isSelected = selectedPerformerIds.includes(performer.id);
          return (
            <li key={performer.id}>
              <label
                data-testid={PERFORMER_FILTER_OPTION_TEST_ID}
                data-performer-id={performer.id}
                data-selected={isSelected ? "true" : "false"}
                className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onTogglePerformer(performer.id)}
                  className="h-4 w-4"
                />
                {performer.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
