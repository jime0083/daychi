/**
 * src/lib/youtube-transcript.ts のユニットテスト(タスク4-2: 概要欄・字幕テキスト取得)。
 * 実際のYouTube Data API・timedtextエンドポイントは呼び出さず、fetchをモックして検証する
 * (実APIを使った疎通確認はタスク4-5で行う)。
 */
import { describe, expect, it, vi } from "vitest";

import {
  fetchTranscriptFromTimedText,
  fetchVideoDescription,
  fetchVideoTextContent,
  parseCaptionTrackList,
  parseTimedTextTranscript,
  selectPreferredCaptionLang,
} from "@/lib/youtube-transcript";

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function xmlResponse(body: string, init?: { status?: number }): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { "content-type": "text/xml" },
  });
}

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("fetchVideoDescription", () => {
  it("videos.listのsnippet.descriptionを取得できる", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ snippet: { description: "概要欄のテキストです" } }] }),
      );

    const result = await fetchVideoDescription("videoValid1", {
      apiKey: "test-api-key",
      fetchImpl,
    });

    expect(result).toBe("概要欄のテキストです");
    const calledUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("id=videoValid1");
    expect(calledUrl).toContain("key=test-api-key");
  });

  it("descriptionが未設定の場合は空文字列を返す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: {} }] }));

    const result = await fetchVideoDescription("videoNoDesc", {
      apiKey: "test-api-key",
      fetchImpl,
    });

    expect(result).toBe("");
  });

  it("apiKeyを環境変数から解決できる", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: { description: "説明" } }] }));

    await fetchVideoDescription("videoValid1", {
      fetchImpl,
      env: makeEnv({ YOUTUBE_API_KEY: "env-api-key" }),
    });

    const calledUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("key=env-api-key");
  });

  it("APIキーが未設定の場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchVideoDescription("videoValid1", { fetchImpl, env: makeEnv() }),
    ).rejects.toThrow("YOUTUBE_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("動画が見つからない場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ items: [] }));

    await expect(
      fetchVideoDescription("videoNotFound", { apiKey: "test-api-key", fetchImpl }),
    ).rejects.toThrow("videoNotFound");
  });

  it("videos.listがエラーステータスを返した場合はErrorをthrowする", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "API key not valid" } }, { status: 400 }),
      );

    await expect(
      fetchVideoDescription("videoValid1", { apiKey: "bad-key", fetchImpl }),
    ).rejects.toThrow("API key not valid");
  });

  it("fetch自体が失敗(ネットワークエラー)した場合はErrorをthrowする", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));

    await expect(
      fetchVideoDescription("videoValid1", { apiKey: "test-api-key", fetchImpl }),
    ).rejects.toThrow("YouTube Data APIへの接続に失敗しました");
  });
});

describe("parseCaptionTrackList", () => {
  it("複数トラック(lang_code, lang_default)を正しく抽出する", () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8" ?><transcript_list docid="1">' +
      '<track id="0" name="" lang_code="ja" lang_default="true"/>' +
      '<track id="1" name="English" lang_code="en"/>' +
      "</transcript_list>";

    expect(parseCaptionTrackList(xml)).toEqual([
      { langCode: "ja", isDefault: true },
      { langCode: "en", isDefault: false },
    ]);
  });

  it("字幕トラックが1つも無い場合は空配列を返す", () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?><transcript_list docid="1"/>';
    expect(parseCaptionTrackList(xml)).toEqual([]);
  });

  it("lang_codeが空のトラックは除外する", () => {
    const xml =
      '<transcript_list><track id="0" lang_code=""/><track id="1" lang_code="en"/></transcript_list>';
    expect(parseCaptionTrackList(xml)).toEqual([{ langCode: "en", isDefault: false }]);
  });
});

describe("selectPreferredCaptionLang", () => {
  it("日本語トラックがあれば優先して選ぶ", () => {
    const tracks = [
      { langCode: "en", isDefault: true },
      { langCode: "ja", isDefault: false },
    ];
    expect(selectPreferredCaptionLang(tracks)).toBe("ja");
  });

  it("日本語が無い場合はlang_default=trueのトラックを選ぶ", () => {
    const tracks = [
      { langCode: "en", isDefault: false },
      { langCode: "fr", isDefault: true },
    ];
    expect(selectPreferredCaptionLang(tracks)).toBe("fr");
  });

  it("日本語もdefaultも無い場合は先頭のトラックを選ぶ", () => {
    const tracks = [
      { langCode: "en", isDefault: false },
      { langCode: "fr", isDefault: false },
    ];
    expect(selectPreferredCaptionLang(tracks)).toBe("en");
  });

  it("トラックが1つも無い場合はnullを返す", () => {
    expect(selectPreferredCaptionLang([])).toBeNull();
  });
});

