/**
 * Firebase Emulator接続を前提とするテスト(src/repositories/*.test.ts と
 * src/lib/firestore-rules.test.ts)専用の共通ヘルパー。
 * テストファイル自体ではない(*.test.tsという命名ではないため、vitestのテスト
 * スイートとしては実行されない)。
 *
 * これらのテストはFirebase Emulator Suite の Firestore(localhost:8080)/
 * Auth(localhost:9099)へ実際に接続してCRUDやルール判定を検証する。事前に
 * `npm run emulator` でエミュレータを起動してから `npm run test` を実行すること。
 * エミュレータが起動していない場合、各テストスイートは自動的にskipされる
 * (skipされた場合もコマンド自体は正常終了する)。
 */
import type { Auth } from "firebase/auth";

import {
  AUTH_EMULATOR_HOST,
  AUTH_EMULATOR_PORT,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
} from "@/lib/firebase-config";

/**
 * テストファイルの先頭、かつ他のモジュールをdynamic importするより前に呼び出すこと。
 *
 * "@/lib/firebase" はモジュール評価(import)時にEmulator接続要否を判定して
 * 副作用(initializeApp/connectFirestoreEmulator/getAuth)を実行するため、その判定より前に
 * 環境変数を設定しておく必要がある。ESMの静的importは常にファイル本体より先に
 * 評価される(hoistされる)ため、"@/repositories/*" や "@/lib/firebase" を
 * static importせず、この関数を呼んだ後に dynamic import(`await import(...)`)する。
 *
 * NEXT_PUBLIC_FIREBASE_API_KEYには、Firebase Auth SDKの初期化時フォーマット検証
 * (auth/invalid-api-key)を通すためだけのダミー値を設定する。Auth Emulatorへの接続後は
 * 実際に外部へリクエストされないため、値の実在性は問われない。
 */
export function enableFirestoreEmulatorEnv(): void {
  process.env.NEXT_PUBLIC_USE_EMULATOR = "true";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-emulator-dummy-api-key";
}

/**
 * Firestore Emulatorが起動しているかどうかを判定する。
 * 呼び出し側は結果に応じて `describe.skipIf(!available)` 等でテストをskipすること。
 */
export async function isFirestoreEmulatorAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
      // Firestore Emulatorはルートパスへのリクエストにも(ステータスコードに関わらず)
      // 応答を返す。fetchが例外を投げずに完了すれば疎通しているとみなす。
      await fetch(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/`, {
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/** テスト間・テスト実行間の衝突を避けるための一意なIDを生成する */
export function uniqueTestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Firebase Auth Emulatorに匿名ユーザーとしてサインインし、カスタムクレーム
 * `admin: true` を付与した状態にする。
 *
 * タスク1-5で本実装したfirestore.rulesは書き込み(および draft の read)を
 * `request.auth.token.admin == true` のユーザーのみに許可するため、
 * Emulator接続前提のリポジトリテスト(CRUD検証)はこの権限を持って実行する必要がある。
 *
 * カスタムクレームの付与は本来Firebase Admin SDKが行う操作だが、本プロジェクトの
 * リポジトリ層はクライアントSDK(firebase/*)のみに依存する方針のため、
 * Admin SDKがAuth Emulator接続時に内部的に使っているのと同じ手順
 * (Auth Emulatorが特別に受け付ける "Bearer owner" 権限トークンでのREST呼び出し)を
 * fetchで直接再現する。この挙動はfirebase-toolsのAuth Emulator実装
 * (privileged判定: Authorization: Bearer owner を Oauth2認証として受理する)に基づく。
 *
 * 呼び出し側は `enableFirestoreEmulatorEnv()` 実行後・`@/lib/firebase` を
 * dynamic importした後に、その `auth` インスタンスを渡して呼び出すこと。
 */
export async function signInAsEmulatorAdmin(auth: Auth): Promise<void> {
  const { signInAnonymously } = await import("firebase/auth");
  const credential = await signInAnonymously(auth);

  const projectId = auth.app.options.projectId;
  if (!projectId) {
    throw new Error(
      "Firebase Auth Emulatorへのカスタムクレーム付与にはprojectIdの解決が必要です(auth.app.options.projectId が未設定)",
    );
  }

  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        localId: credential.user.uid,
        customAttributes: JSON.stringify({ admin: true }),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Auth Emulatorへのカスタムクレーム付与に失敗しました(status: ${response.status})`,
    );
  }

  // カスタムクレームはID Tokenの発行時にしか反映されないため、強制的にリフレッシュする
  await credential.user.getIdToken(true);
}
