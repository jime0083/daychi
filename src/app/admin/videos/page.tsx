"use client";

/**
 * 動画登録CRUD画面(/admin/videos、タスク2-3。バリデーション/削除確認/
 * 成功フィードバック/oEmbed呼び出しの認可ヘッダーはタスク2-7で強化)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」videos に準拠し、
 * YouTube URLを貼り付け→動画ID抽出(src/lib/youtube.ts)→oEmbed API
 * (/api/admin/oembed経由。設計判断はそちらのコメント参照)でタイトルを自動取得し、
 * 公開日(publishedAt)は手入力する。ドキュメントID = YouTube動画IDとして作成する
 * (src/repositories/videos.ts の createVideo は元々ID指定作成に対応済み)。
 *
 * status(draft/published)は作成時に "draft" 固定とする。draft⇔published切替は
 * タスク2-6でPublishStatusToggle(共通コンポーネント)により一覧から行う。
 *
 * oEmbed呼び出しの認可(タスク2-7): /api/admin/oembed は管理者ID Tokenの検証を
 * 必須にしたため(src/app/api/admin/oembed/route.ts参照)、呼び出し側であるこの
 * ページも useAdminAuth() で取得したFirebase Userの getIdToken() を
 * Authorization: Bearer ヘッダーに載せて送信する。
 *
 * バリデーション: 動画情報取得済み・タイトル・公開日をそれぞれ検証し、
 * 不足項目をまとめてエラーメッセージ表示する。削除は確認ダイアログを挟む。
 * 作成・更新・公開切替の成功時は一時的な成功メッセージを表示する。
 */
import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PublishStatusToggle } from "@/components/admin/PublishStatusToggle";
import { SuccessMessage } from "@/components/admin/SuccessMessage";
import { useAdminAuth } from "@/lib/admin-auth";
import { useTransientMessage } from "@/lib/use-transient-message";
import type { ValidationResult } from "@/lib/validation";
import { createVideo, deleteVideo, listVideos, updateVideo } from "@/repositories/videos";
import type { PublishStatus } from "@/types/common";
import type { Video } from "@/types/video";
import { buildYoutubeThumbnailUrl, extractYouTubeVideoId } from "@/lib/youtube";

/** 動画作成フォームの状態。oEmbed取得後にvideoId/titleが埋まる */
interface VideoCreateFormState {
  url: string;
  videoId: string | null;
  title: string;
  publishedAt: string; // <input type="date"> の値(YYYY-MM-DD)
}

/** 動画編集フォームの状態(videoIdはドキュメントIDのため編集不可) */
interface VideoEditFormState {
  title: string;
  publishedAt: string;
}

interface ParsedVideoCreateForm {
  videoId: string;
  title: string;
  publishedAt: Timestamp;
}

interface ParsedVideoEditForm {
  title: string;
  publishedAt: Timestamp;
}

