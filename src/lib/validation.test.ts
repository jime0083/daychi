/**
 * src/lib/validation.ts のユニットテスト(タスク6-2: 店舗のInstagramリンク、P-020。
 * タスク6-3: Google Place ID、P-021で validatePlaceId のテストを追加)。
 * 純粋関数のためFirebase Emulatorへの接続は不要で常に実行される。
 */
import { describe, expect, it } from "vitest";

import { validateInstagramUrl, validatePlaceId } from "@/lib/validation";

describe("validateInstagramUrl", () => {
  it("空文字は登録なしとして許可し、dataは空文字を返す", () => {
    const result = validateInstagramUrl("");
    expect(result).toEqual({ ok: true, data: "" });
  });

  it("空白のみの入力は登録なしとして許可する", () => {
    const result = validateInstagramUrl("   ");
    expect(result).toEqual({ ok: true, data: "" });
  });

  it("https://www.instagram.com/ から始まるURLは許可し、前後の空白を除去する", () => {
    const result = validateInstagramUrl("  https://www.instagram.com/daychi_coffee/  ");
    expect(result).toEqual({ ok: true, data: "https://www.instagram.com/daychi_coffee/" });
  });

  it("https://www.instagram.com/ から始まらないURLはエラーになる", () => {
    const result = validateInstagramUrl("https://instagram.com/daychi_coffee/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("https://www.instagram.com/");
    }
  });

  it("Instagram以外のURLはエラーになる", () => {
    const result = validateInstagramUrl("https://x.com/daychi_coffee");
    expect(result.ok).toBe(false);
  });

  it("URL形式でない文字列はエラーになる", () => {
    const result = validateInstagramUrl("daychi_coffee");
    expect(result.ok).toBe(false);
  });
});

describe("validatePlaceId", () => {
  it("空文字は登録なしとして許可し、dataは空文字を返す", () => {
    const result = validatePlaceId("");
    expect(result).toEqual({ ok: true, data: "" });
  });

  it("空白のみの入力は登録なしとして許可する", () => {
    const result = validatePlaceId("   ");
    expect(result).toEqual({ ok: true, data: "" });
  });

  it("英数字・ハイフン・アンダースコアのみのIDは許可し、前後の空白を除去する", () => {
    const result = validatePlaceId("  ChIJN1t_tDeuEmsRUsoyG83frY4  ");
    expect(result).toEqual({ ok: true, data: "ChIJN1t_tDeuEmsRUsoyG83frY4" });
  });

  it("ハイフンを含むIDも許可する", () => {
    const result = validatePlaceId("abc-123_XYZ");
    expect(result).toEqual({ ok: true, data: "abc-123_XYZ" });
  });

  it("空白を含む値はエラーになる", () => {
    const result = validatePlaceId("abc 123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("英数字・ハイフン・アンダースコア");
    }
  });

  it("記号(スラッシュ等)を含む値はエラーになる", () => {
    const result = validatePlaceId("abc/123");
    expect(result.ok).toBe(false);
  });

  it("日本語を含む値はエラーになる", () => {
    const result = validatePlaceId("プレイスID123");
    expect(result.ok).toBe(false);
  });
});
