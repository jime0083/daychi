"use client";

/**
 * 訪問(Visit)登録CRUD画面(/admin/visits、タスク2-5)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」visits に準拠し、
 * 店舗(shopId)×動画(videoId)を紐付け、出演者ごとの飲食メニュー
 * (consumptions: [{ performerId, items[] }])を動的フォーム
 * (VisitConsumptionsForm)で入力するCRUDを行う。
 *
 * 店舗/動画/出演者はセレクトボックスで選択する(表示は店名・動画タイトル・
 * 出演者名)。これらのマスタは他の管理画面(2-2〜2-4)で管理されるため、
 * このページでは一覧取得のみ行い、作成・編集は行わない。
 *
 * status(draft/published)は本タスクでは作成時に "draft" 固定とする
 * (draft⇔published切替UIはタスク2-6の範囲)。
 *
 * 入力バリデーションは最小限とする: 店舗・動画は必須選択、出演者の行は
 * 1件以上必須、各行は出演者選択必須+品目(空文字除く)1件以上必須とする
 * (本格的なエラー表示の作り込みはタスク2-7の範囲)。削除も確認ダイアログ
 * なしの即時実行とする(/admin/shops 等と同じパターン)。
 *
 * 一覧では shopId/videoId/performerId を名称に解決して表示する
 * (マスタが削除されID解決できない場合はIDをそのまま表示するフォールバックとする)。
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { VisitConsumptionsForm } from "@/components/admin/VisitConsumptionsForm";
import { listPerformers } from "@/repositories/performers";
import { listShops } from "@/repositories/shops";
import { listVideos } from "@/repositories/videos";
import { createVisit, deleteVisit, listVisits, updateVisit } from "@/repositories/visits";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Video } from "@/types/video";
import type { Visit, VisitConsumption } from "@/types/visit";

/** 訪問フォームの入力値 */
interface VisitFormState {
  shopId: string;
  videoId: string;
  consumptions: VisitConsumption[];
}

/** フォーム入力値のうちバリデーションを通過した後の値(statusは含まない) */
interface ParsedVisitForm {
  shopId: string;
  videoId: string;
  consumptions: VisitConsumption[];
}

