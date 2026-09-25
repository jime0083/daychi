"use client";

/**
 * タグ複数選択チェックボックスUI(タスク5-2: 店舗へのタグ付与UI)。
 *
 * requirements.md「3.2 管理画面」2026-09-24決定「タグの付与は店舗管理画面の編集フォームに
 * 加え、AI取り込みのレビュー画面でも行える」に基づき、/admin/shops の店舗作成・編集フォームと
 * /admin/review/[videoId] の店舗カード(ReviewShopCard)の両方で共通に使う。
 *
 * - タグマスタの全タグを order 昇順のチェックボックスで表示する
 * - タグが1件も無い場合は「タグが未登録です」とタグ管理画面(/admin/tags)へのリンクを表示する
 * - selectedTagIds に allTags に存在しない(削除済み)タグIDが含まれていても、
 *   表示対象からは単に除外されるだけで例外は投げない。トグル操作は該当タグIDの
 *   追加/削除のみを行い、表示されていない他の(削除済み)IDはそのまま保持する
 * - 数タグ(3〜10件程度)を想定し、flex-wrapで折り返してモバイル幅でも崩れないようにする
 *
 * idPrefix は呼び出し側の data-testid 命名規則(例: "shop-create", "shop-edit",
 * "review-shop")に合わせて渡す(同一画面内に複数インスタンスが存在してもtestidが衝突しないため)。
 */
import Link from "next/link";

import type { Tag } from "@/types/tag";

interface TagCheckboxListProps {
  idPrefix: string;
  allTags: Tag[];
  selectedTagIds: string[];
  onChange: (nextTagIds: string[]) => void;
}

export function TagCheckboxList({
  idPrefix,
  allTags,
  selectedTagIds,
  onChange,
}: TagCheckboxListProps) {
  const sortedTags = [...allTags].sort((a, b) => a.order - b.order);

  if (sortedTags.length === 0) {
    return (
      <p
        data-testid={`${idPrefix}-tags-empty`}
        className="text-sm text-zinc-500 dark:text-zinc-400"
      >
        タグが未登録です。
        <Link
          href="/admin/tags"
          className="ml-1 text-blue-600 underline dark:text-blue-400"
        >
          タグ管理画面
        </Link>
        で登録してください。
      </p>
    );
  }

  const selected = new Set(selectedTagIds);

  function handleToggle(tagId: string, checked: boolean): void {
    if (checked) {
      onChange([...selectedTagIds, tagId]);
    } else {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    }
  }

  return (
    <fieldset
      data-testid={`${idPrefix}-tags`}
      className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200"
    >
      <legend className="px-0">タグ</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sortedTags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid={`${idPrefix}-tag-checkbox-${tag.id}`}
              checked={selected.has(tag.id)}
              onChange={(event) => handleToggle(tag.id, event.target.checked)}
            />
            {tag.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
