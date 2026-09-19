"use client";

/**
 * 出演者マスタCRUD画面(/admin/performers、タスク2-2)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」performers に準拠し、
 * 名前(name)・メイン出演者フラグ(isMain)・表示順(order)のCRUDを行う。
 * このページは src/app/admin/layout.tsx 経由の AdminGate 配下でのみ描画されるため、
 * 表示された時点で管理者(adminクレーム保持者)であることが保証されている。
 *
 * 入力バリデーションは「名前必須」のみの最小限とする(本格的なバリデーション・
 * エラー表示の作り込みはタスク2-7の範囲)。削除も確認ダイアログなしの即時実行とする
 * (削除確認ダイアログの追加もタスク2-7の範囲)。
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  createPerformer,
  deletePerformer,
  listPerformers,
  updatePerformer,
} from "@/repositories/performers";
import type { Performer, PerformerData } from "@/types/performer";

/** フォームの入力値(number入力もいったん文字列で保持し、送信時にパースする) */
interface PerformerFormState {
  name: string;
  isMain: boolean;
  order: string;
}

const EMPTY_FORM: PerformerFormState = { name: "", isMain: false, order: "0" };

/** フォーム入力値を検証し、Firestoreへ書き込む形(PerformerData)に変換する。名前が空なら null */
function parseFormState(form: PerformerFormState): PerformerData | null {
  const name = form.name.trim();
  if (name === "") {
    return null;
  }
  const order = Number(form.order);
  return { name, isMain: form.isMain, order: Number.isFinite(order) ? order : 0 };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function AdminPerformersPage() {
  const [performers, setPerformers] = useState<Performer[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<PerformerFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PerformerFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  // アンマウント後の setState を防ぐガード。マウント中かどうかをrefで保持する
  // (reactの検証ルール上、effect内での直接的なsetState呼び出しを避けるため、
  // 実際のsetState呼び出しをこのrefで分岐させている)
  const mountedRef = useRef(true);
  useEffect(() => {
    // 開発モードのStrict Mode(mount→unmount→再mount)でも、再mount後は
    // 必ずtrueに戻す(unmount時にfalseへ倒したまま次のmountに引き継がれるのを防ぐ)
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listPerformers();
      if (mountedRef.current) {
        setPerformers([...list].sort((a, b) => a.order - b.order));
        setListError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`出演者一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, []);

  // マウント時の初回読み込み。setState呼び出しを .then()/.catch() の
  // コールバック内に閉じ込めることで、effect本体からの直接的な setState 呼び出しを避ける
  useEffect(() => {
    listPerformers()
      .then((list) => {
        if (mountedRef.current) {
          setPerformers([...list].sort((a, b) => a.order - b.order));
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`出演者一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = parseFormState(createForm);
    if (!data) {
      setCreateError("名前を入力してください");
      return;
    }
    setCreateError(null);
    try {
      await createPerformer(data);
      setCreateForm(EMPTY_FORM);
      await reload();
    } catch (error) {
      setCreateError(`作成に失敗しました: ${errorMessage(error)}`);
    }
  }

  function startEdit(performer: Performer): void {
    setEditingId(performer.id);
    setEditForm({ name: performer.name, isMain: performer.isMain, order: String(performer.order) });
    setEditError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const data = parseFormState(editForm);
    if (!data) {
      setEditError("名前を入力してください");
      return;
    }
    try {
      await updatePerformer(id, data);
      setEditingId(null);
      setEditError(null);
      await reload();
    } catch (error) {
      setEditError(`更新に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deletePerformer(id);
      if (editingId === id) {
        setEditingId(null);
      }
      await reload();
    } catch (error) {
      setListError(`削除に失敗しました: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">出演者マスタ</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          名前・メイン出演者フラグ・表示順を管理します。
        </p>
      </div>

      <form
        data-testid="performer-create-form"
        onSubmit={(event) => {
          void handleCreateSubmit(event);
        }}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          名前
          <input
            data-testid="performer-create-name"
            type="text"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            data-testid="performer-create-ismain"
            type="checkbox"
            checked={createForm.isMain}
            onChange={(event) => setCreateForm({ ...createForm, isMain: event.target.checked })}
          />
          メイン出演者
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          表示順
          <input
            data-testid="performer-create-order"
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
        {createError !== null && (
          <p
            data-testid="performer-create-error"
            className="w-full text-sm text-red-600 dark:text-red-400"
          >
            {createError}
          </p>
        )}
      </form>

      {listError !== null && (
        <p data-testid="performer-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}

      {performers === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">名前</th>
                <th className="py-2 pr-4 font-medium">メイン出演者</th>
                <th className="py-2 pr-4 font-medium">表示順</th>
                <th className="py-2 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {performers.map((performer) => {
                const isEditing = editingId === performer.id;
                return (
                  <tr
                    key={performer.id}
                    data-testid="performer-row"
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    {isEditing ? (
                      <td colSpan={4} className="py-2 pr-4">
                        <form
                          onSubmit={(event) => {
                            void handleEditSubmit(event, performer.id);
                          }}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            名前
                            <input
                              data-testid="performer-edit-name"
                              type="text"
                              value={editForm.name}
                              onChange={(event) =>
                                setEditForm({ ...editForm, name: event.target.value })
                              }
                              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                            <input
                              data-testid="performer-edit-ismain"
                              type="checkbox"
                              checked={editForm.isMain}
                              onChange={(event) =>
                                setEditForm({ ...editForm, isMain: event.target.checked })
                              }
                            />
                            メイン出演者
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            表示順
                            <input
                              data-testid="performer-edit-order"
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
                          {editError !== null && (
                            <p
                              data-testid="performer-edit-error"
                              className="w-full text-red-600 dark:text-red-400"
                            >
                              {editError}
                            </p>
                          )}
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                          {performer.name}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {performer.isMain ? "○" : ""}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {performer.order}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(performer)}
                              className="rounded border border-zinc-300 px-3 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDelete(performer.id);
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
              {performers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    出演者が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
