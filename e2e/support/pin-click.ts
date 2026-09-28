import type { Locator, Page } from "@playwright/test";

/**
 * 地図ピン(maplibregl.Marker)をクリックするヘルパー(タスク6-1b・problem.txt P-023)。
 *
 * requirements.md「3.1 公開ページ」の2026-09-26決定「地図を引いた表示で近くの店舗のピンが重なる
 * 場合は、一般的な地図と同じくそのまま重ねて表示する(手前のピンが押される。利用者が拡大すれば
 * 分かれる。まとめ表示(クラスタリング)は行わない)」の通り、アプリ側はピンの重なりを解消しない
 * (PublicMap.tsxのクリック判定は変更しない)。
 *
 * そのためE2Eは、ピンが重なって狙った店舗のピンが最前面にない状態を「実際の利用者と同じ操作
 * (地図の拡大)で解消してからクリックする」ことで、店舗の座標配置(重なり)に依存せず決定的に
 * 検証できるようにする。
 *
 * 具体的には、対象ピンに対して`locator.click({ trial: true })`(実際にクリックはせず、
 * Playwrightの操作可能性チェック=表示・安定・最前面であることの確認のみ行う標準機能)を試み、
 * 成功すれば通常のclick()を実行する。失敗した場合(=他のピンに隠れている、またはアニメーション中)は、
 * 対象ピンの位置にマウスを置いてホイールスクロールする(実際のユーザーがマウス/トラックパッドで
 * 地図を拡大するのと同じ操作)ことでその地点を中心に地図を拡大し、再試行する。
 * force:trueや固定時間の待機(page.waitForTimeout等)は使わない。
 */
export async function clickMapPinWithZoom(page: Page, pin: Locator): Promise<void> {
  const maxAttempts = 30;
  const perAttemptTimeout = 600;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await pin.click({ trial: true, timeout: perAttemptTimeout });
      await pin.click();
      return;
    } catch {
      // 他のピンに隠れている(または地図の移動/ズームアニメーション中で不安定)。
      // 実際の利用者と同じく、そのピンの位置でホイールスクロールして地図を拡大する
      const box = await pin.boundingBox();
      if (box === null) {
        throw new Error("clickMapPinWithZoom: ピンのboundingBoxが取得できません(表示されていない可能性)");
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -500);
    }
  }

  throw new Error("clickMapPinWithZoom: 地図を拡大してもピンをクリックできませんでした");
}
