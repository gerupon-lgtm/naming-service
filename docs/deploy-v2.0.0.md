# デプロイ手順（mvp-2.1.0 / 四柱推命による五行ボーナス F-015）

対象リリース: **`mvp-2.1.0`**
本番: https://naming-service-red.vercel.app

> **本書は v2.0.0 と v2.1.0 をまとめて対象とする。** v2.0.0（F-015の追加）は未デプロイのまま
> v2.1.0（UI改善）を重ねたため、実際に公開されるのは 2.1.0 になる。
> ファイル名は履歴として `deploy-v2.0.0.md` のままにしてある。

---

## 0. 事前確認（ローカル）

```powershell
npx vitest run          # 177件パス / 19ファイル
cd frontend
npm run build           # tsc --noEmit ＋ vite build が通ること
cd ..
```

---

## 1. ZIP作成

```powershell
powershell -ExecutionPolicy Bypass -File .\make-deploy-zip.ps1
```

`naming-service.zip` がプロジェクト直下に出力される。スクリプトは `.gitignore` と同じ方針で
`node_modules` / `dist` / `.vercel` / `.env*` / `*.log` を除外し、**混入チェック**（`.env` の
紛れ込み、接続文字列らしき記述）を行う。警告が出た場合は中身を確認すること。

---

## 2. GitHub へアップロード

1. リポジトリで **Add file → Upload files**
2. **ZIPを展開した中身**をドラッグ＆ドロップ（ZIPのままではない）
3. Commit

> Vercel CLI はこの環境で不調のため使わない（`docs/tasks.md` の運用方針どおり）。

---

## 3. 今回の変更ファイル

### 新規追加
```
api/_lib/bazi/types.ts              契約（BaziInput / WuxingBalance / WuxingBonus）
api/_lib/bazi/solarTerms.ts         節入り・立春の天文計算
api/_lib/bazi/longitude.ts          都道府県47件の経度＋均時差
api/_lib/bazi/meishiki.ts           四柱算出（早子時・蔵干2種・L1〜L3縮退）
api/_lib/bazi/strength.ts           身強／身弱の判定
api/_lib/bazi/wuxing.ts             用神論・五行ボーナス判定
api/_lib/bazi/index.ts              公開インターフェース
api/_lib/bazi/__tests__/*.ts        テスト3ファイル
api/_lib/__tests__/diagnoseBonus.test.ts
frontend/src/prefectures.ts         出生地セレクタ用
frontend/src/birthInput.ts          生年月日・出生時刻の入力補助（v2.1.0）
frontend/src/__tests__/birthInput.test.ts
docs/integration-shichu.md          設計ドキュメント
docs/deploy-v2.0.0.md               本書
make-deploy-zip.ps1                 ZIP作成スクリプト
```

### 変更
```
api/_lib/version.ts                 mvp-1.0.0 → mvp-2.1.0
frontend/tsconfig.json              テストを型チェック対象から除外（v2.1.0）
api/_lib/diagnose.ts                birthDate等の受け取り／wuxingBonus算出
api/diagnose.ts                     POSTで生年月日を受け取る（GETでは受け取らない）
api/_lib/fortune/types.ts           DiagnosisResult に wuxingBonus? を追加
frontend/src/api.ts                 mvp-2.0.0／WuxingBonus型／diagnose()に birth 引数
frontend/src/DiagnoseView.tsx       入力欄・ボーナス表示・テキスト出力
frontend/src/index.css              .bonus 系スタイル
CLAUDE.md / README.md / 要件定義書 / docs/*.md   ドキュメント更新
```

### 削除済み
```
naming-service/naming-service/      重複ディレクトリ（v1.x の古いコピー）
```

---

## 4. 環境変数

**追加・変更なし。** 既存の設定のまま動作する。

- 四柱推命の計算は**すべてローカル計算**（節入りも天文計算）で、外部APIを呼ばない
- DBスキーマの変更なし。`db/setup_all.sql` の再投入は**不要**
- 生年月日は永続化しないため、DB側の準備も不要

---

## 5. デプロイ後の動作確認

| 確認項目 | 期待結果 |
|---|---|
| `/api/health` | `"db":{"enabled":true,"ok":true}` |
| `/api/version` | `{"version":"mvp-2.1.0", "llm":{...}}` |
| 画面フッター | `mvp-2.1.0　<サービス名>:<モデル名>` |
| 生年月日の入力 | 8桁の数字が入る。**年に6桁以上は入らない**。カレンダーからも選べ、両者が同期する |
| 出生時刻の入力 | 4桁の数字が入る。**分が正しく入る**。時計からも選べる |
| 不正な入力（19900230 等） | 欄の下に注意が出る。**診断そのものは動く**（ボーナスだけ出ない） |
| 五行ボーナスの星 | 4段階。恩恵がない場合は `☆☆☆` |
| ボーナスの文言 | 度合いのラベルが出ない。「補えていません」等の否定的表現が無い |
| 診断（生年月日なし） | 従来どおり。五行ボーナスは**出ない** |
| 診断（生年月日あり） | 三才の下に「四柱推命による五行ボーナス」が出る。★と言葉、由来バッジ、注釈文 |
| 生年月日の有無で比較 | **総合ランク・点数・五格が変わらないこと**（最重要） |
| 出生時刻の折りたたみ | 生年月日を入れると現れる。時刻を入れると案内文が「出生地」に変わる |
| 共有URLをコピー→別タブで開く | 診断結果は再現される。**五行ボーナスは出ない**（仕様） |
| ファイル保存・コピー | ボーナスの見出し・★・注釈が本文に含まれる |
| ペットの名づけタブ | **従来どおり変化なし**（F-015は姓名診断モードのみ） |

---

## 6. 想定される差し戻し

万一問題が出た場合、Vercel のダッシュボードから直前のデプロイに **Rollback** できる。
F-015 は既存機能に対して加算的な変更で、生年月日を送らなければ従来と同一の
レスポンスになるため、影響範囲は限定的。

---

## 7. 未着手（次回以降）

- **F-015 Phase B**: 四柱推命アプリのエンジンへ一元化（`calcWuxingBalance` の中身のみ差し替え）
- 旧逆引きモジュールの削除: `api/_lib/pet/readingLookup.ts` / `api/_lib/kanjiapiReading.ts` /
  `api/_lib/__tests__/readingLookup.test.ts` / `db/seed/name_kanji_allow.json`
- name_master のさらなる拡充、独自ドメイン
- 部首補正: 月(肉づき)の手動確認
