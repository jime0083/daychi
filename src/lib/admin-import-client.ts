/**
 * /api/admin/import/* 呼び出しのクライアント側ヘルパー(タスク4-4: 管理画面
 * 取り込み実行とレビューUI)。
 *
 * src/lib/admin-geocode-client.ts と同じパターンで、呼び出し元(/admin/import)が
 * useAdminAuth() で取得したFirebase Userの getIdToken() を
 * Authorization: Bearer ヘッダーに載せて渡す想定とする(このモジュール自体は
 * トークンの取得方法を知らず、引数で受け取るだけ)。
 *
 * 型のみ(`import type`)でサーバー専用モジュール(src/lib/youtube-data-api.ts・
 * src/lib/ai-extraction/draft-plan.ts)を参照する。`import type` はコンパイル時に
 * 完全に消去されるため、これらのモジュール本体(YOUTUBE_API_KEY・GEMINI_API_KEYに
 * 依存するコード)がブラウザ向けバンドルに含まれることはない。
 */
import type { DraftSavePlan } from "@/lib/ai-extraction/draft-plan";
import type { ChannelVideoSummary } from "@/lib/youtube-data-api";

interface UnregisteredVideosApiResponse {
  videos?: ChannelVideoSummary[];
  error?: string;
}

/**
 * チャンネルの未登録動画一覧を取得する(/api/admin/import/unregistered-videos)。
 * existingVideoIds には、呼び出し元が管理者セッションで取得済みのvideos全件
 * (draft/published問わず)のIDを渡す(サーバー側では管理者クレームを持つ
 * Firestoreセッションを持たないため。route.tsのコメント参照)。
 */
export async function fetchUnregisteredVideos(
  idToken: string,
  existingVideoIds: readonly string[],
): Promise<ChannelVideoSummary[]> {
  const response = await fetch("/api/admin/import/unregistered-videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ existingVideoIds }),
  });
  const body = (await response.json()) as UnregisteredVideosApiResponse;

  if (!response.ok || body.videos === undefined) {
    throw new Error(body.error ?? `未登録動画一覧の取得に失敗しました(status: ${response.status})`);
  }
  return body.videos;
}

/** fetchExtractionPlan への入力(取り込み対象の動画1本分) */
export interface ExtractVideoInput {
  videoId: string;
  title: string;
  publishedAt: string;
}

interface ExtractApiResponse extends Partial<DraftSavePlan> {
  error?: string;
}

/**
 * 動画1本分のAI抽出結果(下書き保存計画)を取得する(/api/admin/import/extract)。
 * 戻り値(DraftSavePlan)は src/lib/ai-extraction/save-draft.ts の
 * saveDraftExtraction() にそのまま渡してFirestoreへ保存する想定
 * (このモジュール自体はFirestoreへの書き込みを行わない)。
 */
export async function fetchExtractionPlan(
  idToken: string,
  video: ExtractVideoInput,
): Promise<DraftSavePlan> {
  const response = await fetch("/api/admin/import/extract", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(video),
  });
  const body = (await response.json()) as ExtractApiResponse;

  if (
    !response.ok ||
    body.status === undefined ||
    body.video === undefined ||
    body.shops === undefined ||
    body.visits === undefined
  ) {
    throw new Error(body.error ?? `AI抽出に失敗しました(status: ${response.status})`);
  }

  return { status: body.status, video: body.video, shops: body.shops, visits: body.visits };
}
