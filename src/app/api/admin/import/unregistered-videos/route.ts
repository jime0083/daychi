/**
 * チャンネルの未登録動画一覧を返すRoute Handler(タスク4-4: 管理画面
 * 取り込み実行とレビューUI)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「取り込み画面ではYouTubeチャンネルの未登録動画の一覧を表示し、管理者が取り込む
 * 動画を選んで実行する(2026-09-23決定)」に対応する。
 *
 * 設計判断(既存videoIdの受け渡し方): videos コレクションはfirestore.rulesにより
 * draft状態のドキュメントの read が管理者クレーム保持者に限定される
 * (src/repositories/videos.tsのlistVideos()は「全件」を返すが、この
 * Route Handlerはサーバー側で管理者ID Tokenに紐づくFirestoreセッションを
 * 持たない=クライアントSDKの認証状態を持ち込めないため、ここでFirestoreを
 * 読み取るとdraft動画を取りこぼし、既に取り込み済みの動画が誤って
 * 「未登録」として再表示されてしまう)。そのため、呼び出し元(管理画面。
 * 既にadminとしてサインイン済みのFirestoreセッションでlistVideos()を実行できる)が
 * 取得した既存videoId一覧をリクエストボディで受け取り、
 * src/lib/youtube-data-api.ts の detectUnregisteredVideos(純粋関数)で
 * 未登録動画を絞り込む。YouTube Data API自体の呼び出し(YOUTUBE_API_KEY)は
 * サーバー側でのみ行う。
 *
 * 認可: /api/admin/oembed・/api/admin/geocode と同じパターン
 * (src/lib/admin-token.ts。未認証401・非admin403)。
 */
import { NextResponse } from "next/server";

import { extractBearerToken, verifyAdminIdToken } from "@/lib/admin-token";
import {
  detectUnregisteredVideos,
  fetchChannelVideos,
  type ChannelVideoSummary,
} from "@/lib/youtube-data-api";

interface UnregisteredVideosSuccessResponse {
  videos: ChannelVideoSummary[];
}

interface UnregisteredVideosErrorResponse {
  error: string;
}

interface RequestBody {
  existingVideoIds?: unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(
  request: Request,
): Promise<NextResponse<UnregisteredVideosSuccessResponse | UnregisteredVideosErrorResponse>> {
  const idToken = extractBearerToken(request.headers.get("authorization"));
  if (idToken === null) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const isAdmin = await verifyAdminIdToken(idToken);
  if (!isAdmin) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です" }, { status: 400 });
  }

  if (!isStringArray(body.existingVideoIds)) {
    return NextResponse.json(
      { error: "existingVideoIds(文字列の配列)が必要です" },
      { status: 400 },
    );
  }

  let fetched: ChannelVideoSummary[];
  try {
    fetched = await fetchChannelVideos();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "YouTube Data APIの呼び出しに失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const videos = detectUnregisteredVideos(fetched, body.existingVideoIds);
  return NextResponse.json({ videos });
}
