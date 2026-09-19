/**
 * YouTube oEmbed APIの取得を代行するRoute Handler(タスク2-3: 動画登録CRUD)。
 *
 * requirements.md「3.2 管理画面」の「YouTube URLを貼り付け→動画IDを抽出→
 * oEmbed APIでタイトル自動取得」に対応する。
 *
 * 設計判断: oEmbed取得はブラウザから直接 https://www.youtube.com/oembed を
 * fetchするのではなく、このサーバー側Route Handler経由で行う。
 * - ブラウザからの直接fetchはyoutube.com側のCORS応答仕様に挙動が左右されるため、
 *   サーバー側で完結させることで確実性を担保する
 * - 動画IDを抽出したうえで正規化したURL(https://www.youtube.com/watch?v={videoId})
 *   のみをoEmbedに渡すため、任意の外部URLをそのまま外部APIに転送しない
 * - E2Eテストではこのアプリ自身のエンドポイント(/api/admin/oembed)を
 *   Playwrightのpage.routeでインターセプトしてモックする(youtube.com側への
 *   実ネットワークアクセスに依存しない決定的なテストにするため)
 *
 * 認可について(タスク2-7対応): 2-3レビュー所見の通り、本エンドポイントは
 * 未認証でも到達可能な踏み台濫用防止のため、呼び出し元(管理画面)に
 * Firebase ID Tokenを `Authorization: Bearer <idToken>` ヘッダーで送らせ、
 * サーバー側で src/lib/admin-token.ts (Identity Toolkit REST APIの
 * accounts:lookupでcustomAttributes.adminを確認)を使って検証する。
 * firebase-adminは導入しない(ADC解決がサンドボックスでハングする既知問題
 * (problem.txt P-003関連)を避けるため)。この方式はFirebase Auth Emulatorでも
 * 同じREST APIパスがエミュレートされるため、emulator環境で完結して検証できる
 * (E2E: e2e/oembed-auth.spec.ts参照)。
 * トークンが無い場合は401、トークンはあるが管理者クレームが無い/無効な場合は403を返す。
 */
import { NextResponse } from "next/server";

import { extractBearerToken, verifyAdminIdToken } from "@/lib/admin-token";
import { extractYouTubeVideoId } from "@/lib/youtube";

interface OEmbedSuccessResponse {
  videoId: string;
  title: string;
}

interface OEmbedErrorResponse {
  error: string;
}

interface YoutubeOEmbedResponse {
  title?: string;
}

export async function GET(
  request: Request,
): Promise<NextResponse<OEmbedSuccessResponse | OEmbedErrorResponse>> {
  const idToken = extractBearerToken(request.headers.get("authorization"));
  if (idToken === null) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const isAdmin = await verifyAdminIdToken(idToken);
  if (!isAdmin) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (rawUrl === null || rawUrl.trim() === "") {
    return NextResponse.json({ error: "urlクエリパラメータが必要です" }, { status: 400 });
  }

  const videoId = extractYouTubeVideoId(rawUrl);
  if (videoId === null) {
    return NextResponse.json({ error: "有効なYouTube URLではありません" }, { status: 400 });
  }

  const canonicalWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalWatchUrl)}&format=json`;

  let oembedResponse: Response;
  try {
    oembedResponse = await fetch(oembedUrl);
  } catch {
    return NextResponse.json({ error: "oEmbed APIへの接続に失敗しました" }, { status: 502 });
  }

  if (!oembedResponse.ok) {
    return NextResponse.json(
      { error: `oEmbed APIがエラーを返しました(status: ${oembedResponse.status})` },
      { status: 502 },
    );
  }

  const data = (await oembedResponse.json()) as YoutubeOEmbedResponse;
  if (typeof data.title !== "string" || data.title === "") {
    return NextResponse.json(
      { error: "oEmbedレスポンスにtitleが含まれていません" },
      { status: 502 },
    );
  }

  return NextResponse.json({ videoId, title: data.title });
}
