/**
 * YouTube Data API v3 クライアント(タスク4-1: YouTube Data APIクライアント)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「YouTube Data API でチャンネルの動画一覧を取得 → 未登録動画を検出」に対応する。
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない。ブラウザから直接importしない)。
 * - APIキー: 環境変数 YOUTUBE_API_KEY(.env.local に保存済み。manual-work.txt Work5)
 * - チャンネルID: 環境変数 YOUTUBE_CHANNEL_ID(未設定時は
 *   DEFAULT_YOUTUBE_CHANNEL_ID = Daychi〜COFFEE CHANNEL(@DaychiCOFFEECHANNEL)の
 *   チャンネルID UCYSc0Xm18s8fp45JjApiOjA を使う)
 *
 * 取得フロー(YouTube Data API v3の標準パターン):
 * 1. channels.list(part=contentDetails) でチャンネルの「アップロード済み動画」
 *    プレイリストID(relatedPlaylists.uploads)を取得する
 * 2. playlistItems.list(part=snippet) をnextPageTokenが無くなるまでページングし、
 *    全動画(videoId / title / publishedAt)を取得する
 *
 * HTTP取得層は fetch 関数を引数(DI)として差し替え可能にしており、
 * ユニットテストでは実際のYouTube APIを叩かずモックしたfetchで検証する
 * (実APIを使った疎通確認はタスク4-5で行う)。
 *
 * Firestore未登録動画の検出(detectUnregisteredVideos)は純粋関数として切り出す。
 * Firestoreからの既存videoId読み取り自体は呼び出し側(4-2以降)の責務とする。
 */

/** Daychi〜COFFEE CHANNEL(@DaychiCOFFEECHANNEL)のチャンネルID(manual-work.txt Work5で解決済み) */
export const DEFAULT_YOUTUBE_CHANNEL_ID = "UCYSc0Xm18s8fp45JjApiOjA";

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

/** 1ページあたりの取得件数(YouTube Data APIの上限である50を使う) */
const PLAYLIST_ITEMS_PAGE_SIZE = 50;

/** チャンネル動画一覧の1件分(YouTube APIのpublishedAtはISO 8601文字列のまま保持し、Timestamp変換は呼び出し側の責務とする) */
export interface ChannelVideoSummary {
  videoId: string;
  title: string;
  publishedAt: string;
}

type FetchLike = typeof fetch;

/**
 * env省略時は呼び出し時点のprocess.envを直接返す(src/lib/firebase-config.tsのreadEnv()と
 * 同じ考え方。このモジュールはサーバー専用でNEXT_PUBLIC_を扱わないため、
 * 静的置換の懸念は無いが、テストでenvを差し替え可能にするため関数化する)。
 */
function readEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

function resolveApiKey(env: NodeJS.ProcessEnv): string {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("環境変数 YOUTUBE_API_KEY が設定されていません");
  }
  return apiKey;
}

function resolveChannelId(env: NodeJS.ProcessEnv): string {
  const channelId = env.YOUTUBE_CHANNEL_ID;
  return channelId && channelId.trim() !== "" ? channelId : DEFAULT_YOUTUBE_CHANNEL_ID;
}

interface YoutubeApiErrorBody {
  error?: { message?: string };
}

/** YouTube Data APIを呼び出しJSONを返す。非2xxはエラーメッセージ付きでthrowする */
async function fetchYoutubeJson<T>(url: string, fetchImpl: FetchLike): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error("YouTube Data APIへの接続に失敗しました");
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as YoutubeApiErrorBody;
      detail = body.error?.message;
    } catch {
      // JSON以外のエラー応答はデフォルトメッセージのまま扱う
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`YouTube Data APIがエラーを返しました(status: ${response.status})${suffix}`);
  }

  return (await response.json()) as T;
}

interface ChannelsListResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

