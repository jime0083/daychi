# Daychi COFFEE MAP 要件定義書

作成日: 2026-09-19
ステータス: 確定(壁打ち完了)

---

## 1. サービス概要

YouTubeチャンネル「Daychi〜COFFEE CHANNEL」で紹介されたコーヒー店と、そこで各出演者が飲食したものを地図上で確認できるWebサービス。

- サービス名: **Daychi COFFEE MAP**
- 当面は開発者個人用として運用し、将来的にチャンネルのファン向けに公開することを想定
- 閲覧は最初から一般公開(認証不要)。データの登録・編集は管理者(開発者本人)のみ

## 2. ユーザー種別

| 種別 | 認証 | できること |
|------|------|-----------|
| 一般閲覧者 | 不要 | 地図閲覧、店舗詳細閲覧、動画一覧からの検索、絞り込み |
| 管理者 | Googleログイン(許可メールアドレスのみ) | 全データのCRUD、公開承認、AI抽出結果のレビュー |

## 3. 画面仕様

### 3.1 公開ページ(トップ = 地図画面)

**PC表示:**
- 画面メインに地図(MapLibre GL JS + OpenFreeMapタイル)。紹介店舗(status: published)にピンを表示
- 左サイドバーに動画一覧(サムネイル + タイトル)。動画をクリックすると、その動画で紹介された店舗を地図上でフォーカス・ハイライトする
- ピンをクリックすると画面下から詳細シートがスライドアップする

**モバイル表示:**
- 画面下部のタブで「地図」と「動画一覧」を切り替える方式
- 詳細シートはモバイルでも下からスライドアップ

**詳細シート(スライドアップ)の表示項目:**
1. 店名
2. 動画サムネイル(その店を紹介した回。クリックでYouTube動画リンクを開く)
3. 出演者ごとの飲食メニュー
4. 動画公開日
5. 住所
6. 営業時間
- 住所・営業時間の下部には小さく「※YYYY年M月D日現在」と情報基準日(shops.infoAsOf)を表示し、情報が変更されている可能性に対応する
- 1店舗が複数動画で紹介されている場合は、訪問(visit)ごとにサムネ+飲食メニューを並べて表示

**絞り込み機能:**
- 出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。選択した出演者が出演した訪問がある店舗のみ表示(Phase 3で実装)
- コーヒータイプタグフィルタ: 店舗に付与されたタグ(浅煎り・深煎り・エスプレッソ等)で絞り込み。**タグ内容は未定のため、他の全機能完成後のPhase 5で実装する**

**サムネイル取得:** YouTube動画IDから `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` を利用(APIキー不要)

### 3.2 管理画面(/admin)

- Firebase Auth(Googleログイン)。環境変数で指定した管理者メールアドレスのみアクセス可。それ以外はログイン後もアクセス拒否
- 機能:
  - 出演者マスタCRUD(名前、メイン出演者フラグ、表示順)
  - 動画登録: YouTube URLを貼り付け → 動画IDを抽出 → oEmbed APIでタイトル自動取得 → 公開日は手入力。一覧・編集・削除
  - 店舗登録: 店名・住所・営業時間・情報基準日・閉店フラグを入力し、地図上でピンをドラッグして緯度経度を確定。一覧・編集・削除
  - 訪問登録: 店舗×動画を紐付け、出演者ごとの飲食メニュー(複数品目可)を入力
  - 公開ステータス管理: shops / videos / visits の draft ⇔ published 切替
  - (Phase 4) AI抽出の実行ボタンと、抽出結果(draft)のレビュー・修正・承認UI
  - (Phase 5) タグマスタCRUD、店舗へのタグ付与UI

## 4. データモデル(Firestore)

