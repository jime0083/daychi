"use client";

/**
 * 店舗登録CRUD画面(/admin/shops、タスク2-4。バリデーション/削除確認/
 * 成功フィードバックはタスク2-7で強化。タスク2-4cで住所ジオコーディングによる
 * ピン配置に変更。problem.txt P-011対応)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops に準拠し、
 * 店名・住所・営業時間・情報基準日(infoAsOf)・閉店フラグ・緯度経度(location)・
 * タグ(tagIds、タスク5-2)のCRUDを行う。
 * status(draft/published)は作成時に "draft" 固定とする。draft⇔published切替は
 * タスク2-6でPublishStatusToggle(共通コンポーネント)により一覧から行う。
 *
 * 地図ピン位置指定(タスク2-4c):
 * - 住所を入力して「住所からピンを立てる」ボタン(/api/admin/geocode。
 *   src/lib/admin-geocode-client.ts経由)を押すとジオコーディングで座標を取得し、
 *   地図にピンを配置する。ずれていれば地図クリック/ピンドラッグ(ShopLocationPicker)
 *   で微調整する。
 * - **緯度経度の数値入力欄はUIに表示しない**(requirements.md「3.2 管理画面」
 *   2026-09-22変更)。ただし内部state(ShopFormState.lat/lng)とFirestoreへの
 *   保存・復元は従来通り緯度経度のまま行う。
 * - MapLibreはSSR非対応のため、ShopLocationPickerはnext/dynamicで
 *   `{ ssr: false }` 指定して読み込み、クライアントサイドでのみマウントする。
 * - E2Eでは/api/admin/geocodeをモックし(e2e/support/geocode-mock.ts)、
 *   実際のNominatimへのネットワークアクセスに依存せず決定的に座標を検証する
 *   (e2e/shops-crud.spec.ts参照)。
 *
 * バリデーション: 店名・住所・情報基準日・緯度経度(数値)をそれぞれ検証し、
 * 不足項目をまとめてエラーメッセージ表示する。削除は確認ダイアログを挟む。
 * 作成・更新・公開切替の成功時は一時的な成功メッセージを表示する。
 *
 * タグ付与(タスク5-2): タグマスタ(tags)全件を読み込み、TagCheckboxList
 * (src/components/admin/TagCheckboxList.tsx、レビュー画面のReviewShopCardと共通)を
 * 作成・編集フォームにそれぞれ表示する。作成時はcreateForm.tagIds、編集時は
 * editForm.tagIdsをそのまま保存する(バリデーション対象外。空配列も許容)。
 */
import { Timestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PublishStatusToggle } from "@/components/admin/PublishStatusToggle";
import { SuccessMessage } from "@/components/admin/SuccessMessage";
import { TagCheckboxList } from "@/components/admin/TagCheckboxList";
import { geocodeAddress } from "@/lib/admin-geocode-client";
import { useAdminAuth } from "@/lib/admin-auth";
import { createShop, deleteShop, listShops, updateShop } from "@/repositories/shops";
import { listTags } from "@/repositories/tags";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
import type { GeoLocation, PublishStatus } from "@/types/common";
import { DEFAULT_MAP_CENTER } from "@/lib/map-config";
import { useTransientMessage } from "@/lib/use-transient-message";
import type { ValidationResult } from "@/lib/validation";

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
  tagIds: string[];
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
  tagIds: [],
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
 * 店名・住所が空、情報基準日が未入力/不正、緯度経度が数値として不正な場合は
 * それぞれ具体的なエラーメッセージを返す。
 */
function validateShopForm(form: ShopFormState): ValidationResult<ParsedShopForm> {
  const errors: string[] = [];

  const name = form.name.trim();
  if (name === "") {
    errors.push("店名を入力してください");
  }
  const address = form.address.trim();
  if (address === "") {
    errors.push("住所を入力してください");
  }
  const infoAsOf = parseDateInputValue(form.infoAsOf);
  if (infoAsOf === null) {
    errors.push("情報基準日を入力してください");
  }
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.push("住所からピンを立てるか、地図をクリック/ドラッグして座標を設定してください");
  }

  if (errors.length > 0 || infoAsOf === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      name,
      address,
      businessHours: form.businessHours.trim(),
      infoAsOf,
      location: { lat, lng },
      closed: form.closed,
    },
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

