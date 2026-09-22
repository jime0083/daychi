/**
 * 動画の概要欄・字幕テキスト取得(タスク4-2: 概要欄・字幕テキスト取得)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」の
 * 「概要欄・字幕テキストを取得」に対応する。後段(4-3のAI抽出)の入力になる。
 *
 * サーバー専用モジュール(NEXT_PUBLIC_ は使わない。ブラウザから直接importしない)。
 *
 * - 概要欄(description): YouTube Data API v3 の videos.list(part=snippet)で取得する
 *   (環境変数 YOUTUBE_API_KEY を使用。src/lib/youtube-data-api.tsと同じDIパターン)。
 *   取得に失敗した場合(APIキー未設定・APIエラー・動画が見つからない等)はErrorをthrowする
 *   (概要欄は抽出処理の主要な入力であり、取得失敗を握りつぶすと空のまま抽出が進んでしまうため)。
 *
 * - 字幕(transcript): YouTube Data APIの captions.download は動画の所有者権限が
 *   必要で一般公開動画には使えないため、公開エンドポイントである timedtext を利用する
 *   (`https://www.youtube.com/api/timedtext?type=list&v={videoId}` で利用可能な
 *   字幕トラック一覧を取得し、日本語トラックを優先して本文を取得する)。
 *   このエンドポイントは非公式で動画によっては字幕が存在しない・取得できないことが
 *   十分にあり得るため、**取得層は差し替え可能なインターフェース(TranscriptFetcher)にし、
 *   失敗時は例外を投げず null を返す**設計にする。
 *
 * - フォールバック: fetchVideoTextContent は字幕取得が失敗(nullを返す・例外を投げる
 *   いずれの場合も)しても全体を止めず、description のみで続行する
 *   (transcript: null を返す)。概要欄の取得自体が失敗した場合はErrorをthrowする。
 */

type FetchLike = typeof fetch;

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const TIMEDTEXT_BASE_URL = "https://www.youtube.com/api/timedtext";

/** 字幕トラックが複数ある場合に優先する言語コード(日本語チャンネルのため日本語を優先する) */
const PREFERRED_TRANSCRIPT_LANG = "ja";

/** 動画ID1件分の概要欄・字幕テキスト(4-3のAI抽出への入力) */
export interface VideoTextContent {
  description: string;
  transcript: string | null;
}

/**
 * 字幕テキストを取得する関数の型(DI用)。
 * 取得できない場合(字幕なし・非公式エンドポイントの応答不正など)はnullを返す想定であり、
 * 例外を投げても fetchVideoTextContent 側でフォールバック(null化)される。
 */
export type TranscriptFetcher = (videoId: string, fetchImpl: FetchLike) => Promise<string | null>;

/**
 * env省略時は呼び出し時点のprocess.envを直接返す
 * (src/lib/youtube-data-api.tsのreadEnv()と同じ考え方)。
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

interface VideosListResponse {
  items?: Array<{
    snippet?: {
      description?: string;
    };
  }>;
}

/** fetchVideoDescription に渡せるオプション(すべて省略可能) */
export interface FetchVideoDescriptionOptions {
  /** 省略時は環境変数 YOUTUBE_API_KEY を使う(未設定ならError) */
  apiKey?: string;
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う */
  fetchImpl?: FetchLike;
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む */
  env?: NodeJS.ProcessEnv;
}

/**
 * videos.list(part=snippet)で動画の概要欄(description)を取得する。
 * 動画が見つからない場合・APIエラーの場合はErrorをthrowする。
 * description未設定(空欄の概要欄)の場合は空文字列を返す。
 */
export async function fetchVideoDescription(
  videoId: string,
  options: FetchVideoDescriptionOptions = {},
): Promise<string> {
  const env = readEnv(options.env);
  const apiKey = options.apiKey ?? resolveApiKey(env);
  const fetchImpl = options.fetchImpl ?? fetch;

  const params = new URLSearchParams({
    part: "snippet",
    id: videoId,
    key: apiKey,
  });
  const url = `${YOUTUBE_API_BASE_URL}/videos?${params.toString()}`;

  const data = await fetchYoutubeJson<VideosListResponse>(url, fetchImpl);
  const item = data.items?.[0];
  if (!item) {
    throw new Error(`動画(${videoId})が見つかりませんでした`);
  }
  return item.snippet?.description ?? "";
}

/** timedtext(type=list)応答から字幕トラック一覧を抽出した結果1件分 */
export interface CaptionTrackInfo {
  langCode: string;
  isDefault: boolean;
}

/**
 * timedtext(type=list)のXML応答から利用可能な字幕トラック一覧を抽出する純粋関数。
 * 例: <transcript_list><track lang_code="ja" lang_default="true"/><track lang_code="en"/></transcript_list>
 * 字幕が1つも無い動画(空のtranscript_list)の場合は空配列を返す。
 */
