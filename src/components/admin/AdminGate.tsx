"use client";

/**
 * /admin 配下のアクセス制御の分岐点(タスク2-1)。
 * useAdminAuth() の状態に応じて表示を切り替える:
 *   loading      : 判定中の簡易表示
 *   signed-out   : ログイン画面
 *   signed-in かつ isAdmin=false : アクセス拒否画面
 *   signed-in かつ isAdmin=true  : 管理画面シェル(ナビゲーション + 実際のページ内容)
 */
import type { ReactNode } from "react";

import { useAdminAuth } from "@/lib/admin-auth";
import { AccessDeniedScreen } from "@/components/admin/AccessDeniedScreen";
import { AdminShell } from "@/components/admin/AdminShell";
import { LoginScreen } from "@/components/admin/LoginScreen";

export function AdminGate({ children }: { children: ReactNode }) {
  const status = useAdminAuth();

  if (status.state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      </div>
    );
  }

  if (status.state === "signed-out") {
    return <LoginScreen />;
  }

  if (!status.isAdmin) {
    return <AccessDeniedScreen user={status.user} />;
  }

  return <AdminShell user={status.user}>{children}</AdminShell>;
}