/**
 * 現在設定中の座標を読み取り専用テキストとして表示するための整形(タスク2-4c)。
 * 緯度経度の数値入力欄を撤去した代わりに、ジオコード結果・地図操作の結果を
 * 目視確認できるようにする(一覧のshop-locationセルと同じtoFixed(6)桁数)。
 */
function formatLocationForDisplay(location: GeoLocation): string {
  return `現在の座標: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
}

export default function AdminShopsPage() {
  const authStatus = useAdminAuth();

  const [shops, setShops] = useState<Shop[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [tags, setTags] = useState<Tag[]>([]);

  const [createForm, setCreateForm] = useState<ShopFormState>(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState<string[]>([]);
  const [createGeocoding, setCreateGeocoding] = useState(false);
  const [createGeocodeError, setCreateGeocodeError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ShopFormState>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [editGeocoding, setEditGeocoding] = useState(false);
  const [editGeocodeError, setEditGeocodeError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);

  const { message: successMessage, show: showSuccess } = useTransientMessage();

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

  // タグマスタ一覧の読み込み(タスク5-2)。頻繁に変わるデータではないため、
  // 店舗一覧のreloadとは独立してマウント時に一度だけ取得する
  useEffect(() => {
    listTags()
      .then((list) => {
        if (mountedRef.current) {
          setTags(list);
        }
      })
      .catch(() => {
        // タグ一覧の取得失敗はタグ選択UIが「タグが未登録です」表示になるだけで、
        // 店舗フォーム自体の他項目の利用を妨げないため、専用のエラー表示は設けない
      });
  }, []);

  /**
   * 「住所からピンを立てる」ボタン(作成フォーム側)。/api/admin/geocode を呼び、
   * 成功したらcreateForm.lat/lngを更新する(地図のマーカー位置・中心も
   * ShopLocationPickerのlocation propsを通じて追随する)。
   */
  async function handleCreateGeocode(): Promise<void> {
    const address = createForm.address.trim();
    if (address === "") {
      setCreateGeocodeError("住所を入力してください");
      return;
    }
    if (authStatus.state !== "signed-in") {
      setCreateGeocodeError("認証状態を確認できませんでした。画面を再読み込みしてください");
      return;
    }
    setCreateGeocodeError(null);
    setCreateGeocoding(true);
    try {
      const idToken = await authStatus.user.getIdToken();
      const location = await geocodeAddress(address, idToken);
      setCreateForm((current) => ({
        ...current,
        lat: String(location.lat),
        lng: String(location.lng),
      }));
    } catch (error) {
      setCreateGeocodeError(errorMessage(error));
    } finally {
      if (mountedRef.current) {
        setCreateGeocoding(false);
      }
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const result = validateShopForm(createForm);
    if (!result.ok) {
      setCreateErrors(result.errors);
      return;
    }
    setCreateErrors([]);
    try {
      await createShop({ ...result.data, tagIds: createForm.tagIds, status: "draft" });
      setCreateForm(EMPTY_FORM);
      setCreateGeocodeError(null);
      showSuccess("店舗を作成しました");
      await reload();
    } catch (error) {
      setCreateErrors([`作成に失敗しました: ${errorMessage(error)}`]);
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
      tagIds: shop.tagIds ?? [],
    });
    setEditErrors([]);
    setEditGeocodeError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditErrors([]);
    setEditGeocodeError(null);
  }

  /**
   * 「住所からピンを立てる」ボタン(編集フォーム側)。handleCreateGeocodeと同じ設計。
   */
  async function handleEditGeocode(): Promise<void> {
    const address = editForm.address.trim();
    if (address === "") {
      setEditGeocodeError("住所を入力してください");
      return;
    }
    if (authStatus.state !== "signed-in") {
      setEditGeocodeError("認証状態を確認できませんでした。画面を再読み込みしてください");
      return;
    }
    setEditGeocodeError(null);
    setEditGeocoding(true);
    try {
      const idToken = await authStatus.user.getIdToken();
      const location = await geocodeAddress(address, idToken);
      setEditForm((current) => ({
        ...current,
        lat: String(location.lat),
        lng: String(location.lng),
      }));
    } catch (error) {
      setEditGeocodeError(errorMessage(error));
    } finally {
      if (mountedRef.current) {
        setEditGeocoding(false);
      }
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const result = validateShopForm(editForm);
    if (!result.ok) {
      setEditErrors(result.errors);
      return;
    }
    try {
      await updateShop(id, { ...result.data, tagIds: editForm.tagIds });
      setEditingId(null);
      setEditErrors([]);
      setEditGeocodeError(null);
      showSuccess("店舗を更新しました");
      await reload();
    } catch (error) {
      setEditErrors([`更新に失敗しました: ${errorMessage(error)}`]);
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

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }
    const target = deleteTarget;
    setDeleteTarget(null);
    await handleDelete(target.id);
  }

  async function handleToggleStatus(id: string, nextStatus: PublishStatus): Promise<void> {
    try {
      await updateShop(id, { status: nextStatus });
      showSuccess(nextStatus === "published" ? "店舗を公開しました" : "店舗を下書きに戻しました");
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
          店名・住所・営業時間・情報基準日・座標を管理します。座標は「住所からピンを立てる」
          ボタンでジオコーディングするか、地図のクリック/ピンドラッグで設定できます。
        </p>
      </div>

      <SuccessMessage testId="shop-success" message={successMessage} />

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

        <TagCheckboxList
          idPrefix="shop-create"
          allTags={tags}
          selectedTagIds={createForm.tagIds}
          onChange={(nextTagIds) => setCreateForm({ ...createForm, tagIds: nextTagIds })}
        />

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            data-testid="shop-create-geocode"
            disabled={createGeocoding}
            onClick={() => {
              void handleCreateGeocode();
            }}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {createGeocoding ? "座標を取得中..." : "住所からピンを立てる"}
          </button>
          <p
            data-testid="shop-create-location-preview"
            className="text-sm text-zinc-500 dark:text-zinc-400"
          >
            {formatLocationForDisplay(formLocation(createForm))}
          </p>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            作成
          </button>
        </div>
        {createGeocodeError !== null && (
          <p
            data-testid="shop-create-geocode-error"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {createGeocodeError}
          </p>
        )}

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

        {createErrors.length > 0 && (
          <ul
            data-testid="shop-create-error"
            className="flex flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
          >
            {createErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
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
                <th className="py-2 pr-4 font-medium">タグ</th>
                <th className="py-2 pr-4 font-medium">ステータス</th>
                <th className="py-2 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const isEditing = editingId === shop.id;
                const tagNames = (shop.tagIds ?? [])
                  .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
                  .filter((name): name is string => name !== undefined);
                return (
                  <tr
                    key={shop.id}
                    data-testid="shop-row"
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    {isEditing ? (
                      <td colSpan={9} className="py-2 pr-4">
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

                          <TagCheckboxList
                            idPrefix="shop-edit"
                            allTags={tags}
                            selectedTagIds={editForm.tagIds}
                            onChange={(nextTagIds) =>
                              setEditForm({ ...editForm, tagIds: nextTagIds })
                            }
                          />

                          <div className="flex flex-wrap items-end gap-3">
                            <button
                              type="button"
                              data-testid="shop-edit-geocode"
                              disabled={editGeocoding}
                              onClick={() => {
                                void handleEditGeocode();
                              }}
                              className="rounded border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              {editGeocoding ? "座標を取得中..." : "住所からピンを立てる"}
                            </button>
                            <p
                              data-testid="shop-edit-location-preview"
                              className="text-zinc-500 dark:text-zinc-400"
                            >
                              {formatLocationForDisplay(formLocation(editForm))}
                            </p>
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
                          {editGeocodeError !== null && (
                            <p
                              data-testid="shop-edit-geocode-error"
                              className="text-red-600 dark:text-red-400"
                            >
                              {editGeocodeError}
                            </p>
                          )}

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

                          {editErrors.length > 0 && (
                            <ul
                              data-testid="shop-edit-error"
                              className="flex flex-col gap-0.5 text-red-600 dark:text-red-400"
                            >
                              {editErrors.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
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
                          data-testid="shop-tags"
                          className="py-2 pr-4 text-zinc-700 dark:text-zinc-300"
                        >
                          {tagNames.length > 0 ? tagNames.join("、") : ""}
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
                              onClick={() => setDeleteTarget(shop)}
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
                  <td colSpan={9} className="py-4 text-center text-zinc-500 dark:text-zinc-400">
                    店舗が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget !== null && (
        <ConfirmDialog
          testId="shop-delete-confirm"
          title="店舗を削除しますか?"
          message={`「${deleteTarget.name}」を削除します。この操作は取り消せません。`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      )}
    </div>
  );
}
