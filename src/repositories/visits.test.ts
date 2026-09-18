/**
 * visitsリポジトリ(src/repositories/visits.ts)のユニットテスト。
 *
 * 【重要】このテストはFirebase Emulator Suite(Firestore: localhost:8080)への
 * 接続が必須。事前に `npm run emulator` でエミュレータを起動してから
 * `npm run test` を実行すること。エミュレータ未起動の場合、このスイートは
 * 自動的にskipされる(コマンド自体は失敗しない)。
 *
 * 注: visitsはshopId/videoIdを保持する中間コレクションだが、リポジトリ層は
 * 参照先ドキュメントの存在を検証しないため、このテストでは実在しないダミーの
 * shopId/videoId文字列を用いてCRUDとフィルタリングのみを検証する。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateVisitInput } from "@/repositories/visits";

import {
  enableFirestoreEmulatorEnv,
  isFirestoreEmulatorAvailable,
  signInAsEmulatorAdmin,
  uniqueTestId,
} from "./test-support";

enableFirestoreEmulatorEnv();

const emulatorAvailable = await isFirestoreEmulatorAvailable();

function buildVisitInput(overrides: Partial<CreateVisitInput> = {}): CreateVisitInput {
  return {
    shopId: uniqueTestId("shop-ref"),
    videoId: uniqueTestId("video-ref"),
    consumptions: [{ performerId: uniqueTestId("performer-ref"), items: ["【テスト用】コーヒー"] }],
    status: "published",
    ...overrides,
  };
}

describe.skipIf(!emulatorAvailable)("visitsリポジトリ(Firestore Emulator必須)", () => {
  let repo: typeof import("@/repositories/visits");
  let createdId: string | undefined;
  let publishedId: string | undefined;
  let draftId: string | undefined;

  beforeAll(async () => {
    const { auth } = await import("@/lib/firebase");
    await signInAsEmulatorAdmin(auth);
    repo = await import("@/repositories/visits");
  });

  afterAll(async () => {
    // アサーション失敗時にドキュメントが残らないようにする安全網
    await Promise.all(
      [createdId, publishedId, draftId]
        .filter((id): id is string => Boolean(id))
        .map((id) => repo.deleteVisit(id)),
    );
  });

  it("create → getById → list → update → delete の一連操作ができる", async () => {
    const input = buildVisitInput();

    const created = await repo.createVisit(input);
    createdId = created.id;

    expect(created).toMatchObject({
      shopId: input.shopId,
      videoId: input.videoId,
      consumptions: input.consumptions,
      status: input.status,
    });
    expect(created.id).toBeTruthy();

    const fetched = await repo.getVisitById(created.id);
    expect(fetched).toEqual(created);

    const list = await repo.listVisits();
    expect(list.some((visit) => visit.id === created.id)).toBe(true);

    const updatedConsumptions = [
      { performerId: input.consumptions[0].performerId, items: ["【テスト用】カフェラテ(更新後)"] },
    ];
    await repo.updateVisit(created.id, { consumptions: updatedConsumptions });
    const updated = await repo.getVisitById(created.id);
    expect(updated?.consumptions).toEqual(updatedConsumptions);
    expect(updated?.shopId).toBe(input.shopId);

    await repo.deleteVisit(created.id);
    expect(await repo.getVisitById(created.id)).toBeNull();
  });

  it("listPublishedVisitsはstatus:publishedのみを返す(draftは含まれない)", async () => {
    const published = await repo.createVisit(buildVisitInput({ status: "published" }));
    publishedId = published.id;
    const draft = await repo.createVisit(buildVisitInput({ status: "draft" }));
    draftId = draft.id;

    const publishedVisits = await repo.listPublishedVisits();
    const ids = publishedVisits.map((visit) => visit.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draft.id);
  });

  it("getVisitByIdは存在しないIDに対してnullを返す", async () => {
    expect(await repo.getVisitById(uniqueTestId("visit-not-found"))).toBeNull();
  });
});