export function parseCaptionTrackList(xml: string): CaptionTrackInfo[] {
  const trackTagPattern = /<track\b([^>]*)\/?>/g;
  const tracks: CaptionTrackInfo[] = [];

  for (const match of xml.matchAll(trackTagPattern)) {
    const attributes = match[1] ?? "";
    const langCodeMatch = /lang_code="([^"]*)"/.exec(attributes);
    if (!langCodeMatch || langCodeMatch[1] === "") {
      continue;
    }
    const isDefault = /lang_default="true"/.test(attributes);
    tracks.push({ langCode: langCodeMatch[1], isDefault });
  }

  return tracks;
}

/**
 * 字幕トラック一覧から取得対象の言語コードを1つ選ぶ純粋関数。
 * 優先順位: 日本語(PREFERRED_TRANSCRIPT_LANG) > lang_default="true"のトラック > 先頭のトラック。
 * トラックが1つも無い場合は null を返す。
 */
export function selectPreferredCaptionLang(tracks: readonly CaptionTrackInfo[]): string | null {
  if (tracks.length === 0) {
    return null;
  }
  const preferred = tracks.find((track) => track.langCode === PREFERRED_TRANSCRIPT_LANG);
  if (preferred) {
    return preferred.langCode;
  }
  const defaultTrack = tracks.find((track) => track.isDefault);
  if (defaultTrack) {
    return defaultTrack.langCode;
  }
  return tracks[0].langCode;
}

/** XMLの数値・名前付き文字参照を含むテキストをデコードする */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * timedtextの本文XML応答から字幕テキストを結合した文字列を抽出する純粋関数。
 * 例: <transcript><text start="0" dur="1.5">こんにちは</text><text start="1.5" dur="2">Daychiです</text></transcript>
 * <text>要素が1つも無い場合(字幕本文が空)は null を返す。
 */
export function parseTimedTextTranscript(xml: string): string | null {
  const textTagPattern = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  const lines: string[] = [];

  for (const match of xml.matchAll(textTagPattern)) {
    const decoded = decodeXmlEntities(match[1] ?? "").trim();
    if (decoded !== "") {
      lines.push(decoded);
    }
  }

  return lines.length > 0 ? lines.join(" ") : null;
}

/**
 * timedtext公開エンドポイントから字幕テキストを取得する既定のTranscriptFetcher実装。
 * 字幕が存在しない・応答が不正・HTTPエラーなど、取得できない事情がある場合は
 * 例外を投げず null を返す(呼び出し元 fetchVideoTextContent 側の
 * フォールバックに一本化するため、ここでも極力nullで表現する)。
 */
export const fetchTranscriptFromTimedText: TranscriptFetcher = async (videoId, fetchImpl) => {
  const listUrl = `${TIMEDTEXT_BASE_URL}?type=list&v=${encodeURIComponent(videoId)}`;
  const listResponse = await fetchImpl(listUrl);
  if (!listResponse.ok) {
    return null;
  }
  const listXml = await listResponse.text();
  const langCode = selectPreferredCaptionLang(parseCaptionTrackList(listXml));
  if (!langCode) {
    return null;
  }

  const textUrl = `${TIMEDTEXT_BASE_URL}?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(langCode)}`;
  const textResponse = await fetchImpl(textUrl);
  if (!textResponse.ok) {
    return null;
  }
  const textXml = await textResponse.text();
  return parseTimedTextTranscript(textXml);
};

/** fetchVideoTextContent に渡せるオプション(すべて省略可能) */
export interface FetchVideoTextContentOptions {
  /** 省略時は環境変数 YOUTUBE_API_KEY を使う(未設定ならError) */
  apiKey?: string;
  /** テスト用のfetch差し替え。省略時はグローバルfetchを使う */
  fetchImpl?: FetchLike;
  /** テスト用の環境変数差し替え。省略時はprocess.envを読む */
  env?: NodeJS.ProcessEnv;
  /** 字幕取得層の差し替え(モック用)。省略時は fetchTranscriptFromTimedText を使う */
  fetchTranscript?: TranscriptFetcher;
}

/**
 * 動画IDから概要欄・字幕テキストを取得する(4-3のAI抽出の入力を組み立てる)。
 *
 * - 概要欄の取得に失敗した場合はErrorをthrowする(抽出処理の主要な入力のため)。
 * - 字幕の取得に失敗した場合(TranscriptFetcherがnullを返す・例外を投げるいずれも)は
 *   全体を止めず、description のみで続行する(transcript: null)。
 */
export async function fetchVideoTextContent(
  videoId: string,
  options: FetchVideoTextContentOptions = {},
): Promise<VideoTextContent> {
  const env = readEnv(options.env);
  const apiKey = options.apiKey ?? resolveApiKey(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchTranscript = options.fetchTranscript ?? fetchTranscriptFromTimedText;

  const description = await fetchVideoDescription(videoId, { apiKey, fetchImpl });

  let transcript: string | null;
  try {
    transcript = await fetchTranscript(videoId, fetchImpl);
  } catch {
    // 字幕取得の失敗(非公式エンドポイントの不整合・想定外の例外)は
    // フォールバックとしてnull化し、概要欄のみで後続処理を続行する。
    transcript = null;
  }

  return { description, transcript };
}
