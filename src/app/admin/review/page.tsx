"use client";

/**
 * 下書き動画一覧(レビュー画面の入口。/admin/review、タスク4-4: 管理画面
 * 取り込み実行とレビューUI)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「レビュー・承認は動画単位でまとめて行う」に対応し、status: "draft" の動画を
 * 一覧表示して /admin/review/[videoId] へ遷移するための入口とする。
 *
 * 表示対象は「AI抽出由来の下書き」に限定せず status: "draft" の動画すべてとする
 * (手動登録直後の下書き動画も同じレビュー画面から内容確認・公開できるが、
 * 通常は店舗・訪問が0件のまま「承認して公開」を押すだけになる。データモデル上
 * AI抽出由来かどうかを区別するフラグを持たないため、両者を区別しない設計とする)。
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buildYoutubeThumbnailUrl } from "@/lib/youtube";
import { listVideos } from "@/repositories/videos";
import type { Video } from "@/types/video";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 一覧表示用に日付を YYYY/M/D 形式へ整形する(他admin画面と同じ形式) */
function formatDateForDisplay(video: Video): string {
  const date = video.publishedAt.toDate();
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export default function AdminReviewListPage() {
  const [draftVideos, setDraftVideos] = useState<Video[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    listVideos()
      .then((list) => {
        if (mountedRef.current) {
          const drafts = list
            .filter((video) => video.status === "draft")
            .sort((a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis());
          setDraftVideos(drafts);
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`下書き動画一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">下書きレビュー</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          下書き(draft)状態の動画を選んで、店舗・訪問の内容を確認・修正し、公開を承認します。
        </p>
      </div>

      {listError !== null && (
        <p data-testid="review-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}

      {draftVideos === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {draftVideos.map((video) => (
            <li
              key={video.id}
              data-testid="review-video-row"
              className="flex items-center gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildYoutubeThumbnailUrl(video.id)}
                alt={video.title}
                className="h-12 w-20 rounded object-cover"
              />
              <div className="flex-1">
                <p className="text-zinc-900 dark:text-zinc-50">{video.title}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  公開日: {formatDateForDisplay(video)}
                </p>
              </div>
              <Link
                href={`/admin/review/${video.id}`}
                data-testid="review-video-link"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                レビューする
              </Link>
            </li>
          ))}
          {draftVideos.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">下書き動画はありません</p>
          )}
        </ul>
      )}
    </div>
  );
}
