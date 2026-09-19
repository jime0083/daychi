/**
 * 地図(MapLibre GL JS + OpenFreeMap)関連の定数(タスク2-4)。
 * requirements.md「6. 技術スタック」参照。
 *
 * スタイルURLやデフォルト表示位置を各画面に直接埋め込む(ハードコードを分散させる)と
 * 変更時の追従漏れが起きやすいため、このモジュールに集約する。将来Phase 3の
 * 公開ページ地図(3-1)でも同じ定数を再利用する想定。
 */
import type { GeoLocation } from "@/types/common";

/** OpenFreeMapが提供する無料・APIキー不要のスタイル(Liberty) */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * 新規店舗作成時、まだ座標を入力/確定していない状態での地図初期中心位置(東京駅)。
 * 特定の店舗データに依存しない汎用的なデフォルト値であり、ユーザーは
 * 地図クリック/ピンドラッグまたは緯度経度の数値入力欄で実際の座標に変更する。
 */
export const DEFAULT_MAP_CENTER: GeoLocation = { lat: 35.681236, lng: 139.767125 };

/** 店舗ピン指定用地図の初期ズームレベル */
export const DEFAULT_MAP_ZOOM = 14;

/**
 * 公開ページ地図(タスク3-1〜)で複数/単一のピンをfitBoundsする際の周囲余白(px)。
 * ピンが地図の端に接してしまい見切れることを防ぐための値であり、特定の店舗データには依存しない。
 */
export const MAP_FIT_BOUNDS_PADDING = 48;

/**
 * サイドバー動画クリックでフォーカスした店舗のピンをハイライト表示する際のCSS filter値
 * (タスク3-3)。既定ピン(maplibregl.Markerのデフォルト色)と視覚的に区別するための
 * UIスタイル定数であり、特定の店舗データには依存しない。
 *
 * maplibregl.Markerの色をピン生成後に変更するAPIは無い(生成時のcolorオプションでのみ
 * 指定可能)ため、CSS filterでピン要素(SVGを含むDOM要素全体)の色味を変える方式を採る。
 * これによりMapLibreが位置決めに使うtransformスタイルとは独立に、マーカーの
 * 再生成なしでハイライトのオン/オフを切り替えられる(src/components/map/PublicMap.tsx参照)。
 */
export const MAP_PIN_HIGHLIGHT_FILTER = "hue-rotate(150deg) saturate(1.8) brightness(0.95)";
