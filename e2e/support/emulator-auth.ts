/**
 * E2E(Playwright)から Firebase Auth Emulator にテスト用ユーザーを直接作成する
 * ヘルパー(タスク2-1: 管理画面レイアウトとGoogle認証)。
 *
 * 背景: Auth EmulatorのGoogleログインはフェイクアカウントのポップアップ操作を
 * 経由するフローになり、Playwrightからの自動操作が不安定になりやすい。
 * そのためE2Eでは、Emulator REST APIで直接email/passwordのテストユーザーを作成し
 * (必要なら admin カスタムクレームも付与し)、管理画面のログイン画面に用意した
 * 「Emulatorテストログイン」フォーム(src/components/admin/LoginScreen.tsx。
 * NEXT_PUBLIC_USE_EMULATOR=true の時のみ表示)から signInWithEmailAndPassword で
 * サインインする。これにより「adminクレームの有無で /admin の表示が分岐する」という
 * 検証したい本質的な挙動は、本番と同じ AdminAuthProvider の判定ロジックを通して確認できる。
 *
 * admin クレーム付与のREST呼び出しは src/repositories/test-support.ts の
 * signInAsEmulatorAdmin と同じ「Authorization: Bearer owner」パターン
 * (Auth Emulatorが特権操作として受理する擬似トークン)を踏襲している。
 */
import { enableFirestoreEmulatorEnv } from "@/repositories/test-support";
import { AUTH_EMULATOR_HOST, AUTH_EMULATOR_PORT } from "@/lib/firebase-config";

interface CreateEmulatorTestUserOptions {
  /** テストユーザーのメールアドレス(呼び出し側で一意な値を渡すこと) */
  email: string;
  password: string;
  /** true の場合、作成直後に admin カスタムクレームを付与する */
  admin: boolean;
}

/**
 * @/lib/firebase-config の resolveFirebaseOptions() と同じロジックで、
 * Emulator接続時にアプリ本体(Next.js dev server)が使うのと同じ projectId を解決する。
 * (Playwrightのテストプロセスはdev serverとは別プロセスのため、
 * process.env を直接ここで用意してから同じ純粋関数を呼び出す)
 */
async function resolveEmulatorProjectId(): Promise<string> {
  enableFirestoreEmulatorEnv();
  const { resolveFirebaseOptions } = await import("@/lib/firebase-config");
  // 引数を省略すると呼び出し時点の process.env を直接読み取る(firebase-config.ts の
  // readEnv() 参照)。直前の enableFirestoreEmulatorEnv() による process.env の
  // ミューテーションが確実に反映される
  const options = resolveFirebaseOptions();
  if (!options.projectId) {
    throw new Error("Auth Emulator用のprojectIdを解決できませんでした");
  }
  return options.projectId;
}

/**
 * Auth Emulatorにemail/passwordのテストユーザーを作成する(admin: trueの場合は
 * customClaimsに admin: true も設定する)。
 */
export async function createEmulatorTestUser(options: CreateEmulatorTestUserOptions): Promise<void> {
  const signUpResponse = await fetch(
    `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=e2e-test-dummy-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
        returnSecureToken: true,
      }),
    },
  );

  if (!signUpResponse.ok) {
    throw new Error(
      `Auth Emulatorへのテストユーザー作成に失敗しました(status: ${signUpResponse.status})`,
    );
  }

  if (!options.admin) {
    return;
  }

  const { localId } = (await signUpResponse.json()) as { localId: string };
  const projectId = await resolveEmulatorProjectId();

  const updateResponse = await fetch(
    `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        localId,
        customAttributes: JSON.stringify({ admin: true }),
      }),
    },
  );

  if (!updateResponse.ok) {
    throw new Error(
      `Auth Emulatorへのadminクレーム付与に失敗しました(status: ${updateResponse.status})`,
    );
  }
}
