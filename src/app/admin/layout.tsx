/**
 * /admin 配下の共通レイアウト(タスク2-1)。
 *
 * AdminAuthProvider(Context)でログイン状態を購読し、AdminGateで
 * ログイン状態・adminクレームの有無に応じた画面(ログイン/アクセス拒否/管理画面)
 * に振り分ける。実際のCRUD画面(タスク2-2以降)は {children} として
 * AdminShell配下に描画される。
 */
import { AdminAuthProvider } from "@/lib/admin-auth";
import { AdminGate } from "@/components/admin/AdminGate";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AdminAuthProvider>
      <AdminGate>{children}</AdminGate>
    </AdminAuthProvider>
  );
}
