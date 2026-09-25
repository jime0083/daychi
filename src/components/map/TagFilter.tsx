"use client";

/**
 * 公開トップページ(/)のタグ絞り込みUI(タスク5-3)。
 *
 * requirements.md「3.1 公開ページ」の
 * 「コーヒータイプタグフィルタ: 店舗に付与されたタグ(浅煎り・深煎り・エスプレッソ等)で
 *   絞り込む。複数のタグを選んだ場合は、いずれかのタグが付いた店舗を表示する(OR)。
 *   出演者フィルタとタグフィルタを両方使う場合は、両方の条件を満たす店舗だけを表示する」
 * に対応する。
 *
 * 配置・見た目・操作方法はsrc/components/map/PerformerFilter.tsxの出演者フィルタと
 * 完全に揃える(複数選択のチェックボックス、地図の「上」の専用の帯としてレイアウトし
 * 地図のピンとクリックが重ならないようにする、z-index等)。理由・設計判断の詳細は
 * PerformerFilter.tsxのコメント「レイアウト・重なり回避」を参照。呼び出し側
 * (src/app/page.tsx)ではこのバーをPerformerFilterのバーと縦に並べて配置する。
 *
 * - タグはタグマスタ(tags、全件read可)の全件をorder昇順で選択肢に表示する
 * - タグが1件も登録されていない場合はUIごと非表示にする(意味のない空フィルタを
 *   表示しないため。requirements.md「タグ内容は未定のため...Phase 5で実装する」の
 *   経緯上、タグ未登録の状態でも公開ページが壊れないようにするための対応でもある)
 * - データ取得・絞り込み計算は行わない制御コンポーネント(PerformerFilterと同じ方針)。
 *   選択状態(selectedTagIds)とトグルコールバックは呼び出し側(src/app/page.tsx)が管理する
 */
import type { Tag } from "@/types/tag";

/** フィルタパネル本体に付与するdata-testid */
export const TAG_FILTER_TEST_ID = "tag-filter";
/** 各タグの選択肢(label)に付与するdata-testid */
export const TAG_FILTER_OPTION_TEST_ID = "tag-filter-option";

interface TagFilterProps {
  /** タグ一覧(全件)。このコンポーネント内でorder昇順に並べ替える */
  tags: Tag[];
  /** 選択中のタグID一覧 */
  selectedTagIds: string[];
  /** タグ選択のトグル時に呼ばれるコールバック */
  onToggleTag: (tagId: string) => void;
}

export function TagFilter({ tags, selectedTagIds, onToggleTag }: TagFilterProps) {
  const sortedTags = [...tags].sort((a, b) => a.order - b.order);

  if (sortedTags.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={TAG_FILTER_TEST_ID}
      // pointer-events-none: バー自体(背景・パディング・見出しテキスト)はクリックを
      // 透過させる(PerformerFilter.tsxの「レイアウト・重なり回避」コメント参照)。
      // 実際に操作が必要なulにのみ pointer-events-auto で復元する
      className="relative z-[60] flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-zinc-200 bg-white/95 px-4 py-2 text-sm pointer-events-none dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        タグで絞り込み
      </span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 pointer-events-auto">
        {sortedTags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <li key={tag.id}>
              <label
                data-testid={TAG_FILTER_OPTION_TEST_ID}
                data-tag-id={tag.id}
                data-selected={isSelected ? "true" : "false"}
                className="flex cursor-pointer items-center gap-1.5 text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleTag(tag.id)}
                  className="h-4 w-4"
                />
                {tag.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
