/**
 * 動画1本分のAI抽出→ジオコーディング→draft保存計画の組み立てを行うRoute Handler
 * (タスク4-4: 管理画面 取り込み実行とレビューUI)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「概要欄・字幕テキストを取得 → AI(LLM)でJSON抽出 → ジオコーディングで
 * 緯度経度の候補を取得 → videos/shops/visitsにstatus:"draft"で保存」のうち、
 * 保存計画の組み立てまで(実際のFirestore書き込みは行わない)を担当する。
 *
 * 設計判断(Firestore書き込み経路): 本エンドポイントは秘密情報(YOUTUBE_API_KEY・
 * GEMINI_API_KEY)を要する処理のみをサーバー側で行い、DraftSavePlan(JSON化可能な
 * 計画オブジェクト。Timestampを含まない)を返すだけに留める。実際の
 * videos/shops/visits への書き込み(status: "draft")は、呼び出し元
 * (管理画面。admin ID Tokenでサインイン済みのFirestoreクライアントセッションを持つ)が
 * src/lib/ai-extraction/save-draft.ts の saveDraftExtraction(plan) を実行して行う。
 * こうすることでfirestore.rulesの書き込み条件(admin クレーム必須)を、
 * 本来のFirebase Authクライアントセッション経由でそのまま満たせる
 * (Admin SDK不要。src/lib/admin-token.tsの設計判断と同じ理由でfirebase-adminを
 * 避けている)。
 *
 * knownPerformers(performers全件)・existingPublishedShops(published店舗)は
 * firestore.rulesが「performersは誰でもread可」「shopsはpublishedなら誰でもread可」
 * としているため、このRoute Handler内で(管理者セッションなしの)Firestore
 * クライアントで直接読み取れる(src/repositories/performers.ts・shops.tsを再利用)。
 *
 * 認可: /api/admin/oembed・/api/admin/geocode と同じパターン
 * (src/lib/admin-token.ts。未認証401・非admin403)。
 *
 * タスク4-3e(P-017対応): Geminiの1日上限(RPD)に達した場合、gemini-adapter.tsは
 * 通常のエラー(502)と区別できる専用エラー GeminiDailyQuotaExceededError をthrowする。
 * 本ルートはこれを捕捉し、クライアント(取り込み画面)が種別を判別できるよう
 * HTTP 429 + { error: { code: "GEMINI_DAILY_QUOTA_EXCEEDED", message } } の形で返す
 * (それ以外のエラーは従来どおり502 + { error: string } のまま)。
 */
import { NextResponse } from "next/server";

import { extractBearerToken, verifyAdminIdToken } from "@/lib/admin-token";
import { buildDraftPlanFromVideo } from "@/lib/ai-extraction/pipeline";
import { getExtractionProvider } from "@/lib/ai-extraction/provider-factory";
import { GeminiDailyQuotaExceededError } from "@/lib/ai-extraction/errors";
import type { DraftSavePlan } from "@/lib/ai-extraction/draft-plan";
import { fetchVideoTextContent } from "@/lib/youtube-transcript";
import { listPerformers } from "@/repositories/performers";
import { listPublishedShops } from "@/repositories/shops";

/**
 * タスク4-3c(P-015対応): 動画入力方式への変更により、Gemini呼び出しは
 * 数十秒〜数分かかりうる(problem.txt P-015: 33分動画で約27秒、リトライが発生すれば
 * さらに数十秒加算される)。Next.jsのRoute Segment Config
 * (https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration)
 * でこのRoute Handlerの最大実行時間を明示的に延ばす(既定は5分。将来さらに長い動画・
 * リトライが重なるケースに備え余裕を持たせる)。
 *
 * 本番(Firebase App Hosting = Cloud Run)側の扱い: maxDurationはNext.js自身のタイムアウトの
 * 目安であり、Cloud Runのリクエストタイムアウト(apphosting.yamlのrunConfig、既定300秒)が
 * より短ければそちらが先に効く。apphosting.yamlの変更はタスク4-5(実API通し確認)で
 * 実動画の所要時間を見て必要なら行う(現時点ではコード変更に留める)。
 */
export const maxDuration = 300;

/**
 * error は通常は文字列だが、タスク4-3e(P-017対応)のGemini 1日上限エラーのみ
 * { code, message } のオブジェクトで返し、クライアントがエラー種別を判別できるようにする
 */
interface ExtractErrorResponse {
  error: string | { code: string; message: string };
}

interface RequestBody {
  videoId?: unknown;
  title?: unknown;
  publishedAt?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export async function POST(
  request: Request,
): Promise<NextResponse<DraftSavePlan | ExtractErrorResponse>> {
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

  if (
    !isNonEmptyString(body.videoId) ||
    !isNonEmptyString(body.title) ||
    !isNonEmptyString(body.publishedAt)
  ) {
    return NextResponse.json(
      { error: "videoId・title・publishedAtが必要です" },
      { status: 400 },
    );
  }

  try {
    const textContent = await fetchVideoTextContent(body.videoId);
    const [knownPerformers, existingPublishedShops] = await Promise.all([
      listPerformers(),
      listPublishedShops(),
    ]);
    const provider = getExtractionProvider();

    const plan = await buildDraftPlanFromVideo({
      provider,
      video: { videoId: body.videoId, title: body.title, publishedAt: body.publishedAt },
      textContent,
      knownPerformers,
      existingPublishedShops,
    });

    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof GeminiDailyQuotaExceededError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 429 },
      );
    }
    const message = error instanceof Error ? error.message : "AI抽出処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
