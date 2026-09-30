import { expect, test } from "@playwright/test";

import { uniqueTestId } from "@/repositories/test-support";

import { clickMapPinWithZoom } from "./support/pin-click";
import {
  createPerformersRaw,
  createTagsRaw,
  deletePerformersRaw,
  deleteTagsRaw,
} from "./support/raw-write";

/**
 * タスク6-3a(P-029)のE2Eテスト。
 *
 * problem.txt P-029: モバイル幅で出演者/タグ絞り込み帯(PerformerFilter+TagFilter)の
 * 選択肢が多くなると、絞り込み帯自体は上限なく高さが伸びる一方、DetailSheetは画面下端に
 * 固定表示され内容量に応じて最大80vhまで伸びるため、両者の高さの合計が画面高さを超えると
 * より高いz-index(z-[60])を持つ絞り込み帯がDetailSheetの上部(閉じるボタン等)を画面座標上で
 * 覆い、クリックを奪ってしまう(実測: 出演者・タグ各10件程度でモバイル幅の3〜4割の高さになり
 * 再現)。src/components/map/DetailSheet.tsxの修正(絞り込み帯の実測高さ分だけシートの
 * 最大高さを追加制限する)で解消したことを検証する。
 *
 * 出演者10件・タグ10件は、このテストがFirestore Emulatorへ直接書き込んで用意し
 * (e2e/support/raw-write.ts。管理画面CRUD UIはモバイル幅での安定性の都合上使わない。
 * e2e/performer-filter.spec.ts等と同じ方針)、成功・失敗にかかわらずtry/finallyで
 * 必ず削除する(共有シードは変更しない)。
 *
 * 検証対象はseedのpublished店舗(shop-test-published-01/visit-test-published-01/
 * dAyChiTEST1、他specも参照する読み取り専用データ)。地図タイル(外部ネットワーク依存)は
 * 他specと同様ブロックする。
 */
test.describe("モバイルで絞り込み欄の選択肢が多い場合の操作性(タスク6-3a・P-029)", () => {
  test("出演者10件・タグ10件があっても、詳細シートの開閉・シート内リンク・絞り込み操作がすべて通常クリックでできる", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "P-029はモバイル幅特有の絞り込み帯の高さ超過が原因のため、モバイルプロジェクトのみで検証する",
    );

    const testId = uniqueTestId("e2e-filter-overlap");
    const performerIds = Array.from({ length: 10 }, (_, i) => `${testId}-performer-${i}`);
    const tagIds = Array.from({ length: 10 }, (_, i) => `${testId}-tag-${i}`);

    await createPerformersRaw(
      performerIds.map((id, i) => ({
        id,
        name: `【E2Eテスト】絞込出演者${i} ${testId}`,
        isMain: false,
        order: 1000 + i,
      })),
    );
    await createTagsRaw(
      tagIds.map((id, i) => ({ id, name: `【E2Eテスト】絞込タグ${i} ${testId}`, order: 1000 + i })),
    );

    try {
      await page.route("**/tiles.openfreemap.org/**", async (route) => {
        await route.abort();
      });
      const response = await page.goto("/");
      expect(response?.ok()).toBe(true);

      // 絞り込み帯に今回作成した出演者・タグが選択肢として表示されていること
      // (=絞り込み帯が実際に高さを要求する状態になっていることの前提確認)
      const performerOptions = performerIds.map((id) =>
        page.locator(`[data-testid="performer-filter-option"][data-performer-id="${id}"]`),
      );
      const tagOptions = tagIds.map((id) =>
        page.locator(`[data-testid="tag-filter-option"][data-tag-id="${id}"]`),
      );
      for (const option of [...performerOptions, ...tagOptions]) {
        await expect(option).toBeVisible();
      }

      // published店舗のピンをクリックして詳細シートを開く(seedの読み取り専用データ)
      const pin = page.locator('[data-testid="map-pin"][data-shop-id="shop-test-published-01"]');
      await expect(pin).toHaveCount(1);
      await clickMapPinWithZoom(page, pin);
      await expect(page.getByTestId("detail-sheet-shop-name")).toBeVisible();

      // シート内リンク(常に表示される「Googleマップで開く」)が絞り込み帯に奪われず
      // 通常クリックで新しいタブを開けること
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        page.getByTestId("detail-sheet-google-maps-link").click(),
      ]);
      expect(popup.url()).toContain("https://www.google.com/maps/search/");
      await popup.close();

      // 閉じるボタン(P-029の再現箇所そのもの)が絞り込み帯に奪われず通常クリックで閉じられること
      await page.getByTestId("detail-sheet-close").click();
      await expect(page.getByTestId("detail-sheet-shop-name")).toHaveCount(0);

      // 出演者フィルタのチェックボックス(今回作成した10件のうち1件)が通常クリックで操作できること
      const performerCheckbox = performerOptions[0].locator("input[type=checkbox]");
      await performerCheckbox.check();
      await expect(performerOptions[0]).toHaveAttribute("data-selected", "true");
      await performerCheckbox.uncheck();
      await expect(performerOptions[0]).toHaveAttribute("data-selected", "false");

      // タグフィルタのチェックボックス(今回作成した10件のうち1件)が通常クリックで操作できること
      const tagCheckbox = tagOptions[0].locator("input[type=checkbox]");
      await tagCheckbox.check();
      await expect(tagOptions[0]).toHaveAttribute("data-selected", "true");
      await tagCheckbox.uncheck();
      await expect(tagOptions[0]).toHaveAttribute("data-selected", "false");
    } finally {
      await deletePerformersRaw(performerIds);
      await deleteTagsRaw(tagIds);
    }
  });
});
