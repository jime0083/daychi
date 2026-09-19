"use client";

/**
 * 動画登録CRUD画面(/admin/videos、タスク2-3)。
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
 * 入力バリデーションは最小限(必須項目のみ)とし、削除も確認ダイアログなしの
 * 即時実行とする(作り込みはタスク2-7の範囲。/admin/performers の実装パターンに倣う)。
 */
import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { PublishStatusToggle } from "@/components/admin/PublishStatusToggle";
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

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<VideoCreateFormState>(EMPTY_CREATE_FORM);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VideoEditFormState>({ title: "", publishedAt: "" });
  const [editError, setEditError] = useState<string | null>(null);

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
    setFetchError(null);
    setFetching(true);
    try {
      const response = await fetch(`/api/admin/oembed?url=${encodeURIComponent(createForm.url)}`);
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
    if (createForm.videoId === null) {
      setCreateError("先に「動画情報を取得」を実行してください");
      return;
    }
    const title = createForm.title.trim();
    if (title === "") {
      setCreateError("タイトルを入力してください");
      return;
    }
    const publishedAt = parseDateInputValue(createForm.publishedAt);
    if (publishedAt === null) {
      setCreateError("公開日を入力してください");
      return;
    }
    setCreateError(null);
    try {
      await createVideo(createForm.videoId, { title, publishedAt, status: "draft" });
      setCreateForm(EMPTY_CREATE_FORM);
      await reload();
    } catch (error) {
      setCreateError(`作成に失敗しました: ${errorMessage(error)}`);
    }
  }

  function startEdit(video: Video): void {
    setEditingId(video.id);
    setEditForm({ title: video.title, publishedAt: timestampToDateInputValue(video.publishedAt) });
    setEditError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const title = editForm.title.trim();
    if (title === "") {
      setEditError("タイトルを入力してください");
      return;
    }
    const publishedAt = parseDateInputValue(editForm.publishedAt);
    if (publishedAt === null) {
      setEditError("公開日を入力してください");
      return;
    }
    try {
      await updateVideo(id, { title, publishedAt });
      setEditingId(null);
      setEditError(null);
      await reload();
    } catch (error) {
      setEditError(`更新に失敗しました: ${errorMessage(error)}`);
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

  async function handleToggleStatus(id: string, nextStatus: PublishStatus): Promise<void> {
    try {
      await updateVideo(id, { status: nextStatus });
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
        {createError !== null && (
          <p data-testid="video-create-error" className="text-sm text-red-600 dark:text-red-400">
            {createError}
          </p>
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
                          {editError !== null && (
                            <p
                              data-testid="video-edit-error"
                              className="w-full text-red-600 dark:text-red-400"
                            >
                              {editError}
                            </p>
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
                              onClick={() => {
                                void handleDelete(video.id);
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
    </div>
  );
}
