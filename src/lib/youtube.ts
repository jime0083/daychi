/**
 * YouTube URLから動画ID(11文字)を抽出する純粋関数(タスク2-3: 動画登録CRUD)。
 *
 * requirements.md「3.2 管理画面」の「YouTube URLを貼り付け→動画IDを抽出」に対応する。
 * videos/{videoId} のドキュメントIDにこの値をそのまま使うため、抽出結果は
 * YouTube動画IDの形式(英数字・ハイフン・アンダースコアの11文字)であることを検証する。
 *
 * 対応する主要フォーマット:
 * - https://www.youtube.com/watch?v=VIDEO_ID(共有時によく付与される他のクエリ含む)
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - youtube-nocookie.com(埋め込み用ドメイン)の同等パス
 * - m.youtube.com(モバイル版ドメイン)の同等パス
 */

/** YouTube動画IDの形式(英数字・ハイフン・アンダースコアの11文字) */
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function isValidVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

/** ホスト名から先頭の "www." または "m." を1つだけ取り除く */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^(www\.|m\.)/, "");
}

/**
 * YouTube URLから動画IDを抽出する。抽出できない場合(URLとして不正、
 * YouTube以外のドメイン、対応フォーマット外、動画ID形式不一致など)は null を返す。
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = normalizeHost(url.hostname.toLowerCase());

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return isValidVideoId(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return isValidVideoId(id) ? id : null;
    }

    const shortsMatch = /^\/shorts\/([^/?]+)/.exec(url.pathname);
    if (shortsMatch) {
      return isValidVideoId(shortsMatch[1]) ? shortsMatch[1] : null;
    }

    const embedMatch = /^\/embed\/([^/?]+)/.exec(url.pathname);
    if (embedMatch) {
      return isValidVideoId(embedMatch[1]) ? embedMatch[1] : null;
    }
  }

  return null;
}

/** YouTube動画IDからサムネイルURL(i.ytimg.com、APIキー不要)を組み立てる */
export function buildYoutubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * YouTube動画IDから視聴ページ(youtube.com/watch)のURLを組み立てる
 * (タスク3-2: 詳細シートのサムネイルクリック時に新規タブで開くリンク先)。
 */
export function buildYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
