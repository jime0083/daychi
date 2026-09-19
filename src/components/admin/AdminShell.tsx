"use client";

/**
 * admin クレームを持つユーザーに表示する管理画面の共通シェル(タスク2-1)。
 *
 * ナビゲーション項目は progress.txt のPhase 2で予定されている各CRUD画面
 * (2-2〜2-5)へのリンクの骨組み。本タスクではレイアウトの枠のみを用意し、
 * リンク先ページの実装はタスク範囲外(各タスクで作成する)。
 */
import type { User } from "firebase/auth";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOutAdmin } from "@/lib/admin-auth";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/performers", label: "出演者" },
  { href: "/admin/videos", label: "動画" },
  { href: "/admin/shops", label: "店舗" },
  { href: "/admin/visits", label: "訪問" },
] as const;

export function AdminShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Daychi COFFEE MAP 管理画面
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</span>
          <button
            type="button"
            onClick={() => {
              void signOutAdmin();
            }}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            ログアウト
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        <nav
          aria-label="管理メニュー"
          className="w-48 shrink-0 border-r border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
