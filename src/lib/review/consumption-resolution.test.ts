import { describe, expect, it } from "vitest";

import { resolveUnresolvedConsumption } from "./consumption-resolution";

describe("resolveUnresolvedConsumption", () => {
  it("指定した行をconsumptionsへ移し、unresolvedConsumptionsから取り除く", () => {
    const consumptions = [{ performerId: "performer-1", items: ["ブレンド"] }];
    const unresolved = [
      { performerName: "謎の出演者A", items: ["カフェラテ"] },
      { performerName: "謎の出演者B", items: ["エスプレッソ", "ケーキ"] },
    ];

    const result = resolveUnresolvedConsumption(consumptions, unresolved, 0, "performer-2");

    expect(result.consumptions).toEqual([
      { performerId: "performer-1", items: ["ブレンド"] },
      { performerId: "performer-2", items: ["カフェラテ"] },
    ]);
    expect(result.unresolvedConsumptions).toEqual([
      { performerName: "謎の出演者B", items: ["エスプレッソ", "ケーキ"] },
    ]);
  });

  it("最後の1件を解消するとunresolvedConsumptionsは空配列になる", () => {
    const unresolved = [{ performerName: "謎の出演者", items: ["コーヒー"] }];

    const result = resolveUnresolvedConsumption([], unresolved, 0, "performer-1");

    expect(result.unresolvedConsumptions).toEqual([]);
    expect(result.consumptions).toEqual([{ performerId: "performer-1", items: ["コーヒー"] }]);
  });

  it("引数の配列を変更しない(イミュータブル)", () => {
    const consumptions = [{ performerId: "performer-1", items: ["ブレンド"] }];
    const unresolved = [{ performerName: "謎の出演者", items: ["コーヒー"] }];

    resolveUnresolvedConsumption(consumptions, unresolved, 0, "performer-2");

    expect(consumptions).toEqual([{ performerId: "performer-1", items: ["ブレンド"] }]);
    expect(unresolved).toEqual([{ performerName: "謎の出演者", items: ["コーヒー"] }]);
  });

  it("範囲外のインデックスを指定するとErrorを投げる", () => {
    expect(() => resolveUnresolvedConsumption([], [], 0, "performer-1")).toThrow();
  });
});
