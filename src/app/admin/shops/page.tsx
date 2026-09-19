"use client";

/**
 * 店舗登録CRUD画面(/admin/shops、タスク2-4)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops に準拠し、
 * 店名・住所・営業時間・情報基準日(infoAsOf)・閉店フラグ・緯度経度(location)の
 * CRUDを行う。tagIds(Phase 5用)は本タスクの範囲外のため常に空配列で保存する。
 * status(draft/published)は作成時に "draft" 固定とする。draft⇔published切替は
 * タスク2-6でPublishStatusToggle(共通コンポーネント)により一覧から行う。
 *
 * 地図ピン位置指定:
 * - MapLibre GL JS + OpenFreeMap(src/lib/map-config.ts)を使い、地図クリック/
 *   ピンドラッグで緯度経度(location)を確定できるUI(ShopLocationPicker)を設ける。
 * - MapLibreはSSR非対応のため、ShopLocationPickerはnext/dynamicで
 *   `{ ssr: false }` 指定して読み込み、クライアントサイドでのみマウントする。
 * - 緯度経度は地図操作だけでなく数値入力欄でも設定できるようにし、
 *   地図(外部タイル依存で不安定になりやすい)とは独立に座標を決定できる
 *   堅牢な設計とする。E2Eでは数値入力欄側で座標を検証する
 *   (e2e/shops-crud.spec.ts参照)。
 *
 * 入力バリデーションは最小限(必須項目のみ)とし、削除も確認ダイアログなしの
 * 即時実行とする(作り込みはタスク2-7の範囲。/admin/videos の実装パターンに倣う)。
 */
import { Timestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { PublishStatusToggle } from "@/components/admin/PublishStatusToggle";
import { createShop, deleteShop, listShops, updateShop } from "@/repositories/shops";
import type { Shop } from "@/types/shop";
import type { GeoLocation, PublishStatus } from "@/types/common";
import { DEFAULT_MAP_CENTER } from "@/lib/map-config";

// MapLibreはwindow/documentに依存するため、SSRでは描画せずクライアントでのみマウントする
const ShopLocationPicker = dynamic(
  () => import("@/components/admin/ShopLocationPicker").then((mod) => mod.ShopLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="shop-location-map-loading"
        className="flex h-64 w-full items-center justify-center rounded border border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      >
        地図を読み込み中...
      </div>
    ),
  },
);

/** 店舗フォームの入力値(number/date入力もいったん文字列で保持し、送信時にパースする) */
interface ShopFormState {
  name: string;
  address: string;
  businessHours: string;
  infoAsOf: string; // <input type="date"> の値(YYYY-MM-DD)
  closed: boolean;
  lat: string;
  lng: string;
}

/** フォーム入力値のうちバリデーション・変換を通過した後の値(status/tagIdsは含まない) */
interface ParsedShopForm {
  name: string;
  address: string;
  businessHours: string;
  infoAsOf: Timestamp;
  location: GeoLocation;
  closed: boolean;
}

