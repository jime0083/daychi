import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAppsMock = vi.fn(() => [] as unknown[]);
const initializeAppMock = vi.fn((options?: { projectId?: string }) => ({
  name: "[DEFAULT]",
  options,
}));
const getFirestoreMock = vi.fn(() => ({ __type: "firestore" }));
const connectFirestoreEmulatorMock = vi.fn();
const getAuthMock = vi.fn(() => ({ __type: "auth" }));
const connectAuthEmulatorMock = vi.fn();

vi.mock("firebase/app", () => ({
  getApps: getAppsMock,
  initializeApp: initializeAppMock,
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: getFirestoreMock,
  connectFirestoreEmulator: connectFirestoreEmulatorMock,
}));

vi.mock("firebase/auth", () => ({
  getAuth: getAuthMock,
  connectAuthEmulator: connectAuthEmulatorMock,
}));

type GlobalWithFirebaseFlag = typeof globalThis & {
  __daychiFirebaseEmulatorConnected?: boolean;
};

const originalEnv = { ...process.env };

function resetEmulatorConnectedFlag(): void {
  delete (globalThis as GlobalWithFirebaseFlag).__daychiFirebaseEmulatorConnected;
}

beforeEach(() => {
  vi.resetModules();
  getAppsMock.mockReturnValue([]);
  initializeAppMock.mockClear();
  getFirestoreMock.mockClear();
  connectFirestoreEmulatorMock.mockClear();
  getAuthMock.mockClear();
  connectAuthEmulatorMock.mockClear();
  resetEmulatorConnectedFlag();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetEmulatorConnectedFlag();
});

describe("firebase.ts の初期化とEmulator接続切替", () => {
  it("NEXT_PUBLIC_USE_EMULATOR未設定(本番想定)ではEmulatorに接続しない", async () => {
    delete process.env.NEXT_PUBLIC_USE_EMULATOR;

    await import("./firebase");

    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulatorMock).not.toHaveBeenCalled();
    expect(connectAuthEmulatorMock).not.toHaveBeenCalled();
  });

  it("NEXT_PUBLIC_USE_EMULATOR=trueのときlocalhost:8080/9099のEmulatorに接続する", async () => {
    process.env.NEXT_PUBLIC_USE_EMULATOR = "true";

    const { db, auth } = await import("./firebase");

    expect(connectFirestoreEmulatorMock).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulatorMock).toHaveBeenCalledWith(db, "localhost", 8080);

    expect(connectAuthEmulatorMock).toHaveBeenCalledTimes(1);
    expect(connectAuthEmulatorMock).toHaveBeenCalledWith(
      auth,
      "http://localhost:9099",
      expect.objectContaining({ disableWarnings: true }),
    );
  });

  it("Emulator未設定時にprojectId未設定でもinitializeAppが呼ばれビルドが壊れない", async () => {
    delete process.env.NEXT_PUBLIC_USE_EMULATOR;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    await import("./firebase");

    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    const passedOptions = initializeAppMock.mock.calls[0][0];
    expect(passedOptions?.projectId).toBeUndefined();
  });

  it("Emulator有効かつprojectId未設定のときデモprojectIdでinitializeAppする", async () => {
    process.env.NEXT_PUBLIC_USE_EMULATOR = "true";
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    await import("./firebase");

    const passedOptions = initializeAppMock.mock.calls[0][0];
    expect(passedOptions?.projectId).toBe("demo-daychi-coffee-map");
  });

  it("既存のFirebase Appがある場合はinitializeAppを再実行せず既存を再利用する", async () => {
    const existingApp = { name: "[DEFAULT]", existing: true };
    getAppsMock.mockReturnValue([existingApp]);

    await import("./firebase");

    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(getFirestoreMock).toHaveBeenCalledWith(existingApp);
    expect(getAuthMock).toHaveBeenCalledWith(existingApp);
  });

  it("同一プロセス内で再読み込みされてもEmulatorへ二重接続しない(HMR相当のケース)", async () => {
    process.env.NEXT_PUBLIC_USE_EMULATOR = "true";

    await import("./firebase");
    expect(connectFirestoreEmulatorMock).toHaveBeenCalledTimes(1);

    // モジュールキャッシュのみリセットし、グローバルフラグはそのまま維持した状態で
    // 再度読み込む(Next.jsのHot Module Reloadで発生し得る状況を再現)
    vi.resetModules();
    await import("./firebase");

    expect(connectFirestoreEmulatorMock).toHaveBeenCalledTimes(1);
    expect(connectAuthEmulatorMock).toHaveBeenCalledTimes(1);
  });
});
