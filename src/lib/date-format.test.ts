/**
 * src/lib/date-format.ts のユニットテスト(タスク3-2: スライドアップ詳細シート)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { formatDateJa, formatInfoAsOf } from "@/lib/date-format";

describe("formatDateJa", () => {
  it("YYYY年M月D日形式に整形する(1桁の月日はそのまま、ゼロ埋めしない)", () => {
    const timestamp = Timestamp.fromDate(new Date("2026-01-05T00:00:00+09:00"));
    expect(formatDateJa(timestamp)).toBe("2026年1月5日");
  });

  it("2桁の月日も正しく整形する", () => {
    const timestamp = Timestamp.fromDate(new Date("2026-12-25T00:00:00+09:00"));
    expect(formatDateJa(timestamp)).toBe("2026年12月25日");
  });
});

describe("formatInfoAsOf", () => {
  it("※YYYY年M月D日現在の形式に整形する", () => {
    const timestamp = Timestamp.fromDate(new Date("2026-01-15T00:00:00+09:00"));
    expect(formatInfoAsOf(timestamp)).toBe("※2026年1月15日現在");
  });
});