describe("parseTimedTextTranscript", () => {
  it("複数のtext要素を結合し、XMLエンティティをデコードして返す", () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8" ?><transcript>' +
      '<text start="0" dur="1.5">こんにちは &amp; ようこそ</text>' +
      '<text start="1.5" dur="2">Daychiです</text>' +
      "</transcript>";

    expect(parseTimedTextTranscript(xml)).toBe("こんにちは & ようこそ Daychiです");
  });

  it("text要素が1つも無い場合はnullを返す", () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?><transcript></transcript>';
    expect(parseTimedTextTranscript(xml)).toBeNull();
  });

  it("空白のみのtext要素は無視される", () => {
    const xml = "<transcript><text> </text><text>本文</text></transcript>";
    expect(parseTimedTextTranscript(xml)).toBe("本文");
  });
});

describe("fetchTranscriptFromTimedText", () => {
  it("字幕一覧→日本語トラック本文の順で取得し結合したテキストを返す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        xmlResponse('<transcript_list><track lang_code="ja" lang_default="true"/></transcript_list>'),
      )
      .mockResolvedValueOnce(xmlResponse('<transcript><text start="0">字幕本文</text></transcript>'));

    const result = await fetchTranscriptFromTimedText("videoValid1", fetchImpl);

    expect(result).toBe("字幕本文");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const listUrl = fetchImpl.mock.calls[0]?.[0] as string;
    const textUrl = fetchImpl.mock.calls[1]?.[0] as string;
    expect(listUrl).toContain("type=list");
    expect(textUrl).toContain("lang=ja");
  });

  it("字幕トラック一覧が空(字幕なし動画)の場合はnullを返す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(xmlResponse("<transcript_list></transcript_list>"));

    const result = await fetchTranscriptFromTimedText("videoNoCaptions", fetchImpl);

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("一覧取得がエラーステータスの場合はnullを返す(例外を投げない)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(xmlResponse("", { status: 404 }));

    const result = await fetchTranscriptFromTimedText("videoValid1", fetchImpl);

    expect(result).toBeNull();
  });

  it("本文取得がエラーステータスの場合はnullを返す(例外を投げない)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(xmlResponse('<transcript_list><track lang_code="ja"/></transcript_list>'))
      .mockResolvedValueOnce(xmlResponse("", { status: 500 }));

    const result = await fetchTranscriptFromTimedText("videoValid1", fetchImpl);

    expect(result).toBeNull();
  });
});

describe("fetchVideoTextContent", () => {
  it("概要欄と字幕の両方が取得できる場合、両方を返す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: { description: "概要欄です" } }] }));
    const fetchTranscript = vi.fn().mockResolvedValueOnce("字幕テキストです");

    const result = await fetchVideoTextContent("videoValid1", {
      apiKey: "test-api-key",
      fetchImpl,
      fetchTranscript,
    });

    expect(result).toEqual({ description: "概要欄です", transcript: "字幕テキストです" });
    expect(fetchTranscript).toHaveBeenCalledWith("videoValid1", fetchImpl);
  });

  it("フォールバック: 字幕取得がnullを返す場合、概要欄のみで続行しtranscript=nullを返す", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: { description: "概要欄です" } }] }));
    const fetchTranscript = vi.fn().mockResolvedValueOnce(null);

    const result = await fetchVideoTextContent("videoNoCaptions", {
      apiKey: "test-api-key",
      fetchImpl,
      fetchTranscript,
    });

    expect(result).toEqual({ description: "概要欄です", transcript: null });
  });

  it("フォールバック: 字幕取得が例外を投げても全体が落ちず、概要欄のみで続行する", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: { description: "概要欄です" } }] }));
    const fetchTranscript = vi.fn().mockRejectedValueOnce(new Error("timedtext unexpected error"));

    const result = await fetchVideoTextContent("videoBrokenCaptions", {
      apiKey: "test-api-key",
      fetchImpl,
      fetchTranscript,
    });

    expect(result).toEqual({ description: "概要欄です", transcript: null });
  });

  it("概要欄の取得自体が失敗した場合はErrorをthrowする(字幕取得は呼ばれない)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ items: [] }));
    const fetchTranscript = vi.fn();

    await expect(
      fetchVideoTextContent("videoNotFound", {
        apiKey: "test-api-key",
        fetchImpl,
        fetchTranscript,
      }),
    ).rejects.toThrow("videoNotFound");
    expect(fetchTranscript).not.toHaveBeenCalled();
  });

  it("fetchTranscriptを省略した場合、既定でfetchTranscriptFromTimedTextが使われる", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ snippet: { description: "概要欄です" } }] }))
      .mockResolvedValueOnce(xmlResponse("<transcript_list></transcript_list>"));

    const result = await fetchVideoTextContent("videoValid1", {
      apiKey: "test-api-key",
      fetchImpl,
    });

    expect(result).toEqual({ description: "概要欄です", transcript: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
