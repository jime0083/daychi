/**
 * MapLibre GL JSのタイル解析用Webワーカーの起動設定(problem.txt P-013対応)。
 *
 * 背景(P-013根本原因の調査結果): MapLibre GL JS(node_modules/maplibre-gl/dist/*.mjs)は、
 * ベクタタイル(.pbf)の解析を専用Webワーカーで行う。ワーカーのスクリプトURLは
 * ライブラリ内部の defaultWorkerUrl() が `import.meta.url` から自動算出するが、
 * Next.js(Turbopack)でクライアントバンドルに取り込まれた状態ではその
 * `import.meta.url` が http(s) URLにならず、ライブラリ側は空文字列にフォールバックする。
 * 結果として `new Worker("", { type: "module" })` が即座にエラーとなり、
 * ベクタタイルソース(openmaptiles)の解析が永久に進まず、地図が真っ白(ピンのみ表示)になる。
 * (ラスタタイルは画像デコードのみでワーカー不要のため、この問題の影響を受けない)
 *
 * 対策(2段階の問題があった):
 * 1. このモジュール自身の `import.meta.url` を基点に
 *    `new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)` と書けば、
 *    Turbopackの「静的解析可能なURLアセット参照」としてワーカー本体は配信できる。
 * 2. しかしワーカー本体は `import ... from "./maplibre-gl-shared.mjs"` という
 *    相対importを持ち、Turbopackはその追随先までは静的アセットとして配信しないため、
 *    ワーカー内部でモジュール解決が404になり、結局タイルが解析されないままだった
 *    (実機調査で、ワーカーの"error"イベント発火とネットワーク上に実タイル(.pbf)
 *    リクエストが一切発生しないことの両方から特定)。
 * そのため、ワーカー本体とその相対import先を「同じ親パス配下の兄弟ファイル」として
 * 自前で配信するRoute Handler(src/app/api/maplibre-worker/[file]/route.ts)を用意し、
 * そちらのURLを明示指定する。これによりワーカー内の相対import
 * `./maplibre-gl-shared.mjs` が `/api/maplibre-worker/maplibre-gl-shared.mjs` に
 * 正しく解決される。
 *
 * このモジュールの呼び出し側(ShopLocationPicker.tsx / PublicMap.tsx)は、MapLibreの
 * Map を生成する前に一度だけこの関数を呼び出す。setWorkerUrl自体は同じ値を複数回
 * 設定しても副作用が無いため、複数コンポーネントから呼ばれても安全(guardは
 * 呼び出しコスト削減のためだけの最適化)。
 */
import * as maplibregl from "maplibre-gl";

let configured = false;

export function configureMapLibreWorker(): void {
  if (configured) {
    return;
  }
  configured = true;
  // インストール済みmaplibre-glのバージョンをキャッシュバスティング用のクエリに
  // 付与する(バージョン更新時に古いキャッシュ内容を誤って使い続けないため)。
  const version = maplibregl.getVersion();
  const workerUrl = `/api/maplibre-worker/maplibre-gl-worker.mjs?v=${encodeURIComponent(version)}`;
  maplibregl.setWorkerUrl(workerUrl);
}