const EMPTY_CREATE_FORM: VideoCreateFormState = {
  url: "",
  videoId: null,
  title: "",
  publishedAt: "",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Timestamp を <input type="date"> 用の YYYY-MM-DD 文字列に変換する */
function timestampToDateInputValue(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 日付文字列(YYYY-MM-DD)をFirestoreのTimestampに変換する。不正な形式ならnull */
function parseDateInputValue(value: string): Timestamp | null {
  if (value.trim() === "") {
    return null;
  }
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

/** 一覧表示用に日付を YYYY/M/D 形式へ整形する */
function formatDateForDisplay(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** 作成フォームの検証: 動画情報取得済み・タイトル・公開日をすべて満たす必要がある */
function validateVideoCreateForm(
  form: VideoCreateFormState,
): ValidationResult<ParsedVideoCreateForm> {
  const errors: string[] = [];

  if (form.videoId === null) {
    errors.push("先に「動画情報を取得」を実行してください");
  }
  const title = form.title.trim();
  if (title === "") {
    errors.push("タイトルを入力してください");
  }
  const publishedAt = parseDateInputValue(form.publishedAt);
  if (publishedAt === null) {
    errors.push("公開日を入力してください");
  }

  if (errors.length > 0 || form.videoId === null || publishedAt === null) {
    return { ok: false, errors };
  }
  return { ok: true, data: { videoId: form.videoId, title, publishedAt } };
}

/** 編集フォームの検証: タイトル・公開日が必須 */
function validateVideoEditForm(form: VideoEditFormState): ValidationResult<ParsedVideoEditForm> {
  const errors: string[] = [];

  const title = form.title.trim();
  if (title === "") {
    errors.push("タイトルを入力してください");
  }
  const publishedAt = parseDateInputValue(form.publishedAt);
  if (publishedAt === null) {
    errors.push("公開日を入力してください");
  }

  if (errors.length > 0 || publishedAt === null) {
    return { ok: false, errors };
  }
  return { ok: true, data: { title, publishedAt } };
}

export default function AdminVideosPage() {
  const authStatus = useAdminAuth();

  const [videos, setVideos] = useState<Video[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<VideoCreateFormState>(EMPTY_CREATE_FORM);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [createErrors, setCreateErrors] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VideoEditFormState>({ title: "", publishedAt: "" });
  const [editErrors, setEditErrors] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);

  const { message: successMessage, show: showSuccess } = useTransientMessage();

  // アンマウント後の setState を防ぐガード(/admin/performers と同じパターン)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listVideos();
      if (mountedRef.current) {
        setVideos([...list].sort((a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis()));
        setListError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`動画一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, []);

  useEffect(() => {
    listVideos()
      .then((list) => {
        if (mountedRef.current) {
          setVideos([...list].sort((a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis()));
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`動画一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  async function handleFetchInfo(): Promise<void> {
    const videoId = extractYouTubeVideoId(createForm.url);
    if (videoId === null) {
      setFetchError("有効なYouTube URLではありません");
      return;
    }
    if (authStatus.state !== "signed-in") {
      setFetchError("認証状態を確認できませんでした。画面を再読み込みしてください");
      return;
    }
    setFetchError(null);
    setFetching(true);
    try {
      const idToken = await authStatus.user.getIdToken();
      const response = await fetch(`/api/admin/oembed?url=${encodeURIComponent(createForm.url)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await response.json()) as { videoId?: string; title?: string; error?: string };
      if (!response.ok || body.title === undefined || body.videoId === undefined) {
        throw new Error(body.error ?? `動画情報の取得に失敗しました(status: ${response.status})`);
      }
      setCreateForm((current) => ({ ...current, videoId: body.videoId!, title: body.title! }));
    } catch (error) {
      setFetchError(`動画情報の取得に失敗しました: ${errorMessage(error)}`);
    } finally {
      if (mountedRef.current) {
        setFetching(false);
      }
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = validateVideoCreateForm(createForm);
    if (!result.ok) {
      setCreateErrors(result.errors);
      return;
    }
    setCreateErrors([]);
    try {
      await createVideo(result.data.videoId, {
        title: result.data.title,
        publishedAt: result.data.publishedAt,
        status: "draft",
      });
      setCreateForm(EMPTY_CREATE_FORM);
      showSuccess("動画を作成しました");
      await reload();
    } catch (error) {
      setCreateErrors([`作成に失敗しました: ${errorMessage(error)}`]);
    }
  }

  function startEdit(video: Video): void {
    setEditingId(video.id);
    setEditForm({ title: video.title, publishedAt: timestampToDateInputValue(video.publishedAt) });
    setEditErrors([]);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditErrors([]);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const result = validateVideoEditForm(editForm);
    if (!result.ok) {
      setEditErrors(result.errors);
      return;
    }
    try {
      await updateVideo(id, result.data);
      setEditingId(null);
      setEditErrors([]);
      showSuccess("動画を更新しました");
      await reload();
    } catch (error) {
      setEditErrors([`更新に失敗しました: ${errorMessage(error)}`]);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteVideo(id);
      if (editingId === id) {
        setEditingId(null);
      }
      await reload();
    } catch (error) {
      setListError(`削除に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }
    const target = deleteTarget;
    setDeleteTarget(null);
    await handleDelete(target.id);
  }

  async function handleToggleStatus(id: string, nextStatus: PublishStatus): Promise<void> {
    try {
      await updateVideo(id, { status: nextStatus });
      showSuccess(nextStatus === "published" ? "動画を公開しました" : "動画を下書きに戻しました");
      await reload();
    } catch (error) {
      setListError(`ステータス変更に失敗しました: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">動画マスタ</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          YouTube URLを貼り付けて動画を登録します。公開日は手入力してください。
        </p>
      </div>

      <SuccessMessage testId="video-success" message={successMessage} />

      <form
        data-testid="video-create-form"
        onSubmit={(event) => {
          void handleCreateSubmit(event);
        }}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            YouTube URL
            <input
              data-testid="video-create-url"
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={createForm.url}
              onChange={(event) =>
                setCreateForm({ ...createForm, url: event.target.value, videoId: null, title: "" })
              }
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="button"
            data-testid="video-create-fetch"
            disabled={fetching}
            onClick={() => {
              void handleFetchInfo();
            }}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {fetching ? "取得中..." : "動画情報を取得"}
          </button>
        </div>
        {fetchError !== null && (
          <p data-testid="video-create-fetch-error" className="text-sm text-red-600 dark:text-red-400">
            {fetchError}
          </p>
        )}

        {createForm.videoId !== null && (
          <div className="flex items-center gap-3">
            {/* i.ytimg.com は next.config.ts の画像許可ドメイン設定が未整備のため next/image ではなく img を使用 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="video-create-thumbnail"
              src={buildYoutubeThumbnailUrl(createForm.videoId)}
              alt="サムネイルプレビュー"
              className="h-16 w-28 rounded object-cover"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              動画ID: {createForm.videoId}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            タイトル
            <input
              data-testid="video-create-title"
              type="text"
              value={createForm.title}
              onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            公開日
            <input
              data-testid="video-create-publishedat"
              type="date"
              value={createForm.publishedAt}
              onChange={(event) => setCreateForm({ ...createForm, publishedAt: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            作成
          </button>
        </div>
        {createErrors.length > 0 && (
          <ul
            data-testid="video-create-error"
            className="flex flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
          >
            {createErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </form>

      {listError !== null && (
        <p data-testid="video-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}

      {videos === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">サムネイル</th>
                <th className="py-2 pr-4 font-medium">タイトル</th>
                <th className="py-2 pr-4 font-medium">公開日</th>
                <th className="py-2 pr-4 font-medium">ステータス</th>
                <th className="py-2 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => {
                const isEditing = editingId === video.id;
                return (
                  <tr
                    key={video.id}
                    data-testid="video-row"
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    {isEditing ? (
                      <td colSpan={5} className="py-2 pr-4">
                        <form
                          onSubmit={(event) => {
                            void handleEditSubmit(event, video.id);
                          }}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <label className="flex min-w-64 flex-1 flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            タイトル
                            <input
                              data-testid="video-edit-title"
                              type="text"
                              value={editForm.title}
                              onChange={(event) =>
                                setEditForm({ ...editForm, title: event.target.value })
                              }
                              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                            公開日
                            <input
                              data-testid="video-edit-publishedat"
                              type="date"
                              value={editForm.publishedAt}
                              onChange={(event) =>
                                setEditForm({ ...editForm, publishedAt: event.target.value })
                              }
                              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
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
                              data-testid="video-edit-error"
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
                        <td className="py-2 pr-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            data-testid="video-thumbnail"
                            src={buildYoutubeThumbnailUrl(video.id)}
                            alt={video.title}
                            className="h-12 w-20 rounded object-cover"
                          />
                        </td>
                        <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{video.title}</td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {formatDateForDisplay(video.publishedAt)}
                        </td>
                        <td
                          data-testid="video-status"
                          className="py-2 pr-4 text-zinc-700 dark:text-zinc-300"
                        >
                          {video.status === "published" ? "公開" : "下書き"}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <PublishStatusToggle
                              status={video.status}
                              testId="video-status-toggle"
                              onToggle={(nextStatus) => handleToggleStatus(video.id, nextStatus)}
                            />
                            <button
                              type="button"
                              onClick={() => startEdit(video)}
                              className="rounded border border-zinc-300 px-3 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(video)}
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
              {videos.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    動画が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget !== null && (
        <ConfirmDialog
          testId="video-delete-confirm"
          title="動画を削除しますか?"
          message={`「${deleteTarget.title}」を削除します。この操作は取り消せません。`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      )}
    </div>
  );
}
