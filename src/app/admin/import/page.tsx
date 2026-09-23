"use client";

/**
 * AI自動抽出の取り込み実行画面(/admin/import、タスク4-4: 管理画面
 * 取り込み実行とレビューUI)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の2026-09-23決定
 * 「取り込み画面ではYouTubeチャンネルの未登録動画の一覧を表示し、管理者が
 * 取り込む動画を選んで実行する」に対応する。
 *
 * フロー:
 * 1. マウント時に listVideos()(既存videoId一覧。管理者セッションのため
 *    draft/published問わず全件取得できる)→ /api/admin/import/unregistered-videos
 *    (src/lib/admin-import-client.ts経由)で未登録動画一覧を取得する
 * 2. 管理者がチェックボックスで取り込む動画を選び「取り込み実行」を押す
 * 3. 選んだ動画ごとに順番に /api/admin/import/extract で下書き保存計画
 *    (DraftSavePlan)を取得し、saveDraftExtraction(plan)でFirestoreへ
 *    videos/shops/visitsをstatus:"draft"として保存する
 * 4. 動画ごとの成功/失敗と、作られた下書きへのレビュー画面リンクを表示する。
 *    1本の失敗(AI抽出エラー・保存エラーいずれも)で他の動画の処理は止めない
 *
 * 秘密情報(YOUTUBE_API_KEY・GEMINI_API_KEY)を要する処理はすべて
 * サーバー側(/api/admin/import/*)で行い、このページはFirestoreへの書き込みのみ
 * 自身の管理者セッション(useAdminAuth)で行う(route.tsのコメント参照)。
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchExtractionPlan, fetchUnregisteredVideos } from "@/lib/admin-import-client";
import { saveDraftExtraction } from "@/lib/ai-extraction/save-draft";
import { useAdminAuth } from "@/lib/admin-auth";
import { buildYoutubeThumbnailUrl } from "@/lib/youtube";
import type { ChannelVideoSummary } from "@/lib/youtube-data-api";
import { listVideos } from "@/repositories/videos";

interface ImportResult {
  videoId: string;
  title: string;
  status: "success" | "error";
  message?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function AdminImportPage() {
  const authStatus = useAdminAuth();

  const [videos, setVideos] = useState<ChannelVideoSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reloadUnregisteredVideos = useCallback(async (): Promise<void> => {
    if (authStatus.state !== "signed-in") {
      return;
    }
    setLoadingList(true);
    setListError(null);
    try {
      const existingVideos = await listVideos();
      const idToken = await authStatus.user.getIdToken();
      const unregistered = await fetchUnregisteredVideos(
        idToken,
        existingVideos.map((video) => video.id),
      );
      if (mountedRef.current) {
        setVideos(unregistered);
        setSelectedIds(new Set());
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`未登録動画一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [authStatus]);

  // マウント時(サインイン確定後)の初回読み込み。react-hooks/set-state-in-effect
  // (useEffect内で直接/間接にsetStateを呼ぶことを禁じるlintルール)を満たすため、
  // reloadUnregisteredVideos()(内部で同期的にsetLoadingList等を呼ぶ)を呼び出すのではなく、
  // Promiseチェーンを直接組み立ててsetStateはすべて.then()/.catch()の中でのみ行う
  // (他admin画面の初回読み込みeffectと同じ設計。/admin/performers等参照)。
  useEffect(() => {
    if (authStatus.state !== "signed-in") {
      return;
    }
    const { user } = authStatus;
    listVideos()
      .then((existingVideos) =>
        user
          .getIdToken()
          .then((idToken) =>
            fetchUnregisteredVideos(
              idToken,
              existingVideos.map((video) => video.id),
            ),
          ),
      )
      .then((unregistered) => {
        if (mountedRef.current) {
          setVideos(unregistered);
          setSelectedIds(new Set());
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`未登録動画一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, [authStatus]);

  function toggleSelected(videoId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  }

  async function handleRunImport(): Promise<void> {
    if (authStatus.state !== "signed-in" || videos === null) {
      return;
    }
    const targets = videos.filter((video) => selectedIds.has(video.videoId));
    if (targets.length === 0) {
      return;
    }

    setRunning(true);
    setResults([]);
    const nextResults: ImportResult[] = [];

    for (const video of targets) {
      try {
        const idToken = await authStatus.user.getIdToken();
        const plan = await fetchExtractionPlan(idToken, {
          videoId: video.videoId,
          title: video.title,
          publishedAt: video.publishedAt,
        });
        const saved = await saveDraftExtraction(plan);
        nextResults.push({ videoId: saved.videoId, title: video.title, status: "success" });
      } catch (error) {
        nextResults.push({
          videoId: video.videoId,
          title: video.title,
          status: "error",
          message: errorMessage(error),
        });
      }
      if (mountedRef.current) {
        setResults([...nextResults]);
      }
    }

    if (mountedRef.current) {
      setRunning(false);
    }
    await reloadUnregisteredVideos();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">AI自動抽出の取り込み</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          チャンネルの未登録動画から店名・住所・出演者ごとの飲食メニューをAIで抽出し、
          下書き(draft)として登録します。取り込み後はレビュー画面で内容を確認・修正して承認してください。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="import-reload"
          disabled={loadingList}
          onClick={() => {
            void reloadUnregisteredVideos();
          }}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {loadingList ? "取得中..." : "未登録動画を再取得"}
        </button>
        <button
          type="button"
          data-testid="import-run"
          disabled={running || selectedIds.size === 0}
          onClick={() => {
            void handleRunImport();
          }}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {running ? "取り込み中..." : `取り込み実行(${selectedIds.size}件選択中)`}
        </button>
      </div>

      {listError !== null && (
        <p data-testid="import-list-error" className="text-sm text-red-600 dark:text-red-400">
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
                <th className="py-2 pr-4 font-medium">選択</th>
                <th className="py-2 pr-4 font-medium">サムネイル</th>
                <th className="py-2 pr-4 font-medium">タイトル</th>
                <th className="py-2 pr-4 font-medium">公開日</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr
                  key={video.videoId}
                  data-testid="import-video-row"
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      data-testid="import-video-checkbox"
                      checked={selectedIds.has(video.videoId)}
                      onChange={() => toggleSelected(video.videoId)}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={buildYoutubeThumbnailUrl(video.videoId)}
                      alt={video.title}
                      className="h-12 w-20 rounded object-cover"
                    />
                  </td>
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{video.title}</td>
                  <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {video.publishedAt}
                  </td>
                </tr>
              ))}
              {videos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    未登録の動画はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">取り込み結果</h2>
          <ul className="flex flex-col gap-2">
            {results.map((result) => (
              <li
                key={result.videoId}
                data-testid="import-result-row"
                data-status={result.status}
                className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <p className="text-zinc-900 dark:text-zinc-50">{result.title}</p>
                {result.status === "success" ? (
                  <Link
                    href={`/admin/review/${result.videoId}`}
                    data-testid="import-result-link"
                    className="text-sm text-blue-600 underline dark:text-blue-400"
                  >
                    レビュー画面で確認する
                  </Link>
                ) : (
                  <p data-testid="import-result-error" className="text-red-600 dark:text-red-400">
                    取り込みに失敗しました: {result.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