```
performers/{id}
  name: string          // 出演者名
  isMain: boolean       // メイン出演者フラグ(フィルタ対象外にする)
  order: number         // 表示順

videos/{videoId}        // ドキュメントID = YouTube動画ID
  title: string
  publishedAt: Timestamp // 動画公開日
  status: "draft" | "published"
  createdAt / updatedAt: Timestamp

shops/{id}
  name: string
  address: string
  businessHours: string  // 営業時間(自由記述)
  infoAsOf: Timestamp    // 住所・営業時間の情報基準日(「※YYYY年M月D日現在」表示に使用)
  location: { lat: number, lng: number }
  closed: boolean        // 閉店フラグ(データとして保持。表示UIは将来拡張)
  tagIds: string[]       // Phase 5で使用
  status: "draft" | "published"
  createdAt / updatedAt: Timestamp

visits/{id}             // 店舗×動画の中間コレクション
  shopId: string
  videoId: string
  consumptions: [ { performerId: string, items: string[] } ]  // 出演者ごとの飲食メニュー
  status: "draft" | "published"
  createdAt / updatedAt: Timestamp

tags/{id}               // Phase 5
  name: string          // 例: 浅煎り、深煎り、エスプレッソ(内容は未定・管理画面で登録)
  order: number
```

**セキュリティルール方針:**
- read: status == "published" のドキュメントのみ誰でも可(tags/performersは全read可)
- write: 管理者のみ(Firebase Authのメールアドレス判定はカスタムクレームまたはルール内メール判定)

## 5. AI自動抽出パイプライン(Phase 4)

```
YouTube Data API でチャンネルの動画一覧を取得 → 未登録動画を検出
  → 概要欄・字幕テキストを取得
  → Claude API で「店名 / 住所候補 / 出演者ごとの飲食メニュー」をJSON抽出
  → ジオコーディング(Nominatim)で緯度経度の候補を取得
  → videos / shops / visits に status: "draft" で保存
  → 管理画面のレビューUIで管理者が確認・修正(ピン位置はドラッグで確定)
  → 承認操作で status: "published" に変更され公開される
```

- 実行トリガーは管理画面の「取り込み実行」ボタン(手動)。定期実行は将来拡張
- draftのままでは公開ページに一切表示されない

## 6. 技術スタック

| 項目 | 採用技術 |
|------|---------|
| 言語 / FW | TypeScript / Next.js (App Router) |
| ホスティング | Firebase App Hosting(Blazeプラン、GitHub連携デプロイ) |
| DB | Cloud Firestore |
| 認証 | Firebase Authentication(Google) |
| 地図 | MapLibre GL JS + OpenFreeMap(無料・APIキー不要) |
| E2Eテスト | Playwright + Firebase Emulator Suite |
| 外部API | YouTube oEmbed(キー不要) / YouTube Data API v3 / Claude API / Nominatim |

## 7. 非機能要件

- 運用コスト: 無料枠内に収まる構成を維持する(地図タイル・DB・ホスティング)
- モバイル対応必須(タブ切替UI)
- ローカル開発・E2EテストはFirebase Emulator Suite(firestore / auth)で行い、本番データを汚さない
- E2Eテストはシードデータをemulatorに投入して決定的に実行する

## 8. 開発プロセス(ハーネス)

- 各タスクは **daychi-impl**(実装サブエージェント)が実装し、**daychi-review**(レビューサブエージェント)が実際にブラウザを起動してE2Eテストを実行・検証する
- **daychi-reviewのE2E合格をもってタスク完了とする**(詳細は CLAUDE.md)
- タスク一覧は progress.txt、手動作業は manual-work.txt で管理する

## 9. フェーズ計画

| Phase | 内容 |
|-------|------|
| Phase 1 | 開発基盤(Next.js初期化、Firebase/Emulator、型定義、セキュリティルール、Playwright基盤) |
| Phase 2 | 管理画面(認証、各マスタCRUD、公開ステータス管理、初回デプロイ) |
| Phase 3 | 公開ページ(地図、詳細シート、サイドバー動画一覧、出演者フィルタ、モバイルUI) |
| Phase 4 | AI自動抽出(YouTube Data API + Claude API + レビュー承認フロー) |
| Phase 5 | タグ機能(タグマスタ、店舗へのタグ付与、公開ページのタグ絞り込み) |

※タグ絞り込み(Phase 5)は「全機能完成後に追加」の方針のため最終フェーズとする
