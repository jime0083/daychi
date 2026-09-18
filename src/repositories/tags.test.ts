/**
 * tagsリポジトリ(src/repositories/tags.ts)のユニットテスト(Phase 5で使用予定)。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TagData } from "@/types/tag";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  signInAsEmulatorAdmin,
  uniqueTestId,
} from "./test-support";

enableFirestoreEmulatorEnv();

const emulatorAvailable = await isFirestoreEmulatorAvailable();

describe.skipIf(!emulatorAvailable)("tagsリポジトリ(Firestore Emulator必須)", () => {
  let repo: typeof import("@/repositories/tags");
  let createdId: string | undefined;

  beforeAll(async () => {
    const { auth } = await import("@/lib/firebase");
    await signInAsEmulatorAdmin(auth);
    repo = await import("@/repositories/tags");
  });

  afterAll(async () => {
    if (createdId) {
      await repo.deleteTag(createdId);
    }
  });

  it("create → getById → list → update → delete の一連操作ができる", async () => {
    const input: TagData = {
      name: `【テスト用】${uniqueTestId("tag-test")}`,
      order: 5,
    };

    const created = await repo.createTag(input);
    createdId = created.id;

    expect(created).toMatchObject(input);
    expect(created.id).toBeTruthy();

    const fetched = await repo.getTagById(created.id);
    expect(fetched).toEqual(created);

    const list = await repo.listTags();
    expect(list.some((tag) => tag.id === created.id)).toBe(true);

    await repo.updateTag(created.id, { order: 1 });
    const updated = await repo.getTagById(created.id);
    expect(updated?.order).toBe(1);
    expect(updated?.name).toBe(input.name);

    await repo.deleteTag(created.id);
    expect(await repo.getTagById(created.id)).toBeNull();
  });

  it("getTagByIdは存在しないIDに対してnullを返す", async () => {
    expect(await repo.getTagById(uniqueTestId("tag-not-found"))).toBeNull();
  });
});
