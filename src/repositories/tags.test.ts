/**
 * tagsリポジトリ(src/repositories/tags.ts)のユニットテスト(Phase 5で使用予定)。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 */
import { Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateShopInput } from "@/repositories/shops";
import type { TagData } from "@/types/tag";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  signInAsEmulatorAdmin,
  uniqueTestId,
} from "./test-support";

function buildShopInput(overrides: Partial<CreateShopInput> = {}): CreateShopInput {
  return {
    name: `【テスト用】喫茶 ${uniqueTestId("tag-cascade-shop")}`,
    address: "東京都千代田区テスト町1-2-3",
    businessHours: "8:00〜20:00(テストデータ)",
    infoAsOf: Timestamp.now(),
    location: { lat: 35.6938, lng: 139.7536 },
    closed: false,
    tagIds: [],
    status: "published",
    ...overrides,
  };
}

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

  describe("countShopsWithTag / deleteTagAndUnassignFromShops(タスク5-1: タグ削除時のカスケード解除)", () => {
    let shopsRepo: typeof import("@/repositories/shops");

    beforeAll(async () => {
      shopsRepo = await import("@/repositories/shops");
    });

    it("countShopsWithTagは未使用タグに対して0を返す", async () => {
      const tag = await repo.createTag({ name: `【テスト用】${uniqueTestId("tag-unused")}`, order: 1 });
      try {
        expect(await repo.countShopsWithTag(tag.id)).toBe(0);
      } finally {
        await repo.deleteTag(tag.id);
      }
    });

    it(
      "countShopsWithTagはstatus問わずtagIdsにそのタグを含む店舗数を返す。" +
        "deleteTagAndUnassignFromShopsは全店舗のtagIdsから外したうえでタグを削除する",
      async () => {
        const tag = await repo.createTag({
          name: `【テスト用】${uniqueTestId("tag-used")}`,
          order: 1,
        });
        const otherTag = await repo.createTag({
          name: `【テスト用】${uniqueTestId("tag-other")}`,
          order: 2,
        });

        const publishedShop = await shopsRepo.createShop(
          buildShopInput({ status: "published", tagIds: [tag.id, otherTag.id] }),
        );
        const draftShop = await shopsRepo.createShop(
          buildShopInput({ status: "draft", tagIds: [tag.id] }),
        );
        const untaggedShop = await shopsRepo.createShop(buildShopInput({ tagIds: [] }));

        try {
          // status問わず(published/draft両方)カウントされる
          expect(await repo.countShopsWithTag(tag.id)).toBe(2);

          await repo.deleteTagAndUnassignFromShops(tag.id);

          expect(await repo.getTagById(tag.id)).toBeNull();

          const updatedPublished = await shopsRepo.getShopById(publishedShop.id);
          expect(updatedPublished?.tagIds).not.toContain(tag.id);
          // 削除対象でない他のタグは残る
          expect(updatedPublished?.tagIds).toContain(otherTag.id);

          const updatedDraft = await shopsRepo.getShopById(draftShop.id);
          expect(updatedDraft?.tagIds).not.toContain(tag.id);

          const updatedUntagged = await shopsRepo.getShopById(untaggedShop.id);
          expect(updatedUntagged?.tagIds).toEqual([]);
        } finally {
          await Promise.all([
            shopsRepo.deleteShop(publishedShop.id),
            shopsRepo.deleteShop(draftShop.id),
            shopsRepo.deleteShop(untaggedShop.id),
            repo.deleteTag(otherTag.id),
          ]);
        }
      },
    );
  });
});
