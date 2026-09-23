import { describe, expect, it } from "vitest";

import { checkVideoDraftApproval } from "./approval";

describe("checkVideoDraftApproval", () => {
  it("店舗・訪問がいずれも問題なければ承認できる", () => {
    const result = checkVideoDraftApproval(
      [{ id: "shop-1", name: "テスト店", locationConfirmed: true }],
      [{ id: "visit-1" }],
    );
    expect(result.canApprove).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.blockingShopIds).toEqual([]);
    expect(result.blockingVisitIds).toEqual([]);
  });

  it("locationConfirmedが未設定(確定済み扱い)の店舗は承認をブロックしない", () => {
    const result = checkVideoDraftApproval([{ id: "shop-1", name: "テスト店" }], []);
    expect(result.canApprove).toBe(true);
  });

  it("locationConfirmedがfalseの店舗があると承認できない", () => {
    const result = checkVideoDraftApproval(
      [{ id: "shop-1", name: "座標未確定店", locationConfirmed: false }],
      [],
    );
    expect(result.canApprove).toBe(false);
    expect(result.blockingShopIds).toEqual(["shop-1"]);
    expect(result.reasons[0]).toContain("座標未確定店");
    expect(result.reasons[0]).toContain("座標が未確定");
  });

  it("unresolvedConsumptionsが空配列の訪問は承認をブロックしない", () => {
    const result = checkVideoDraftApproval([], [{ id: "visit-1", unresolvedConsumptions: [] }]);
    expect(result.canApprove).toBe(true);
  });

  it("unresolvedConsumptionsが1件以上残っている訪問があると承認できない", () => {
    const result = checkVideoDraftApproval(
      [],
      [
        { id: "visit-1", unresolvedConsumptions: [{ performerName: "謎の出演者", items: ["コーヒー"] }] },
        { id: "visit-2" },
      ],
    );
    expect(result.canApprove).toBe(false);
    expect(result.blockingVisitIds).toEqual(["visit-1"]);
    expect(result.reasons[0]).toContain("1件");
  });

  it("店舗・訪問の両方に問題があると両方の理由が返る", () => {
    const result = checkVideoDraftApproval(
      [{ id: "shop-1", name: "座標未確定店", locationConfirmed: false }],
      [{ id: "visit-1", unresolvedConsumptions: [{ performerName: "謎の出演者", items: ["コーヒー"] }] }],
    );
    expect(result.canApprove).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.blockingShopIds).toEqual(["shop-1"]);
    expect(result.blockingVisitIds).toEqual(["visit-1"]);
  });
});
