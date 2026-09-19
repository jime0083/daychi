"use client";

/**
 * 公開ステータス(draft⇔published)切替ボタン(タスク2-6)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」に基づき、shops/videos/visits
 * 一覧の各行で共通に使う。表示中のステータスから次に遷移すべきステータスを算出し、
 * 呼び出し側(各admin一覧ページ)が渡す onToggle(リポジトリのupdateでstatusのみ
 * 更新→一覧再取得)を実行する。
 *
 * 誤操作防止の確認ダイアログは範囲外(タスク2-7)。ただし切替中の二重クリックは
 * このコンポーネント内のローカルなtoggling状態でボタンをdisabledにして防ぐ。
 * エラー表示は呼び出し側の一覧エラー表示(listError等)に委譲する(onToggle内で処理)。
 */
import { useState } from "react";

import type { PublishStatus } from "@/types/common";

interface PublishStatusToggleProps {
  status: PublishStatus;
  /** data-testid に使う値(各画面のtestid命名規則に合わせて呼び出し側が指定する) */
  testId: string;
  /** 次のステータスへの切替を行う非同期処理(エラーハンドリングは呼び出し側で行う) */
  onToggle: (nextStatus: PublishStatus) => Promise<void>;
}

/** draft⇔publishedの次状態 */
const NEXT_STATUS: Record<PublishStatus, PublishStatus> = {
  draft: "published",
  published: "draft",
};

/** ボタンラベル(次に何になるかを表す動詞的なラベルにする) */
const TOGGLE_LABEL: Record<PublishStatus, string> = {
  draft: "公開する",
  published: "下書きに戻す",
};

export function PublishStatusToggle({ status, testId, onToggle }: PublishStatusToggleProps) {
  const [toggling, setToggling] = useState(false);

  async function handleClick(): Promise<void> {
    setToggling(true);
    try {
      await onToggle(NEXT_STATUS[status]);
    } finally {
      setToggling(false);
    }
  }

  return (
    <button
      type="button"
      data-testid={testId}
      disabled={toggling}
      onClick={() => {
        void handleClick();
      }}
      className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {toggling ? "更新中..." : TOGGLE_LABEL[status]}
    </button>
  );
}
