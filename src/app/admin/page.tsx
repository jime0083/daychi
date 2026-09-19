/**
 * 管理画面ダッシュボード(/admin トップ、タスク2-1)。
 * 各マスタCRUD画面(タスク2-2以降)が実装されるまでの仮のホーム画面。
 */
export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">ダッシュボード</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        左のメニューから各マスタの管理画面に移動してください。
      </p>
    </div>
  );
}
