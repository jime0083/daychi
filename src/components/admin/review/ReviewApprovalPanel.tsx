"use client";

/**
 * レビュー画面(/admin/review/[videoId])の承認操作パネル(タスク4-4)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」2026-09-23決定の
 * 「座標未確定の店舗や未割り当ての出演者が残っている間は承認できない」を表示・実行する。
 * 承認可否の判定自体は src/lib/review/approval.ts(純粋関数)の結果をpropsで受け取るのみ。
 */
import type { VideoDraftApprovalResult } from "@/lib/review/approval";

interface ReviewApprovalPanelProps {
  approval: VideoDraftApprovalResult;
  approving: boolean;
  onApprove: () => void;
}

export function ReviewApprovalPanel({ approval, approving, onApprove }: ReviewApprovalPanelProps) {
  return (
    <div
      data-testid="review-approval-panel"
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      {!approval.canApprove && (
        <ul
          data-testid="review-approval-reasons"
          className="flex flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
        >
          {approval.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        data-testid="review-approve-button"
        disabled={!approval.canApprove || approving}
        onClick={onApprove}
        className="w-fit rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {approving ? "公開処理中..." : "承認して公開"}
      </button>
    </div>
  );
}