const EMPTY_FORM: VisitFormState = { shopId: "", videoId: "", consumptions: [] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * フォーム入力値を検証し、Firestoreへ書き込む形に変換する。
 * 店舗・動画が未選択、出演者の行が0件、いずれかの行で出演者未選択、
 * または品目(空文字除く)が0件の場合は null を返す。
 */
function parseFormState(form: VisitFormState): ParsedVisitForm | null {
  if (form.shopId === "" || form.videoId === "") {
    return null;
  }
  if (form.consumptions.length === 0) {
    return null;
  }
  const consumptions: VisitConsumption[] = [];
  for (const row of form.consumptions) {
    if (row.performerId === "") {
      return null;
    }
    const items = row.items.map((item) => item.trim()).filter((item) => item !== "");
    if (items.length === 0) {
      return null;
    }
    consumptions.push({ performerId: row.performerId, items });
  }
  return { shopId: form.shopId, videoId: form.videoId, consumptions };
}

const VALIDATION_ERROR_MESSAGE =
  "店舗・動画を選択し、出演者ごとの飲食メニューを1件以上(品目も1件以上)入力してください";

export default function AdminVisitsPage() {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [shops, setShops] = useState<Shop[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<VisitFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VisitFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  // アンマウント後の setState を防ぐガード(/admin/shops, /admin/videos と同じパターン)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listVisits();
      if (mountedRef.current) {
        setVisits([...list].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()));
        setListError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`訪問一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, []);

  useEffect(() => {
    listVisits()
      .then((list) => {
        if (mountedRef.current) {
          setVisits([...list].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()));
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`訪問一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  // 店舗・動画・出演者のセレクト選択肢は他画面(2-2〜2-4)で管理するマスタのため、
  // このページでは一覧取得のみ行う
  useEffect(() => {
    Promise.all([listShops(), listVideos(), listPerformers()])
      .then(([shopList, videoList, performerList]) => {
        if (mountedRef.current) {
          setShops([...shopList].sort((a, b) => a.name.localeCompare(b.name, "ja")));
          setVideos(
            [...videoList].sort((a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis()),
          );
          setPerformers([...performerList].sort((a, b) => a.order - b.order));
          setOptionsError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setOptionsError(`店舗・動画・出演者の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  function shopName(shopId: string): string {
    return shops.find((shop) => shop.id === shopId)?.name ?? shopId;
  }

  function videoTitle(videoId: string): string {
    return videos.find((video) => video.id === videoId)?.title ?? videoId;
  }

  function performerName(performerId: string): string {
    return performers.find((performer) => performer.id === performerId)?.name ?? performerId;
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseFormState(createForm);
    if (parsed === null) {
      setCreateError(VALIDATION_ERROR_MESSAGE);
      return;
    }
    setCreateError(null);
    try {
      await createVisit({ ...parsed, status: "draft" });
      setCreateForm(EMPTY_FORM);
      await reload();
    } catch (error) {
      setCreateError(`作成に失敗しました: ${errorMessage(error)}`);
    }
  }

  function startEdit(visit: Visit): void {
    setEditingId(visit.id);
    setEditForm({
      shopId: visit.shopId,
      videoId: visit.videoId,
      consumptions: visit.consumptions.map((row) => ({ ...row, items: [...row.items] })),
    });
    setEditError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const parsed = parseFormState(editForm);
    if (parsed === null) {
      setEditError(VALIDATION_ERROR_MESSAGE);
      return;
    }
    try {
      await updateVisit(id, parsed);
      setEditingId(null);
      setEditError(null);
      await reload();
    } catch (error) {
      setEditError(`更新に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteVisit(id);
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
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">訪問登録</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          店舗×動画を紐付け、出演者ごとの飲食メニューを登録します。
        </p>
      </div>

      {optionsError !== null && (
        <p data-testid="visit-options-error" className="text-sm text-red-600 dark:text-red-400">
          {optionsError}
        </p>
      )}

      <form
        data-testid="visit-create-form"
        onSubmit={(event) => {
          void handleCreateSubmit(event);
        }}
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            店舗
            <select
              data-testid="visit-create-shop"
              value={createForm.shopId}
              onChange={(event) => setCreateForm({ ...createForm, shopId: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">選択してください</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            動画
            <select
              data-testid="visit-create-video"
              value={createForm.videoId}
              onChange={(event) => setCreateForm({ ...createForm, videoId: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">選択してください</option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <VisitConsumptionsForm
          idPrefix="visit-create"
          consumptions={createForm.consumptions}
          performers={performers}
          onChange={(next) => setCreateForm({ ...createForm, consumptions: next })}
        />

        <div>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            作成
          </button>
        </div>

        {createError !== null && (
          <p data-testid="visit-create-error" className="text-sm text-red-600 dark:text-red-400">
            {createError}
          </p>
        )}
      </form>

      {listError !== null && (
        <p data-testid="visit-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}

      {visits === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <div className="flex flex-col gap-4">
          {visits.map((visit) => {
            const isEditing = editingId === visit.id;
            return (
              <div
                key={visit.id}
                data-testid="visit-row"
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                {isEditing ? (
                  <form
                    onSubmit={(event) => {
                      void handleEditSubmit(event, visit.id);
                    }}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
                        店舗
                        <select
                          data-testid="visit-edit-shop"
                          value={editForm.shopId}
                          onChange={(event) =>
                            setEditForm({ ...editForm, shopId: event.target.value })
                          }
                          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">選択してください</option>
                          {shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>
                              {shop.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
                        動画
                        <select
                          data-testid="visit-edit-video"
                          value={editForm.videoId}
                          onChange={(event) =>
                            setEditForm({ ...editForm, videoId: event.target.value })
                          }
                          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">選択してください</option>
                          {videos.map((video) => (
                            <option key={video.id} value={video.id}>
                              {video.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <VisitConsumptionsForm
                      idPrefix="visit-edit"
                      consumptions={editForm.consumptions}
                      performers={performers}
                      onChange={(next) => setEditForm({ ...editForm, consumptions: next })}
                    />

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        キャンセル
                      </button>
                    </div>

                    {editError !== null && (
                      <p
                        data-testid="visit-edit-error"
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {editError}
                      </p>
                    )}
                  </form>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {shopName(visit.shopId)}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {videoTitle(visit.videoId)}
                        </p>
                      </div>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {visit.status === "published" ? "公開" : "下書き"}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {visit.consumptions.map((consumption, index) => (
                        <li
                          key={`${consumption.performerId}-${index}`}
                          data-testid="visit-consumption-summary"
                        >
                          {performerName(consumption.performerId)}: {consumption.items.join("、")}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(visit)}
                        className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDelete(visit.id);
                        }}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {visits.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">訪問が登録されていません</p>
          )}
        </div>
      )}
    </div>
  );
}
