"use client";

/**
 * タグマスタCRUD画面(/admin/tags、タスク5-1)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」tags に準拠し、
 * 名前(name)・表示順(order)のCRUDを行う。作りは src/app/admin/performers/page.tsx
 * (フォーム・表示順ソート・削除確認ダイアログ・成功メッセージ・data-testid命名)に合わせる。
 *
 * このページ独自の仕様(requirements.md「3.2 管理画面」2026-09-23/2026-09-24決定):
 * - 同じ名前のタグは作成・名前変更とも不可(前後の空白を除いて比較。編集で自分自身と
 *   同名のままは可)。重複時はエラー表示して保存しない
 * - 店舗に付いているタグを削除する場合は、確認ダイアログで付いている店舗数
 *   (shops.tagIds にそのタグIDを含む件数。status問わず全店舗)を示し、削除実行時に
 *   全店舗の tagIds からそのタグを外してからタグを削除する
 *   (src/repositories/tags.ts の countShopsWithTag / deleteTagAndUnassignFromShops)
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { SuccessMessage } from "@/components/admin/SuccessMessage";
import {
  countShopsWithTag,
  createTag,
  deleteTagAndUnassignFromShops,
  listTags,
  updateTag,
} from "@/repositories/tags";
import type { Tag, TagData } from "@/types/tag";
import { useTransientMessage } from "@/lib/use-transient-message";
import type { ValidationResult } from "@/lib/validation";

/** フォームの入力値(number入力もいったん文字列で保持し、送信時にパースする) */
interface TagFormState {
  name: string;
  order: string;
}

const EMPTY_FORM: TagFormState = { name: "", order: "0" };

/** 削除確認ダイアログの表示対象(対象タグ + 付いている店舗数) */
interface DeleteTarget {
  tag: Tag;
  shopCount: number;
}

/**
 * フォーム入力値を検証し、Firestoreへ書き込む形(TagData)に変換する。
 * 名前が空、表示順が入力されているのに数値でない、または同じ名前(前後空白を除いて比較)の
 * タグが既に存在する場合はエラーメッセージを返す。
 *
 * @param existingTags 重複チェック対象の既存タグ一覧
 * @param excludeId 編集時、自分自身を重複チェックから除外するためのタグID
 */
