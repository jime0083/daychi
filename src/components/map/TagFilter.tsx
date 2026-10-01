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
 *
 * タスク7-3(公開ページのデザイン刷新)での見た目変更:
 * - PerformerFilter.tsxと全く同じ見た目(見本の`.filterbar`のクリーム地+Vollkornラベル+
 *   緑のピル型選択肢)にする。チェックボックスを非表示にしない理由もPerformerFilter.tsxの
 *   コメント「タスク7-3」を参照(Playwrightのcheck()/uncheck()との整合性)。
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
      className="relative z-[60] flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-brand-line bg-brand-paper/95 px-4 py-2 text-sm pointer-events-none"
    >
      <span className="font-brand-display text-xs font-black tracking-wide text-brand-blue">
        タグで絞り込み
      </span>
      <ul className="flex flex-wrap gap-x-2 gap-y-1.5 pointer-events-auto">
        {sortedTags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <li key={tag.id}>
              <label
                data-testid={TAG_FILTER_OPTION_TEST_ID}
                data-tag-id={tag.id}
                data-selected={isSelected ? "true" : "false"}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-brand-green px-3 py-1 text-sm font-bold transition-colors ${
                  isSelected
                    ? "bg-brand-green text-white shadow-[0_2px_0_var(--brand-green-deep)]"
                    : "bg-brand-paper text-brand-green"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleTag(tag.id)}
                  className="h-3.5 w-3.5 accent-brand-green"
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
