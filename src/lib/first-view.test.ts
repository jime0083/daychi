import { afterEach, describe, expect, it, vi } from "vitest";

import { hasSeenFirstView, markFirstViewSeen, prefersReducedMotion } from "./first-view";

// vitest.config.mts の test.environment は "node" のため、window はスタブしない限り
// 存在しない(= 実装のtry/catchフォールバックを自然に検証できる)。
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasSeenFirstView / markFirstViewSeen", () => {
  it("windowが存在しない環境では例外を投げずfalseを返す", () => {
    expect(hasSeenFirstView()).toBe(false);
  });

  it("windowが存在しない環境でもmarkFirstViewSeenは例外を投げない", () => {
    expect(() => markFirstViewSeen()).not.toThrow();
  });

  it("未記録ではfalse、markFirstViewSeenを呼んだ後はtrueを返す", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    expect(hasSeenFirstView()).toBe(false);
    markFirstViewSeen();
    expect(hasSeenFirstView()).toBe(true);
  });

  it("sessionStorageへのアクセスが例外を投げる環境(プライベートモード等)でも落ちない", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(hasSeenFirstView()).toBe(false);
    expect(() => markFirstViewSeen()).not.toThrow();
  });
});

describe("prefersReducedMotion", () => {
  it("windowが存在しない環境では例外を投げずfalseを返す", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("matchMediaがmatches:trueを返す場合はtrueを返す", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it("matchMediaがmatches:falseを返す場合はfalseを返す", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("matchMediaが例外を投げる環境でも落ちない", () => {
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("blocked");
      },
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});
