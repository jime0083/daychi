/**
 * 管理者カスタムクレーム付与スクリプト(タスク2-8。requirements.md「4. データモデル」
 * セキュリティルール方針: 管理者判定はカスタムクレーム request.auth.token.admin == true)。
 *
 * 本番Firebase ProjectのFirebase Authユーザーに { admin: true } カスタムクレームを
 * 付与する。Firebase Admin SDKの初期化にはサービスアカウントキー(秘密鍵JSON)が必要
 * (manual-work.txt Work 10で取得する。絶対にコミットしないこと)。
 *
 * 【重要】本番の管理画面に対象メールアドレスで一度Googleログインしておくこと
 * (Firebase Authにユーザーが存在しないとクレームを付与できない)。
 *
 * 使い方:
 *   1) サービスアカウントキーを環境変数 GOOGLE_APPLICATION_CREDENTIALS で指定する場合:
 *      GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json npx tsx scripts/set-admin-claim.ts akito14140099@gmail.com
 *
 *   2) サービスアカウントキーのパスを第2引数で直接指定する場合:
 *      npx tsx scripts/set-admin-claim.ts akito14140099@gmail.com ./sa-key.json
 *
 * 対象メールアドレスは第1引数(必須)で受け取る。ハードコードはしない。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { type App, applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function resolveTargetEmail(): string {
  const email = process.argv[2];
  if (!email) {
    throw new Error(
      "対象メールアドレスを第1引数で指定してください。例: npx tsx scripts/set-admin-claim.ts you@example.com",
    );
  }
  return email;
}

function resolveServiceAccountPath(): string | undefined {
  const argPath = process.argv[3];
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return undefined;
}

/**
 * サービスアカウントキーの解決優先順位:
 * 1. 第2引数で明示的に指定されたパス
 * 2. GOOGLE_APPLICATION_CREDENTIALS 環境変数(Admin SDK標準の解決方法, applicationDefault()に委譲)
 */
function initializeAdminApp(): App {
  const explicitPath = resolveServiceAccountPath();
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`サービスアカウントキーが見つかりません: ${explicitPath}`);
    }
    const serviceAccount = JSON.parse(readFileSync(explicitPath, "utf8")) as Parameters<
      typeof cert
    >[0];
    return initializeApp({ credential: cert(serviceAccount) });
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "サービスアカウントキーが指定されていません。GOOGLE_APPLICATION_CREDENTIALS 環境変数、" +
        "または第2引数でJSONファイルパスを指定してください。",
    );
  }
  return initializeApp({ credential: applicationDefault() });
}

async function main(): Promise<void> {
  const email = resolveTargetEmail();
  const app = initializeAdminApp();
  const auth = getAuth(app);

  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: true });

  // CLIスクリプトの実行結果報告のための出力(アプリケーションコードのデバッグログではない)
  console.log(`管理者クレームを付与しました: email=${email}, uid=${user.uid}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("管理者クレーム付与に失敗しました:", error);
    process.exit(1);
  });
