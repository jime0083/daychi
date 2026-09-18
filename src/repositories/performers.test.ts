/**
 * performersリポジトリ(src/repositories/performers.ts)のユニットテスト。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PerformerData } from "@/types/performer";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  signInAsEmulatorAdmin,
  uniqueTestId,
} from "./test-support";

enableFirestoreEmulatorEnv();

const emulatorAvailable = await isFirestoreEmulatorAvailable();

describe.skipIf(!emulatorAvailable)("performersリポジトリ(Firestore Emulator必須)", () => {
  let repo: typeof import("@/repositories/performers");
  let createdId: string | undefined;

  beforeAll(async () => {
    const { auth } = await import("@/lib/firebase");
    await signInAsEmulatorAdmin(auth);
    repo = await import("@/repositories/performers");
  });

  afterAll(async () => {
    // アサーション失敗時にドキュメントが残らないようにする安全網
    // (存在しないドキュメントへのdeleteはFirestore上エラーにならない)
    if (createdId) {
      await repo.deletePerformer(createdId);
    }
  });

  it("create → getById → list → update → delete の一連操作ができる", async () => {
    const input: PerformerData = {
      name: `【テスト用】${uniqueTestId("performer-test")}`,
      isMain: false,
      order: 99,
    };

    const created = await repo.createPerformer(input);
    createdId = created.id;
    expect(created).toMatchObject(input);
    expect(created.id).toBeTruthy();

    const fetched = await repo.getPerformerById(created.id);
    expect(fetched).toEqual(created);

    const list = await repo.listPerformers();
    expect(list.some((performer) => performer.id === created.id)).toBe(true);

    await repo.updatePerformer(created.id, { order: 1 });
    const updated = await repo.getPerformerById(created.id);
    expect(updated?.order).toBe(1);
    expect(updated?.name).toBe(input.name);
    expect(updated?.isMain).toBe(input.isMain);

    await repo.deletePerformer(created.id);
    expect(await repo.getPerformerById(created.id)).toBeNull();
  });

  it("getPerformerByIdは存在しないIDに対してnullを返す", async () => {
    expect(await repo.getPerformerById(uniqueTestId("performer-not-found"))).toBeNull();
  });
});
