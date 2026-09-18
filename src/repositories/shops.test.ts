/**
 * shopsリポジトリ(src/repositories/shops.ts)のユニットテスト。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 */
import { Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateShopInput } from "@/repositories/shops";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  signInAsEmulatorAdmin,
  uniqueTestId,
} from "./test-support";

enableFirestoreEmulatorEnv();

const emulatorAvailable = await isFirestoreEmulatorAvailable();

function buildShopInput(
  infoAsOf: Timestamp,
  overrides: Partial<CreateShopInput> = {},
): CreateShopInput {
  return {
    name: `【テスト用】喫茶 ${uniqueTestId("shop-test")}`,
    address: "東京都千代田区テスト町1-2-3",
    businessHours: "8:00〜20:00(テストデータ)",
    infoAsOf,
    location: { lat: 35.6938, lng: 139.7536 },
    closed: false,
    tagIds: [],
    status: "published",
    ...overrides,
  };
}

describe.skipIf(!emulatorAvailable)("shopsリポジトリ(Firestore Emulator必須)", () => {
  let repo: typeof import("@/repositories/shops");
  let createdId: string | undefined;
  let publishedId: string | undefined;
  let draftId: string | undefined;

  beforeAll(async () => {
    const { auth } = await import("@/lib/firebase");
    await signInAsEmulatorAdmin(auth);
    repo = await import("@/repositories/shops");
  });

  afterAll(async () => {
    // アサーション失敗時にドキュメントが残らないようにする安全網
    await Promise.all(
      [createdId, publishedId, draftId]
        .filter((id): id is string => Boolean(id))
        .map((id) => repo.deleteShop(id)),
    );
  });

  it("create → getById → list → update → delete の一連操作ができる", async () => {
    const input = buildShopInput(Timestamp.fromDate(new Date("2026-01-15T00:00:00+09:00")));

    const created = await repo.createShop(input);
    createdId = created.id;

    expect(created).toMatchObject({
      name: input.name,
      address: input.address,
      businessHours: input.businessHours,
      location: input.location,
      closed: input.closed,
      tagIds: input.tagIds,
      status: input.status,
    });
    expect(created.id).toBeTruthy();

    const fetched = await repo.getShopById(created.id);
    expect(fetched).toEqual(created);

    const list = await repo.listShops();
    expect(list.some((shop) => shop.id === created.id)).toBe(true);

    await repo.updateShop(created.id, { businessHours: "9:00〜17:00(更新後)" });
    const updated = await repo.getShopById(created.id);
    expect(updated?.businessHours).toBe("9:00〜17:00(更新後)");
    expect(updated?.name).toBe(input.name);

    await repo.deleteShop(created.id);
    expect(await repo.getShopById(created.id)).toBeNull();
  });

  it("listPublishedShopsはstatus:publishedのみを返す(draftは含まれない)", async () => {
    const infoAsOf = Timestamp.now();

    const published = await repo.createShop(buildShopInput(infoAsOf, { status: "published" }));
    publishedId = published.id;
    const draft = await repo.createShop(buildShopInput(infoAsOf, { status: "draft" }));
    draftId = draft.id;

    const publishedShops = await repo.listPublishedShops();
    const ids = publishedShops.map((shop) => shop.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draft.id);
  });

  it("getShopByIdは存在しないIDに対してnullを返す", async () => {
    expect(await repo.getShopById(uniqueTestId("shop-not-found"))).toBeNull();
  });
});
