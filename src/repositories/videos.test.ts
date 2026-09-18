/**
 * videosリポジトリ(src/repositories/videos.ts)のユニットテスト。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 */
import { Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateVideoInput } from "@/repositories/videos";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  uniqueTestId,
} from "./test-support";

enableFirestoreEmulatorEnv();

const emulatorAvailable = await isFirestoreEmulatorAvailable();

describe.skipIf(!emulatorAvailable)("videosリポジトリ(Firestore Emulator必須)", () => {
  let repo: typeof import("@/repositories/videos");
  const publishedVideoId = uniqueTestId("video-test-published");
  const draftVideoId = uniqueTestId("video-test-draft");

  beforeAll(async () => {
    repo = await import("@/repositories/videos");
  });

  afterAll(async () => {
    // アサーション失敗時にドキュメントが残らないようにする安全網
    await Promise.all([repo.deleteVideo(publishedVideoId), repo.deleteVideo(draftVideoId)]);
  });

  it("create → getById → list → update → delete の一連操作ができる(ドキュメントID = 動画ID)", async () => {
    const input: CreateVideoInput = {
      title: `【テスト用】動画 ${publishedVideoId}`,
      publishedAt: Timestamp.fromDate(new Date("2026-03-01T00:00:00+09:00")),
      status: "published",
    };

    const created = await repo.createVideo(publishedVideoId, input);
    expect(created.id).toBe(publishedVideoId);
    expect(created.title).toBe(input.title);
    expect(created.status).toBe("published");

    const fetched = await repo.getVideoById(publishedVideoId);
    expect(fetched).toEqual(created);

    const list = await repo.listVideos();
    expect(list.some((video) => video.id === publishedVideoId)).toBe(true);

    await repo.updateVideo(publishedVideoId, { title: "【テスト用】動画(更新後)" });
    const updated = await repo.getVideoById(publishedVideoId);
    expect(updated?.title).toBe("【テスト用】動画(更新後)");
    expect(updated?.updatedAt.toMillis()).toBeGreaterThanOrEqual(created.updatedAt.toMillis());

    await repo.deleteVideo(publishedVideoId);
    expect(await repo.getVideoById(publishedVideoId)).toBeNull();
  });

  it("listPublishedVideosはstatus:publishedのみを返す(draftは含まれない)", async () => {
    await repo.createVideo(publishedVideoId, {
      title: "【テスト用】公開動画",
      publishedAt: Timestamp.now(),
      status: "published",
    });
    await repo.createVideo(draftVideoId, {
      title: "【テスト用】下書き動画",
      publishedAt: Timestamp.now(),
      status: "draft",
    });

    const published = await repo.listPublishedVideos();
    const ids = published.map((video) => video.id);
    expect(ids).toContain(publishedVideoId);
    expect(ids).not.toContain(draftVideoId);
  });

  it("getVideoByIdは存在しないIDに対してnullを返す", async () => {
    expect(await repo.getVideoById(uniqueTestId("video-not-found"))).toBeNull();
  });
});