function validateTagForm(
  form: TagFormState,
  existingTags: Tag[],
  excludeId?: string,
): ValidationResult<TagData> {
  const errors: string[] = [];

  const name = form.name.trim();
  if (name === "") {
    errors.push("名前を入力してください");
  } else {
    const duplicated = existingTags.some(
      (tag) => tag.id !== excludeId && tag.name.trim() === name,
    );
    if (duplicated) {
      errors.push("同じ名前のタグが既に存在します");
    }
  }

  let order = 0;
  const trimmedOrder = form.order.trim();
  if (trimmedOrder !== "") {
    const parsedOrder = Number(trimmedOrder);
    if (!Number.isFinite(parsedOrder)) {
      errors.push("表示順は数値で入力してください");
    } else {
      order = parsedOrder;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: { name, order } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 削除確認ダイアログのメッセージ(付いている店舗数の有無で文面を変える) */
function deleteConfirmMessage(tag: Tag, shopCount: number): string {
  if (shopCount > 0) {
    return `「${tag.name}」を削除します。このタグは${shopCount}件の店舗に付いています。削除すると、それらの店舗からこのタグの割り当てが外れます。この操作は取り消せません。`;
  }
  return `「${tag.name}」を削除します。この操作は取り消せません。`;
}

export default function AdminTagsPage() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<TagFormState>(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TagFormState>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { message: successMessage, show: showSuccess } = useTransientMessage();

  // アンマウント後の setState を防ぐガード(performers/page.tsx と同様の方針)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listTags();
      if (mountedRef.current) {
        setTags([...list].sort((a, b) => a.order - b.order));
        setListError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`タグ一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, []);

  useEffect(() => {
    listTags()
      .then((list) => {
        if (mountedRef.current) {
          setTags([...list].sort((a, b) => a.order - b.order));
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`タグ一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = validateTagForm(createForm, tags ?? []);
    if (!result.ok) {
      setCreateErrors(result.errors);
      return;
    }
    setCreateErrors([]);
    try {
      await createTag(result.data);
      setCreateForm(EMPTY_FORM);
      showSuccess("タグを作成しました");
      await reload();
    } catch (error) {
      setCreateErrors([`作成に失敗しました: ${errorMessage(error)}`]);
    }
  }

  function startEdit(tag: Tag): void {
    setEditingId(tag.id);
    setEditForm({ name: tag.name, order: String(tag.order) });
    setEditErrors([]);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditErrors([]);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const result = validateTagForm(editForm, tags ?? [], id);
    if (!result.ok) {
      setEditErrors(result.errors);
      return;
    }
    try {
      await updateTag(id, result.data);
      setEditingId(null);
      setEditErrors([]);
      showSuccess("タグを更新しました");
      await reload();
    } catch (error) {
      setEditErrors([`更新に失敗しました: ${errorMessage(error)}`]);
    }
  }

  async function handleDeleteClick(tag: Tag): Promise<void> {
    setDeleteError(null);
    try {
      const shopCount = await countShopsWithTag(tag.id);
      setDeleteTarget({ tag, shopCount });
    } catch (error) {
      setDeleteError(`付いている店舗数の確認に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }
    const { tag } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteTagAndUnassignFromShops(tag.id);
      if (editingId === tag.id) {
        setEditingId(null);
      }
      showSuccess("タグを削除しました");
      await reload();
    } catch (error) {
      setListError(`削除に失敗しました: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">タグマスタ</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          名前・表示順を管理します。同じ名前のタグは登録できません。
        </p>
      </div>

      <SuccessMessage testId="tag-success" message={successMessage} />

      <form
        data-testid="tag-create-form"
        onSubmit={(event) => {
          void handleCreateSubmit(event);
        }}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          名前
          <input
            data-testid="tag-create-name"
            type="text"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          表示順
          <input
            data-testid="tag-create-order"
            type="number"
            value={createForm.order}
            onChange={(event) => setCreateForm({ ...createForm, order: event.target.value })}
            className="w-24 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          作成
        </button>
        {createErrors.length > 0 && (
          <ul
            data-testid="tag-create-error"
            className="flex w-full flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
          >
            {createErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </form>

      {listError !== null && (
        <p data-testid="tag-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}
      {deleteError !== null && (
        <p data-testid="tag-delete-error" className="text-sm text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}

      {tags === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">名前</th>
                <th className="py-2 pr-4 font-medium">表示順</th>
                <th className="py-2 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => {
                const isEditing = editingId === tag.id;
                return (
                  <tr
                    key={tag.id}
                    data-testid="tag-row"
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    {isEditing ? (
                      <td colSpan={3} className="py-2 pr-4">
                        <form
                          onSubmit={(event) => {
                            void handleEditSubmit(event, tag.id);
                          }}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            名前
                            <input
                              data-testid="tag-edit-name"
                              type="text"
                              value={editForm.name}
                              onChange={(event) =>
                                setEditForm({ ...editForm, name: event.target.value })
                              }
                              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            表示順
                            <input
                              data-testid="tag-edit-order"
                              type="number"
                              value={editForm.order}
                              onChange={(event) =>
                                setEditForm({ ...editForm, order: event.target.value })
                              }
                              className="w-24 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </label>
                          <button
                            type="submit"
                            className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            キャンセル
                          </button>
                          {editErrors.length > 0 && (
                            <ul
                              data-testid="tag-edit-error"
                              className="flex w-full flex-col gap-0.5 text-red-600 dark:text-red-400"
                            >
                              {editErrors.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          )}
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{tag.name}</td>
                        <td data-testid="tag-order" className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {tag.order}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(tag)}
                              className="rounded border border-zinc-300 px-3 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteClick(tag);
                              }}
                              className="rounded border border-red-300 px-3 py-1 text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {tags.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    タグが登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget !== null && (
        <ConfirmDialog
          testId="tag-delete-confirm"
          title="タグを削除しますか?"
          message={deleteConfirmMessage(deleteTarget.tag, deleteTarget.shopCount)}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      )}
    </div>
  );
}
