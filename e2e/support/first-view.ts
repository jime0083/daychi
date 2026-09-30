import type { Page } from "@playwright/test";

import { FIRST_VIEW_STORAGE_KEY } from "@/lib/first-view";

/**
 * ファーストビュー(タスク7-2)を検証しない既存E2Eが、公開ページ(/)を開くたびに
 * 表示されるファーストビューへ妨げられないようにするヘルパー。
 *
 * ページ側の判定(src/lib/first-view.ts)は、sessionStorageのキー
 * (FIRST_VIEW_STORAGE_KEY)が "true" であれば「このタブで既に表示済み」として
 * ファーストビューを表示しない。page.addInitScript はナビゲーション(goto/reload含む)
 * ごとにドキュメント生成前に再注入されるため、テストの先頭で一度呼ぶだけで、同じテスト内で
 * 複数回 page.goto("/") を呼んでも一貫してファーストビューをスキップできる。
 *
 * ストレージキーはsrc/lib/first-view.tsからimportして使う(ハードコードの二重管理をしない。
 * layout.tsxのブロッキングスクリプトも同じ定数を使う)。ファーストビュー自体の検証は
 * e2e/first-view.spec.ts(タスク7-2)で行う。
 */
export async function skipFirstView(page: Page): Promise<void> {
  await page.addInitScript((storageKey: string) => {
    try {
      window.sessionStorage.setItem(storageKey, "true");
    } catch {
      // プライベートモード等でsessionStorageが使えない環境は元々毎回表示になる
      // (src/lib/first-view.tsと同じ仕様)ため、テスト側で無理に回避しない
    }
  }, FIRST_VIEW_STORAGE_KEY);
}
