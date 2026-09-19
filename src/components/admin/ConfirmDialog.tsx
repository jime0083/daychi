"use client";

/**
 * 削除操作前の確認ダイアログ(タスク2-7: 管理画面仕上げ)。
 *
 * performers/videos/shops/visits の全admin画面の削除操作で共通に使う。
 * window.confirm ではなくカスタムダイアログにしている理由: window.confirm は
 * ブラウザネイティブのモーダルでDOM上に要素が存在せず、Playwrightでの検証が
 * page.on("dialog") のイベントハンドリングに限定され通常のtestid/roleベースの
 * 操作(クリック)で検証できない。カスタムダイアログにすることで、他の
 * admin画面の要素と同じ方法(getByTestId等)でE2E検証できるようにする。
 *
 * このコンポーネント自身は開閉状態を持たない。呼び出し側(各admin一覧ページ)が
 * 「削除対象」の有無(null かどうか)で表示/非表示を制御し、target が null でない
 * ときだけこのコンポーネントを描画する。
 */
interface ConfirmDialogProps {
  /** data-testid の接頭辞。ダイアログ本体・確認/キャンセルボタンのtestidに使う */
  testId: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  testId,
  title,
  message,
  confirmLabel = "削除する",
  cancelLabel = "キャンセル",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = `${testId}-title`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        data-testid={testId}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            onClick={onCancel}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            onClick={onConfirm}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
