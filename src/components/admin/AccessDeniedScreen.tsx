"use client";

/**
 * ログイン済みだが admin クレームを持たないユーザーに表示するアクセス拒否画面
 * (タスク2-1)。requirements.md「3.2 管理画面」の通り、ログイン済みでも
 * カスタムクレーム admin == true を持たない場合はここでアクセスを止める。
 */
import type { User } from "firebase/auth";

import { signOutAdmin } from "@/lib/admin-auth";

export function AccessDeniedScreen({ user }: { user: User }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-8 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        アクセス権がありません
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {user.email ?? "このアカウント"} には管理画面へのアクセス権がありません。
      </p>
      <button
        type="button"
        onClick={() => {
          void signOutAdmin();
        }}
        className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        ログアウト
      </button>
    </div>
  );
}
