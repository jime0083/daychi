/**
 * src/lib/youtube-data-api.ts のユニットテスト(タスク4-1: YouTube Data APIクライアント)。
 * 実際のYouTube Data APIは呼び出さず、fetchをモックして検証する
 * (実APIを使った疎通確認はタスク4-5で行う)。
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_YOUTUBE_CHANNEL_ID,
  detectUnregisteredVideos,
  fetchChannelVideos,
} from "@/lib/youtube-data-api";

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

/** テスト用の環境変数オブジェクトを組み立てる(src/lib/firebase-config.test.tsのmakeEnvと同じ考え方) */
function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

const CHANNELS_LIST_RESPONSE = {
  items: [
    {
      contentDetails: {
        relatedPlaylists: { uploads: "UUuploadsPlaylistId" },
      },
    },
  ],
};

describe("fetchChannelVideos", () => {
  it("複数ページ(nextPageTokenあり)を正しく結合して全動画を取得できる", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(CHANNELS_LIST_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              snippet: {
                title: "1本目の動画",
                publishedAt: "2026-01-01T00:00:00Z",
                resourceId: { videoId: "video000001" },
              },
            },
            {
              snippet: {
                title: "2本目の動画",
                publishedAt: "2026-01-02T00:00:00Z",
                resourceId: { videoId: "video000002" },
              },
            },
          ],
          nextPageToken: "page2token",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              snippet: {
                title: "3本目の動画",
                publishedAt: "2026-01-03T00:00:00Z",
                resourceId: { videoId: "video000003" },
              },
            },
          ],
        }),
      );

    const result = await fetchChannelVideos({
      apiKey: "test-api-key",
      fetchImpl,
    });

    expect(result).toEqual([
      { videoId: "video000001", title: "1本目の動画", publishedAt: "2026-01-01T00:00:00Z" },
      { videoId: "video000002", title: "2本目の動画", publishedAt: "2026-01-02T00:00:00Z" },
      { videoId: "video000003", title: "3本目の動画", publishedAt: "2026-01-03T00:00:00Z" },
    ]);
    // channels.list 1回 + playlistItems.list 2ページ = 計3回
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("videoId/title/publishedAtが正しくマッピングされ、必須項目欠落分は除外される", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(CHANNELS_LIST_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              snippet: {
                title: "正常な動画",
                publishedAt: "2026-02-01T00:00:00Z",
                resourceId: { videoId: "videoValid1" },
              },
            },
            {
              // videoId欠落(削除済み動画等)は除外される
              snippet: {
                title: "videoIdなし",
                publishedAt: "2026-02-02T00:00:00Z",
                resourceId: {},
              },
            },
          ],
        }),
      );

    const result = await fetchChannelVideos({ apiKey: "test-api-key", fetchImpl });

    expect(result).toEqual([
      { videoId: "videoValid1", title: "正常な動画", publishedAt: "2026-02-01T00:00:00Z" },
    ]);
  });

  it("channelIdを省略した場合、既定のチャンネルIDでchannels.listを呼び出す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(CHANNELS_LIST_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    await fetchChannelVideos({ apiKey: "test-api-key", fetchImpl });

    const channelsListUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(channelsListUrl).toContain(`id=${DEFAULT_YOUTUBE_CHANNEL_ID}`);
  });

  it("apiKeyを環境変数から解決できる", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(CHANNELS_LIST_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    await fetchChannelVideos({
      fetchImpl,
      env: makeEnv({ YOUTUBE_API_KEY: "env-api-key" }),
    });

    const channelsListUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(channelsListUrl).toContain("key=env-api-key");
  });

  it("APIキーが未設定の場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchChannelVideos({ fetchImpl, env: makeEnv() })).rejects.toThrow(
      "YOUTUBE_API_KEY",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("channels.listがエラーステータスを返した場合はErrorをthrowする", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "API key not valid" } }, { status: 400 }),
      );

    await expect(fetchChannelVideos({ apiKey: "bad-key", fetchImpl })).rejects.toThrow(
      "API key not valid",
    );
  });

  it("channels.listでアップロード済み動画プレイリストが見つからない場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ items: [] }));

    await expect(fetchChannelVideos({ apiKey: "test-api-key", fetchImpl })).rejects.toThrow(
      "アップロード済み動画プレイリスト",
    );
  });

  it("playlistItems.listがエラーステータスを返した場合はErrorをthrowする", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(CHANNELS_LIST_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }));

    await expect(fetchChannelVideos({ apiKey: "test-api-key", fetchImpl })).rejects.toThrow(
      "status: 500",
    );
  });

  it("fetch自体が失敗(ネットワークエラー)した場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));

    await expect(fetchChannelVideos({ apiKey: "test-api-key", fetchImpl })).rejects.toThrow(
      "YouTube Data APIへの接続に失敗しました",
    );
  });
});

describe("detectUnregisteredVideos", () => {
  const fetched = [
    { videoId: "v1", title: "動画1", publishedAt: "2026-01-01T00:00:00Z" },
    { videoId: "v2", title: "動画2", publishedAt: "2026-01-02T00:00:00Z" },
    { videoId: "v3", title: "動画3", publishedAt: "2026-01-03T00:00:00Z" },
  ];

  it("既存IDに含まれる動画を除外し、未登録の動画のみ返す", () => {
    expect(detectUnregisteredVideos(fetched, ["v1"])).toEqual([fetched[1], fetched[2]]);
  });

  it("既存IDが空の場合は全件を未登録として返す", () => {
    expect(detectUnregisteredVideos(fetched, [])).toEqual(fetched);
  });

  it("全件が既存IDに含まれる場合は空配列を返す", () => {
    expect(detectUnregisteredVideos(fetched, ["v1", "v2", "v3"])).toEqual([]);
  });

  it("fetchedが空配列の場合は空配列を返す", () => {
    expect(detectUnregisteredVideos([], ["v1"])).toEqual([]);
  });

  it("既存IDに重複が含まれていても正しく除外できる", () => {
    expect(detectUnregisteredVideos(fetched, ["v1", "v1", "v2"])).toEqual([fetched[2]]);
  });

  it("fetched側に同一videoIdの重複がある場合、最初の1件のみ残す", () => {
    const fetchedWithDuplicate = [
      { videoId: "v1", title: "動画1(旧)", publishedAt: "2026-01-01T00:00:00Z" },
      { videoId: "v1", title: "動画1(重複)", publishedAt: "2026-01-01T00:00:00Z" },
      { videoId: "v2", title: "動画2", publishedAt: "2026-01-02T00:00:00Z" },
    ];

    expect(detectUnregisteredVideos(fetchedWithDuplicate, [])).toEqual([
      fetchedWithDuplicate[0],
      fetchedWithDuplicate[2],
    ]);
  });
});
