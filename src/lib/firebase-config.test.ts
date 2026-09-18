import { describe, expect, it } from "vitest";

import {
  AUTH_EMULATOR_HOST,
  AUTH_EMULATOR_PORT,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  getEmulatorConnectionConfig,
  getFirebaseWebConfig,
  isEmulatorEnabled,
  resolveFirebaseOptions,
} from "./firebase-config";

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("isEmulatorEnabled", () => {
  it("NEXT_PUBLIC_USE_EMULATORが'true'のときtrueを返す", () => {
    expect(isEmulatorEnabled(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "true" }))).toBe(true);
  });

  it("NEXT_PUBLIC_USE_EMULATORが未設定のときfalseを返す", () => {
    expect(isEmulatorEnabled(makeEnv({}))).toBe(false);
  });

  it("NEXT_PUBLIC_USE_EMULATORが'false'のときfalseを返す", () => {
    expect(isEmulatorEnabled(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "false" }))).toBe(false);
  });

  it("NEXT_PUBLIC_USE_EMULATORが'true'以外の文字列のときfalseを返す(誤設定の誤爆防止)", () => {
    expect(isEmulatorEnabled(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "TRUE" }))).toBe(false);
    expect(isEmulatorEnabled(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "1" }))).toBe(false);
  });
});

describe("getFirebaseWebConfig", () => {
  it("環境変数からFirebase構成値をそのまま読み取る", () => {
    const config = getFirebaseWebConfig(
      makeEnv({
        NEXT_PUBLIC_FIREBASE_API_KEY: "api-key",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "auth-domain",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "project-id",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "storage-bucket",
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "sender-id",
        NEXT_PUBLIC_FIREBASE_APP_ID: "app-id",
      }),
    );

    expect(config).toEqual({
      apiKey: "api-key",
      authDomain: "auth-domain",
      projectId: "project-id",
      storageBucket: "storage-bucket",
      messagingSenderId: "sender-id",
      appId: "app-id",
    });
  });

  it("未設定のキーはundefinedのまま返す", () => {
    const config = getFirebaseWebConfig(makeEnv({}));
    expect(config.apiKey).toBeUndefined();
    expect(config.projectId).toBeUndefined();
  });
});

describe("resolveFirebaseOptions", () => {
  it("Emulator無効時は構成値をそのまま返す(projectId未設定でも補完しない)", () => {
    const options = resolveFirebaseOptions(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "false" }));
    expect(options.projectId).toBeUndefined();
  });

  it("Emulator有効かつprojectId未設定のときデモ用projectIdを補完する", () => {
    const options = resolveFirebaseOptions(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "true" }));
    expect(options.projectId).toBe("demo-daychi-coffee-map");
  });

  it("Emulator有効でもprojectIdが設定済みならそれを優先する", () => {
    const options = resolveFirebaseOptions(
      makeEnv({
        NEXT_PUBLIC_USE_EMULATOR: "true",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "real-project-id",
      }),
    );
    expect(options.projectId).toBe("real-project-id");
  });
});

describe("getEmulatorConnectionConfig", () => {
  it("Emulator無効時はnullを返す(本番Firebaseへの接続を維持する)", () => {
    expect(getEmulatorConnectionConfig(makeEnv({}))).toBeNull();
    expect(getEmulatorConnectionConfig(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "false" }))).toBeNull();
  });

  it("Emulator有効時はfirestore/authそれぞれのホスト・ポートを返す", () => {
    const config = getEmulatorConnectionConfig(makeEnv({ NEXT_PUBLIC_USE_EMULATOR: "true" }));

    expect(config).toEqual({
      firestore: { host: FIRESTORE_EMULATOR_HOST, port: FIRESTORE_EMULATOR_PORT },
      auth: { host: AUTH_EMULATOR_HOST, port: AUTH_EMULATOR_PORT },
    });
  });

  it("Emulatorのポートはタスク1-3のfirebase.jsonと整合する標準ポートである", () => {
    expect(FIRESTORE_EMULATOR_PORT).toBe(8080);
    expect(AUTH_EMULATOR_PORT).toBe(9099);
  });
});
