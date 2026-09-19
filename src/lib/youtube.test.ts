/**
 * src/lib/youtube.ts のユニットテスト(タスク2-3: 動画登録CRUD)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { describe, expect, it } from "vitest";

import { buildYoutubeThumbnailUrl, extractYouTubeVideoId } from "@/lib/youtube";

describe("extractYouTubeVideoId", () => {
  it("watch?v= 形式から動画IDを抽出できる", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("watch?v= に他のクエリパラメータが付与されていても抽出できる", () => {
    expect(
      extractYouTubeVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxx&t=42s&feature=share",
      ),
    ).toBe("dQw4w9WgXcQ");
  });

  it("youtu.be 短縮URL形式から動画IDを抽出できる", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("youtu.be にクエリパラメータが付与されていても抽出できる", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  });

  it("shorts 形式から動画IDを抽出できる", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("embed 形式から動画IDを抽出できる", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("www. が無いドメインでも抽出できる", () => {
    expect(extractYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("m.youtube.com(モバイル版ドメイン)でも抽出できる", () => {
    expect(extractYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("youtube-nocookie.com(embed用ドメイン)でも抽出できる", () => {
    expect(extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("不正なURL文字列に対してnullを返す", () => {
    expect(extractYouTubeVideoId("not a url")).toBeNull();
  });

  it("YouTube以外のドメインに対してnullを返す", () => {
    expect(extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("vパラメータが無い watch URLに対してnullを返す", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch")).toBeNull();
  });

  it("動画IDの形式が不正(11文字でない)場合にnullを返す", () => {
    expect(extractYouTubeVideoId("https://youtu.be/short")).toBeNull();
  });

  it("対応していないパス形式に対してnullを返す", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx")).toBeNull();
  });
});

describe("buildYoutubeThumbnailUrl", () => {
  it("i.ytimg.com のhqdefault.jpg URLを組み立てる", () => {
    expect(buildYoutubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
