# Daychi COFFEE MAP プロジェクトルール

YouTubeチャンネル「Daychi〜COFFEE CHANNEL」で紹介されたコーヒー店を地図で確認できるWebサービス。
仕様の唯一の正は `requirements.md`。

## ⛔ 絶対ルール: 不明点ゼロで作業開始(最重要・厳守)

**仕様の不明点・矛盾・未決定事項が1つでもある状態で作業を開始してはならない。**

- 作業開始前に必ず不明点を洗い出し、ユーザーに質問して全て解消してから着手する
- 推測で仕様を補って実装することは禁止(「たぶんこうだろう」で進めない)
- 作業中に不明点が発覚した場合も、その場で作業を中断してユーザーに質問する
- このルールはメインエージェント・サブエージェント(daychi-impl / daychi-review)の全てに適用される

## ドキュメント管理

| ファイル | 役割 | 更新タイミング |
|----------|------|---------------|
| requirements.md | 要件定義書(仕様の唯一の正) | 仕様変更が確定した時のみ |
| progress.txt | 実装タスク(Phase区分) | タスク完了(=レビューPASS)ごとに即時 |
| manual-work.txt | 手動作業タスク(Work区分・最終ライン付き) | 手動作業の完了報告を受けたら即時 |

- 仕様変更はまず requirements.md を更新してから実装する(コードだけ変えて仕様書を放置しない)

## 開発ハーネス(必須フロー・省略禁止)

progress.txt の各タスクは必ず以下のフローで進める:

```
タスク開始
  ↓
manual-work.txt の最終ライン確認
  (このタスクの前提となる未完了Workがあればユーザーに通知して停止)
  ↓
daychi-impl サブエージェントで実装
  (タスクIDと完了条件を明示して依頼)
  ↓
daychi-review サブエージェントで検証
  (実際にブラウザを起動しPlaywright E2Eを実行)
  ↓
PASS → progress.txt を [x] に更新して次のタスクへ
FAIL → FAIL内容を添えて daychi-impl に差し戻し → 修正後に再度 daychi-review
```

- **daychi-review のPASSなしにタスクを完了扱いにすることは禁止**
- メインエージェントが直接実装・直接完了判定を行うことも禁止(必ずサブエージェントを経由)
- FAIL→修正のループが3回続いた場合は、原因分析をユーザーに報告して指示を仰ぐ

## 問題修正プロセス(必須フロー・省略禁止)

開発中に問題(想定した動きをしない、デザイン崩れ等)が見つかった場合、必ず以下のプロセスで修正する:

```
問題の共有を受ける(またはレビュー等で発見)
  ↓
problem.txt に記録(問題ID採番、問題内容・再現手順を具体的に)
  ↓
problem.txt の内容をもとに原因を徹底的に調査
  (関連コードを読み、データフローを追跡し、問題発生箇所を特定する)
  ↓
原因を特定したら problem.txt に調査内容・原因を記録
  ↓
原因をもとにタスクを切り出し、progress.txt(実装作業)または
manual-work.txt(手動作業)に追加
  ↓
修正作業を実施(開発ハーネスのフローに従い daychi-impl → daychi-review)
  ↓
解決を確認したら problem.txt の状態を「解決済み」に更新
```

- **原因調査・原因特定を経ずに修正作業を開始することは禁止**(対症療法の禁止)
- **problem.txtへの記録を省略して修正することも禁止**(口頭共有された問題も必ず記録)
- このプロセスはメインエージェント・サブエージェントの全てに適用される

## 技術スタック(確定・変更にはユーザー承認必須)

- TypeScript / Next.js (App Router)
- Firebase App Hosting / Firestore / Firebase Auth(Google)
- MapLibre GL JS + OpenFreeMap
- Playwright + Firebase Emulator Suite(E2Eはemulatorで実行、本番データを汚さない)

## コマンド(Phase 1完了後に確定)

| コマンド | 用途 |
|----------|------|
| npm run dev | 開発サーバー起動 |
| npm run emulator | Firebase Emulator起動 |
| npm run seed | Emulatorへテストデータ投入 |
| npm run e2e | E2Eテスト実行(emulator+dev server込み) |
| npx tsc --noEmit | 型チェック(タスク完了前に必須) |
