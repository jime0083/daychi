"use client";

/**
 * 管理画面(/admin)の認証状態を扱う React Context(タスク2-1)。
 *
 * requirements.md「4. データモデル」の管理者判定方針(2026-09-19確定)に従い、
 * 管理者判定はIDトークンのカスタムクレーム `admin == true` のみで行う
 * (メールアドレスのハードコード比較は行わない)。
 *
 * `onIdTokenChanged` を使う理由: サインイン/サインアウトだけでなく、IDトークンが
 * 更新されたタイミング(`user.getIdToken(true)` による強制リフレッシュ含む)でも
 * 発火するため、クレーム付与直後にトークンを更新した場合の再判定にも対応できる
 * (`onAuthStateChanged` はトークン更新だけでは発火しない)。
 *
 * このモジュールはタスク2-2以降の管理画面(CRUD)からも `useAdminAuth` を
 * そのまま再利用できるよう、/admin 配下の共通レイアウト(src/app/admin/layout.tsx)
 * からのみ Provider を配置する想定で設計している。
 */
import {
  type User,
  onIdTokenChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { auth } from "@/lib/firebase";

export type AdminAuthStatus =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "signed-in"; user: User; isAdmin: boolean };

const AdminAuthContext = createContext<AdminAuthStatus | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>({ state: "loading" });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      if (!user) {
        setStatus({ state: "signed-out" });
        return;
      }

      user
        .getIdTokenResult()
        .then((tokenResult) => {
          setStatus({ state: "signed-in", user, isAdmin: tokenResult.claims.admin === true });
        })
        .catch(() => {
          // トークン取得に失敗した場合は安全側(非管理者扱い)に倒す
          setStatus({ state: "signed-in", user, isAdmin: false });
        });
    });

    return unsubscribe;
  }, []);

  return <AdminAuthContext.Provider value={status}>{children}</AdminAuthContext.Provider>;
}

/** /admin 配下のコンポーネントから認証状態を参照するためのフック */
export function useAdminAuth(): AdminAuthStatus {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth は AdminAuthProvider の内側でのみ使用できます");
  }
  return context;
}

/** 管理画面からのログアウト処理 */
export async function signOutAdmin(): Promise<void> {
  await firebaseSignOut(auth);
}
