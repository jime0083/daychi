"use client";

/**
 * 保存成功時の一時的なフィードバックメッセージ表示(タスク2-7: 管理画面仕上げ)。
 *
 * 呼び出し側(各admin一覧ページ)が src/lib/use-transient-message.ts の
 * useTransientMessage() で管理する message state をそのまま渡す想定。
 * message が null の間は何も描画しない。
 */
interface SuccessMessageProps {
  /** data-testid に使う値(各画面のtestid命名規則に合わせて呼び出し側が指定する) */
  testId: string;
  message: string | null;
}

export function SuccessMessage({ testId, message }: SuccessMessageProps) {
  if (message === null) {
    return null;
  }

  return (
    <p
      data-testid={testId}
      role="status"
      className="text-sm text-emerald-600 dark:text-emerald-400"
    >
      {message}
    </p>
  );
}
