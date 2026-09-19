"use client";

/**
 * 管理画面(/admin)の未ログイン時に表示するログイン画面(タスク2-1)。
 *
 * 本番の唯一のログイン導線は Google ログイン(signInWithPopup + GoogleAuthProvider)。
 *
 * 「Emulatorテストログイン」フォームについて:
 * Firebase Auth EmulatorのGoogleログインはフェイクアカウントのポップアップ操作を
 * 経由するフローになり、Playwrightからの自動操作が不安定になりやすい。
 * そのため NEXT_PUBLIC_USE_EMULATOR=true の場合のみ、email/password による
 * サインインフォームを追加で表示する(本番ビルドでは isEmulatorEnabled() が
 * 常に false になるため、このフォームは出力されない)。
 * E2Eテスト(e2e/admin-auth.spec.ts)は Auth Emulator REST API で事前に作成した
 * テストユーザーに対してこのフォームからサインインすることで、
 * 「adminクレームの有無で /admin の表示が分岐する」という本質的な挙動を検証する。
 * サインイン自体は本物の firebase/auth の signInWithEmailAndPassword を使うため、
 * AdminAuthProvider(onIdTokenChanged)以降の判定ロジックは本番のGoogineoginと同一。
 */
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useState, type FormEvent } from "react";

import { isEmulatorEnabled } from "@/lib/firebase-config";
import { auth } from "@/lib/firebase";

export function LoginScreen() {
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [emulatorEmail, setEmulatorEmail] = useState("");
  const [emulatorPassword, setEmulatorPassword] = useState("");
  const [emulatorError, setEmulatorError] = useState<string | null>(null);

  async function handleGoogleLogin(): Promise<void> {
    setGoogleError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setGoogleError(
        `ログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function handleEmulatorLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setEmulatorError(null);
    try {
      await signInWithEmailAndPassword(auth, emulatorEmail, emulatorPassword);
    } catch (error) {
      setEmulatorError(
        `テストログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 p-8 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">管理画面ログイン</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Daychi COFFEE MAP の管理者アカウントでログインしてください
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Googleでログイン
        </button>
        {googleError !== null && (
          <p className="text-sm text-red-600 dark:text-red-400">{googleError}</p>
        )}
      </div>

      {isEmulatorEnabled() && (
        <form
          data-testid="emulator-test-login-form"
          onSubmit={handleEmulatorLogin}
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-6 text-sm dark:border-amber-700 dark:bg-amber-950"
        >
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Emulatorテストログイン(開発・E2E専用)
          </p>
          <input
            data-testid="emulator-test-email"
            type="email"
            placeholder="メールアドレス"
            value={emulatorEmail}
            onChange={(event) => setEmulatorEmail(event.target.value)}
            className="rounded border border-amber-300 bg-white px-3 py-2 dark:border-amber-700 dark:bg-zinc-900"
          />
          <input
            data-testid="emulator-test-password"
            type="password"
            placeholder="パスワード"
            value={emulatorPassword}
            onChange={(event) => setEmulatorPassword(event.target.value)}
            className="rounded border border-amber-300 bg-white px-3 py-2 dark:border-amber-700 dark:bg-zinc-900"
          />
          <button
            data-testid="emulator-test-login-submit"
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-700"
          >
            テストログイン
          </button>
          {emulatorError !== null && (
            <p className="text-red-700 dark:text-red-400">{emulatorError}</p>
          )}
        </form>
      )}
    </div>
  );
}
