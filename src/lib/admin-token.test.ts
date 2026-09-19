import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractBearerToken, verifyAdminIdToken } from "./admin-token";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("extractBearerToken", () => {
  it("Bearer形式のAuthorizationヘッダーからトークンを取り出す", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("大文字小文字を区別しない(bearer)", () => {
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("ヘッダーが無い場合はnullを返す", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("Bearer形式でない場合はnullを返す", () => {
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });
});

describe("verifyAdminIdToken", () => {
  beforeEach(() => {
    resetEnv();
    process.env.NEXT_PUBLIC_USE_EMULATOR = "true";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
  });

  afterEach(() => {
    resetEnv();
    vi.unstubAllGlobals();
  });

  it("空文字のトークンはfalseを返す(fetchを呼ばない)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyAdminIdToken("")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admin:trueのcustomAttributesを持つユーザーはtrueを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{ customAttributes: JSON.stringify({ admin: true }) }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(true);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("localhost:9099/identitytoolkit.googleapis.com/v1/accounts:lookup");
    expect(calledUrl).toContain("key=test-api-key");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({ idToken: "valid-token" });
  });

  it("customAttributesにadmin:trueが無いユーザーはfalseを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ customAttributes: JSON.stringify({ admin: false }) }],
        }),
      }),
    );

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(false);
  });

  it("customAttributes自体が無いユーザーはfalseを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [{}] }),
      }),
    );

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(false);
  });

  it("usersが空配列(トークン無効)の場合はfalseを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [] }),
      }),
    );

    await expect(verifyAdminIdToken("invalid-token")).resolves.toBe(false);
  });

  it("REST APIがエラーレスポンスを返した場合はfalseを返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    await expect(verifyAdminIdToken("expired-token")).resolves.toBe(false);
  });

  it("fetch自体が例外を投げた場合はfalseを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(false);
  });

  it("customAttributesが不正なJSONの場合はfalseを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [{ customAttributes: "{not-json" }] }),
      }),
    );

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(false);
  });

  it("本番相当(Emulator無効)の場合はIdentity Toolkitの本番エンドポイントを呼ぶ", async () => {
    process.env.NEXT_PUBLIC_USE_EMULATOR = "false";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "prod-api-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ customAttributes: JSON.stringify({ admin: true }) }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(true);

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=prod-api-key",
    );
  });

  it("本番相当かつAPIキー未設定の場合はfalseを返す(fetchを呼ばない)", async () => {
    process.env.NEXT_PUBLIC_USE_EMULATOR = "false";
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyAdminIdToken("valid-token")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