const EMPTY_FORM: ShopFormState = {
  name: "",
  address: "",
  businessHours: "",
  infoAsOf: "",
  closed: false,
  lat: String(DEFAULT_MAP_CENTER.lat),
  lng: String(DEFAULT_MAP_CENTER.lng),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Timestamp を <input type="date"> 用の YYYY-MM-DD 文字列に変換する */
function timestampToDateInputValue(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 日付文字列(YYYY-MM-DD)をFirestoreのTimestampに変換する。不正な形式ならnull */
function parseDateInputValue(value: string): Timestamp | null {
  if (value.trim() === "") {
    return null;
  }
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

/** 一覧表示用に日付を YYYY/M/D 形式へ整形する */
function formatDateForDisplay(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * フォーム入力値を検証し、Firestoreへ書き込む形に変換する。
 * 店名・住所が空、情報基準日が未入力/不正、緯度経度が数値として不正な場合は null
 */
function parseFormState(form: ShopFormState): ParsedShopForm | null {
  const name = form.name.trim();
  const address = form.address.trim();
  if (name === "" || address === "") {
    return null;
  }
  const infoAsOf = parseDateInputValue(form.infoAsOf);
  if (infoAsOf === null) {
    return null;
  }
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    name,
    address,
    businessHours: form.businessHours.trim(),
    infoAsOf,
    location: { lat, lng },
    closed: form.closed,
  };
}

/** フォーム状態から地図表示用のGeoLocationを取り出す(数値変換できない間はデフォルト中心を使う) */
function formLocation(form: ShopFormState): GeoLocation {
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_MAP_CENTER.lat,
    lng: Number.isFinite(lng) ? lng : DEFAULT_MAP_CENTER.lng,
  };
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<ShopFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ShopFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  // アンマウント後の setState を防ぐガード(/admin/performers, /admin/videos と同じパターン)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listShops();
      if (mountedRef.current) {
        setShops([...list].sort((a, b) => a.name.localeCompare(b.name, "ja")));
        setListError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setListError(`店舗一覧の取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, []);

  useEffect(() => {
    listShops()
      .then((list) => {
        if (mountedRef.current) {
          setShops([...list].sort((a, b) => a.name.localeCompare(b.name, "ja")));
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setListError(`店舗一覧の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseFormState(createForm);
    if (parsed === null) {
      setCreateError("店名・住所・情報基準日・緯度経度を正しく入力してください");
      return;
    }
    setCreateError(null);
    try {
      await createShop({ ...parsed, tagIds: [], status: "draft" });
      setCreateForm(EMPTY_FORM);
      await reload();
    } catch (error) {
      setCreateError(`作成に失敗しました: ${errorMessage(error)}`);
    }
  }

  function startEdit(shop: Shop): void {
    setEditingId(shop.id);
    setEditForm({
      name: shop.name,
      address: shop.address,
      businessHours: shop.businessHours,
      infoAsOf: timestampToDateInputValue(shop.infoAsOf),
      closed: shop.closed,
      lat: String(shop.location.lat),
      lng: String(shop.location.lng),
    });
    setEditError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const parsed = parseFormState(editForm);
    if (parsed === null) {
      setEditError("店名・住所・情報基準日・緯度経度を正しく入力してください");
      return;
    }
    try {
      await updateShop(id, parsed);
      setEditingId(null);
      setEditError(null);
      await reload();
    } catch (error) {
      setEditError(`更新に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteShop(id);
      if (editingId === id) {
        setEditingId(null);
      }
      await reload();
    } catch (error) {
      setListError(`削除に失敗しました: ${errorMessage(error)}`);
    }
  }

  async function handleToggleStatus(id: string, nextStatus: PublishStatus): Promise<void> {
    try {
      await updateShop(id, { status: nextStatus });
      await reload();
    } catch (error) {
      setListError(`ステータス変更に失敗しました: ${errorMessage(error)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">店舗マスタ</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          店名・住所・営業時間・情報基準日・座標を管理します。座標は地図のクリック/ピンドラッグ、
          または緯度経度の数値入力欄で設定できます。
        </p>
      </div>

      <form
        data-testid="shop-create-form"
        onSubmit={(event) => {
          void handleCreateSubmit(event);
        }}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            店名
            <input
              data-testid="shop-create-name"
              type="text"
              value={createForm.name}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            住所
            <input
              data-testid="shop-create-address"
              type="text"
              value={createForm.address}
              onChange={(event) => setCreateForm({ ...createForm, address: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            営業時間
            <input
              data-testid="shop-create-businesshours"
              type="text"
              placeholder="例: 8:00-18:00(月曜定休)"
              value={createForm.businessHours}
              onChange={(event) =>
                setCreateForm({ ...createForm, businessHours: event.target.value })
              }
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            情報基準日
            <input
              data-testid="shop-create-infoasof"
              type="date"
              value={createForm.infoAsOf}
              onChange={(event) => setCreateForm({ ...createForm, infoAsOf: event.target.value })}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input
              data-testid="shop-create-closed"
              type="checkbox"
              checked={createForm.closed}
              onChange={(event) => setCreateForm({ ...createForm, closed: event.target.checked })}
            />
            閉店
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            緯度
            <input
              data-testid="shop-create-lat"
              type="number"
              step="any"
              value={createForm.lat}
              onChange={(event) => setCreateForm({ ...createForm, lat: event.target.value })}
              className="w-36 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
            経度
            <input
              data-testid="shop-create-lng"
              type="number"
              step="any"
              value={createForm.lng}
              onChange={(event) => setCreateForm({ ...createForm, lng: event.target.value })}
              className="w-36 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            作成
          </button>
        </div>

        <ShopLocationPicker
          location={formLocation(createForm)}
          onChange={(location) =>
            setCreateForm((current) => ({
              ...current,
              lat: String(location.lat),
              lng: String(location.lng),
            }))
          }
        />

        {createError !== null && (
          <p data-testid="shop-create-error" className="text-sm text-red-600 dark:text-red-400">
            {createError}
          </p>
        )}
      </form>

      {listError !== null && (
        <p data-testid="shop-list-error" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      )}

      {shops === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">店名</th>
                <th className="py-2 pr-4 font-medium">住所</th>
                <th className="py-2 pr-4 font-medium">営業時間</th>
                <th className="py-2 pr-4 font-medium">情報基準日</th>
                <th className="py-2 pr-4 font-medium">閉店</th>
                <th className="py-2 pr-4 font-medium">座標</th>
                <th className="py-2 pr-4 font-medium">ステータス</th>
                <th className="py-2 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const isEditing = editingId === shop.id;
                return (
                  <tr
                    key={shop.id}
                    data-testid="shop-row"
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    {isEditing ? (
                      <td colSpan={8} className="py-2 pr-4">
                        <form
                          onSubmit={(event) => {
                            void handleEditSubmit(event, shop.id);
                          }}
                          className="flex flex-col gap-3"
                        >
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="flex min-w-64 flex-1 flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              店名
                              <input
                                data-testid="shop-edit-name"
                                type="text"
                                value={editForm.name}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, name: event.target.value })
                                }
                                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                            <label className="flex min-w-64 flex-1 flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              住所
                              <input
                                data-testid="shop-edit-address"
                                type="text"
                                value={editForm.address}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, address: event.target.value })
                                }
                                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-end gap-3">
                            <label className="flex min-w-64 flex-1 flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              営業時間
                              <input
                                data-testid="shop-edit-businesshours"
                                type="text"
                                value={editForm.businessHours}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, businessHours: event.target.value })
                                }
                                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              情報基準日
                              <input
                                data-testid="shop-edit-infoasof"
                                type="date"
                                value={editForm.infoAsOf}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, infoAsOf: event.target.value })
                                }
                                className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                              <input
                                data-testid="shop-edit-closed"
                                type="checkbox"
                                checked={editForm.closed}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, closed: event.target.checked })
                                }
                              />
                              閉店
                            </label>
                          </div>

                          <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              緯度
                              <input
                                data-testid="shop-edit-lat"
                                type="number"
                                step="any"
                                value={editForm.lat}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, lat: event.target.value })
                                }
                                className="w-36 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-200">
                              経度
                              <input
                                data-testid="shop-edit-lng"
                                type="number"
                                step="any"
                                value={editForm.lng}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, lng: event.target.value })
                                }
                                className="w-36 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            </label>
                            <button
                              type="submit"
                              className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              キャンセル
                            </button>
                          </div>

                          <ShopLocationPicker
                            location={formLocation(editForm)}
                            onChange={(location) =>
                              setEditForm((current) => ({
                                ...current,
                                lat: String(location.lat),
                                lng: String(location.lng),
                              }))
                            }
                          />

                          {editError !== null && (
                            <p
                              data-testid="shop-edit-error"
                              className="text-red-600 dark:text-red-400"
                            >
                              {editError}
                            </p>
                          )}
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{shop.name}</td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {shop.address}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {shop.businessHours}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {formatDateForDisplay(shop.infoAsOf)}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                          {shop.closed ? "○" : ""}
                        </td>
                        <td
                          data-testid="shop-location"
                          className="py-2 pr-4 text-zinc-700 dark:text-zinc-300"
                        >
                          {shop.location.lat.toFixed(6)}, {shop.location.lng.toFixed(6)}
                        </td>
                        <td
                          data-testid="shop-status"
                          className="py-2 pr-4 text-zinc-700 dark:text-zinc-300"
                        >
                          {shop.status === "published" ? "公開" : "下書き"}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <PublishStatusToggle
                              status={shop.status}
                              testId="shop-status-toggle"
                              onToggle={(nextStatus) => handleToggleStatus(shop.id, nextStatus)}
                            />
                            <button
                              type="button"
                              onClick={() => startEdit(shop)}
                              className="rounded border border-zinc-300 px-3 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDelete(shop.id);
                              }}
                              className="rounded border border-red-300 px-3 py-1 text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {shops.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    店舗が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
