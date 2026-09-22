/**
 * MapLibre GL JSのタイル解析用Webワーカーのスクリプトを配信するRoute Handler
 * (problem.txt P-013 / タスク3-1a対応)。
 *
 * 背景: maplibre-gl(node_modules/maplibre-gl/dist)配下のワーカースクリプトは
 * ES Moduleとして `import ... from "./maplibre-gl-shared.mjs"` のような
 * 相対importを持つ。Next.js(Turbopack)の `new URL("...", import.meta.url)`
 * アセット参照はワーカースクリプト本体は静的アセットとして配信できるが、
 * その相対import先(maplibre-gl-shared.mjs)までは追随して配信されないため、
 * ブラウザ側でワーカーのモジュール解決が404で失敗し、ベクタタイルが
 * 永久に解析されない(=地図が真っ白になる)ことを実機調査で特定した。
 *
 * 対策: このRoute Handlerで、ワーカー本体(maplibre-gl-worker.mjs)と、
 * その相対import先(maplibre-gl-shared.mjs)の両方を「同じディレクトリ配下の
 * 兄弟ファイル」として配信する(このルート自身が `/api/maplibre-worker/<file>`
 * という共通の親パスを持つため、ワーカー内の相対import
 * `./maplibre-gl-shared.mjs` は `/api/maplibre-worker/maplibre-gl-shared.mjs`
 * に正しく解決される)。配信対象はビルド時に固定コピーするのではなく、
 * インストール済みnode_modulesから都度読み取ることで、maplibre-glの
 * バージョン更新に自動追随する(コピー漏れによる乖離を防ぐ)。
 *
 * 配信対象は開発/本番どちらのNext.jsビルドでも同一の本番相当ファイル
 * (dev用の`-dev.mjs`ではなく通常版)に固定する。ワーカー↔メインスレッド間の
 * メッセージプロトコルはdev/prodで差異が無く(dev版は追加の実行時アサーション/
 * 警告のみが異なる)、常に本番相当ファイルを使えば良いため
 * (src/lib/maplibre-worker.tsのコメントも参照)。
 *
 * セキュリティ: pathパラメータは固定の許可リスト(下記ALLOWED_FILES)に
 * 完全一致する場合のみ許可する(任意のnode_modules配下ファイルを配信する
 * ディレクトリトラバーサルを防ぐため)。認証は不要(npm公開パッケージの
 * 静的アセットであり機微情報を含まないため。/api/admin/*とは異なる)。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

/** 配信を許可するファイル名の一覧(node_modules/maplibre-gl/dist配下、拡張子.mjs) */
const ALLOWED_FILES = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);

const MAPLIBRE_DIST_DIR = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params;

  if (!ALLOWED_FILES.has(file)) {
    return NextResponse.json({ error: "対象のファイルが見つかりません" }, { status: 404 });
  }

  let content: string;
  try {
    content = await readFile(path.join(MAPLIBRE_DIST_DIR, file), "utf-8");
  } catch {
    return NextResponse.json(
      { error: "ワーカースクリプトの読み込みに失敗しました" },
      { status: 500 },
    );
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // インストール済みnode_modulesの内容をそのまま返すだけであり、
      // バージョン更新時はクエリパラメータ(呼び出し側でmaplibregl.getVersion()を
      // 付与する。src/lib/maplibre-worker.ts参照)でキャッシュを分離するため、
      // 長期キャッシュ(immutable)にしてよい
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