/** channels.list でチャンネルの「アップロード済み動画」プレイリストIDを取得する */
async function fetchUploadsPlaylistId(
  channelId: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const params = new URLSearchParams({
    part: "contentDetails",
    id: channelId,
    key: apiKey,
  });
  const url = `${YOUTUBE_API_BASE_URL}/channels?${params.toString()}`;

  const data = await fetchYoutubeJson<ChannelsListResponse>(url, fetchImpl);
  const uploadsPlaylistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error(
      `チャンネル(${channelId})のアップロード済み動画プレイリストが見つかりませんでした`,
    );
  }
  return uploadsPlaylistId;
}

interface PlaylistItemsListResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
    };
  }>;
  nextPageToken?: string;
}

function toChannelVideoSummary(
  item: NonNullable<PlaylistItemsListResponse["items"]>[number],
): ChannelVideoSummary | null {
  const videoId = item.snippet?.resourceId?.videoId;
  const title = item.snippet?.title;
  const publishedAt = item.snippet?.publishedAt;
  if (!videoId || title === undefined || publishedAt === undefined) {
    return null;
  }
  return { videoId, title, publishedAt };
}

/** playlistItems.list をnextPageTokenが無くなるまでページングし、全動画を結合して返す */
async function fetchAllPlaylistItems(
  playlistId: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<ChannelVideoSummary[]> {
  const pages: ChannelVideoSummary[][] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId,
      maxResults: String(PLAYLIST_ITEMS_PAGE_SIZE),
      key: apiKey,
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const url = `${YOUTUBE_API_BASE_URL}/playlistItems?${params.toString()}`;

    const data = await fetchYoutubeJson<PlaylistItemsListResponse>(url, fetchImpl);
    const pageVideos = (data.items ?? [])
      .map(toChannelVideoSummary)
      .filter((video): video is ChannelVideoSummary => video !== null);

    pages.push(pageVideos);
    pageToken = data.nextPageToken;
  } while (pageToken !== undefined);

  return pages.flat();
}

/** fetchChannelVideos に渡せるオプション(すべて省略可能。省略時は環境変数/実fetchを使う) */
export interface FetchChannelVideosOptions {
  /** 省略時は環境変数 YOUTUBE_CHANNEL_ID(未設定ならDEFAULT_YOUTUBE_CHANNEL_ID)を使う */
  channelId?: string;
  /** 省略時は環境変数 YOUTUBE_API_KEY を使う(未設定ならError) */
  apiKey?: string;
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う */
  fetchImpl?: FetchLike;
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む */
  env?: NodeJS.ProcessEnv;
}

/**
 * チャンネルの全動画一覧(videoId / title / publishedAt)を取得する。
 * channels.list でアップロード済み動画プレイリストIDを取得したのち、
 * playlistItems.list を全ページ取得して結合する。
 */
export async function fetchChannelVideos(
  options: FetchChannelVideosOptions = {},
): Promise<ChannelVideoSummary[]> {
  const env = readEnv(options.env);
  const apiKey = options.apiKey ?? resolveApiKey(env);
  const channelId = options.channelId ?? resolveChannelId(env);
  const fetchImpl = options.fetchImpl ?? fetch;

  const uploadsPlaylistId = await fetchUploadsPlaylistId(channelId, apiKey, fetchImpl);
  return fetchAllPlaylistItems(uploadsPlaylistId, apiKey, fetchImpl);
}

/**
 * 取得した動画一覧のうち、既存(Firestore登録済み)のvideoId集合に含まれないものを返す
 * 純粋関数。Firestore読み取り自体は呼び出し側の責務とし、このモジュールはロジックのみ持つ
 * (ユニットテスト容易性のため)。
 *
 * fetched・existingIds のいずれに重複videoIdが含まれていても正しく動作する
 * (fetched側は最初に出現したものを残し、以降の同一videoIdは除外する)。
 */
export function detectUnregisteredVideos(
  fetched: readonly ChannelVideoSummary[],
  existingIds: Iterable<string>,
): ChannelVideoSummary[] {
  const existingIdSet = new Set(existingIds);
  const seenVideoIds = new Set<string>();

  return fetched.filter((video) => {
    if (existingIdSet.has(video.videoId) || seenVideoIds.has(video.videoId)) {
      return false;
    }
    seenVideoIds.add(video.videoId);
    return true;
  });
}
