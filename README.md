# 命名サービス（姓名診断＋ペット命名提案）

姓名判断エンジンを使った無料Webサービス。詳細は `CLAUDE.md`・`docs/` を参照。

## 実装状況（Phase1 / MVP）

このパスでは「雛形＋姓名診断エンジンの中核」を実装済み。

| タスク | 内容 | 状態 |
|--------|------|------|
| T-001 | プロジェクト雛形（frontend / api / db） | ✅ 実装 |
| T-003（部分） | character_master シード（かな・代表漢字・部首補正例） | ✅ 実装（本格シードは今後拡充） |
| T-005 | 五格計算（熊崎式・流派差替可能・霊数対応） | ✅ 実装 |
| T-006 | スコア→ランク変換（SS〜C、閾値は設定値） | ✅ 実装 |
| POST /api/diagnose | 姓名診断API（GET共有含む） | ✅ 実装 |
| T-004 | kanjiapi.dev 未知文字フォールバック＋キャッシュ | ✅ 実装（キャッシュはランタイムMap／DB置換はT-002） |
| T-013 | LLMコメント基盤（Ollama→OpenRouter）＋POST /api/comment | ✅ 実装 |
| フロント F-012 | 診断後に非同期でLLMコメント取得・表示 | ✅ 実装 |
| 単体テスト | 五格・スコア・境界値・kanjiapi・LLMフォールバック・コメント（40件） | ✅ 全パス |

| T-002 | Neon(Postgres) 実接続（コード側） | ✅ 実装（接続文字列を入れれば有効化） |
| T-007/011 | S-001・S-002 画面仕上げ・レスポンシブ・共有URL | ✅ 実装 |
| T-012 | 入力バリデーション＋エラー種別表示 | ✅ 実装 |
| F-013 | 性別による吉凶差（女性の注意数をスコア・解説に反映／五格計算は不変） | ✅ 実装 |
| F-014 | 診断結果の情報量アップ（各格の役割・1〜81画の象意・三才/五行・五行サマリ） | ✅ 実装 |
| T-210 | 本番公開（全部Vercel構成・GitHub連携） | ✅ 完了（naming-service-red.vercel.app） |

### Phase3（四柱推命連携 F-015・v2.0.0）
| ID | 内容 | 状態 |
|----|------|------|
| T-301 | `api/_lib/bazi/` に命式計算を実装（日柱 `dayOffset=10` は万年暦照合済・変更禁止） | ✅ 実装 |
| T-301b | 節入り・立春を**天文計算**で算出（固定テーブル廃止。2021年立春=2/3を再現、1950〜2050年検証） | ✅ 実装 |
| T-301c | 身強／身弱の判定（月令中心＋通根＋天干。閾値は設定値化） | ✅ 実装 |
| T-301d | 時差・真太陽時の補正（都道府県47件＋均時差。緯度経度入力は不要） | ✅ 実装 |
| T-301e | 早子時（23時台は翌日の日柱）＋蔵干テーブル2種（子平式／算命学式）を設定値で切替 | ✅ 実装 |
| T-302/303 | **用神論**で `targetElements` を決定、五行ボーナス（3段階＋星）を判定 | ✅ 実装 |
| T-304 | `POST /api/diagnose` に `birthDate`/`birthTime`/`birthPlace` を追加（後方互換） | ✅ 実装 |
| T-305〜307 | S-001 入力欄（折りたたみ）、S-002 ボーナスブロック、テキスト出力 | ✅ 実装 |
| T-308 | プライバシー（生年月日をDB・ログ・URL・LLMプロンプトに残さない） | ✅ 実装・テストで固定 |
| T-309 | バージョン繰り上げ `mvp-2.0.0` | ✅ 完了 |
| T-310 | **UI改善（v2.1.0）**: 生年月日8桁／出生時刻4桁の数字入力＋ピッカー併用、星を4段階化、度合いラベルを非表示化、否定的文言の全廃 | ✅ 実装 |
| 単体テスト（追加後） | 上記＋既存すべて（**177件**／19ファイル） | ✅ 全パス |

> **F-015 の最重要な不変条件**: 五行ボーナスは**総合ランク・スコア・五格を一切変えない**。共有URL（F-006）は `sei`/`mei`/`sex` のみで再現し、生年月日はURLに載せないため、影響させると本人が見た結果と共有URLの結果が食い違うため。回帰テストで固定している。
| 単体テスト（追加後） | 五格・スコア・境界・kanjiapi・LLM・コメント・性別・三才（51件） | ✅ 全パス |

### Phase1・Phase2中核まで完了・本番公開済み
- 本番URL: https://naming-service-red.vercel.app（タブで「姓名診断」「ペットの名づけ」）
- **Phase2（ペット命名提案）**: 条件（対象・性別・雰囲気・使いたい文字・希望よみ・出力文字種）で候補をスコア＋ランダムで提示。希望よみの**漢字表記はLLM生成**（自然な表記を6個生成→先頭2＋画数上位を採用）。候補ごとのLLMコメント（よみ中心・日本語のみ・1件ずつ順次・同じよみは統一）。
- **Phase3（四柱推命連携 F-015）**: 生年月日（任意）から**用神**（吉となる五行）を求め、「四柱推命による五行ボーナス」として**別枠**で参考表示。**星4段階**（★★★／★★☆／★☆☆／☆☆☆=恩恵なし）で、**総合ランク・スコア・五格は一切変えない**。出生時刻・出生地も任意（L1三柱→L2四柱→L3時差補正）。生年月日は8桁、出生時刻は4桁の数字入力＋ピッカー併用。実装は `api/_lib/bazi/`、設計は `docs/integration-shichu.md`。
- 残タスクは `docs/tasks.md` の「現状サマリと残タスク」を参照（Neon再投入・name_masterの拡充・F-015 Phase B（四柱推命アプリのエンジンへ一元化）・独自ドメイン 等）。

## Neon（クラウドDB）のつなぎ方 — はじめての人向け

いまは文字の画数を「同梱の辞書ファイル（`db/seed`）」から読んでいる。これを、クラウド上の
PostgreSQL データベース「Neon」に切り替える手順。**DATABASE_URL を入れれば自動でDB利用に、
空なら従来どおり辞書ファイルで動く**（どちらでも壊れない）。

### 用語（ざっくり）
- **Neon**: ブラウザだけで作れる無料のクラウドPostgreSQL。パソコンへのインストール不要。
- **接続文字列（DATABASE_URL）**: DBの「住所＋鍵」が1本になった `postgres://…` の文字列。
  **パスワードを含む秘密情報**なので他人に共有しない。

### 手順（ブラウザだけ）
1. **アカウント作成**: https://neon.com にアクセスし「Sign up」（Googleアカウント等でOK）。
2. **プロジェクト作成**: 案内に沿って「Create project」。プロジェクト名・Postgresバージョン・
   データベース名・リージョンを選ぶ（リージョンは Tokyo/AWS ap-northeast-1 が近くて速い）。
   DBは自動で用意される。
3. **接続文字列をコピー**: ダッシュボードの「Connect」ボタン →「Connection string」に表示される
   `postgres://…?sslmode=require` を丸ごとコピー（Pooled connection でOK）。
4. **テーブル作成＆データ投入**: 左メニューの「SQL Editor」を開き、`db/setup_all.sql` の中身を
   **全部コピーして貼り付け → Run**。「登録文字数」が表示されれば成功。
5. **アプリに教える**: プロジェクト直下に `.env` を作り（`.env.example` をコピー）、
   `DATABASE_URL=` の右に手順3の文字列を貼る。

### 動作確認（いちばん簡単・vercel dev不要）
接続文字列とテーブルが正しいかだけを確認する専用スクリプトを用意している。
```bash
cd api && npm install                       # 初回のみ（@neondatabase/serverless を入れる）
# 接続文字列をセット:
#   Windows PowerShell:  $env:DATABASE_URL="postgres://....（Neonでコピーした文字列）"
#   Mac/Linux:           export DATABASE_URL="postgres://...."
npm run db:check
#  → 「✅ character_master に 155 文字が登録されています。準備完了です！」で成功
```
うまくいかない時のメッセージ:
- `DATABASE_URL が設定されていません` → 接続文字列のセットを忘れている
- `テーブル character_master がありません` / `空です` → 手順4（setup_all.sql の貼り付け）をやり直す
- `接続に失敗しました` → 接続文字列のコピーミス（`?sslmode=require` まで含めて全部か確認）

### コマンド派の場合（任意）: SQL投入もスクリプトで
SQL Editor を使わず、テーブル作成＆データ投入をコマンドでやることもできる:
```bash
cd api && npm install
export DATABASE_URL="postgres://...."        # Windows: $env:DATABASE_URL="...."
npm run db:migrate
```

### アプリ全体をローカルで動かす（後で・デプロイ準備時）
API は Vercel Functions なので、フルに動かすには `vercel dev` を使う。
**重要: `vercel dev` は `api/` の中ではなく、プロジェクト直下（このREADMEがある階層）で実行する。**
初回は Vercel へのログインとプロジェクト作成（「Create a new project」）を聞かれる。
```bash
# プロジェクト直下（命名サービス/）で:
vercel dev
curl http://localhost:3000/api/health         # "db":{"enabled":true,"ok":true} なら接続成功
```

### LLMコメント（T-013）の構成
- `POST /api/comment` に `{ type:"diagnosis", payload:{五格・スコア・ランク} }` を送ると解説文を返す。
- `LLM_FALLBACK_ORDER`（既定 `ollama,openrouter`）順に試行。Ollama は 5秒タイムアウト／5xx で応答不可と判定し OpenRouter へフォールバック。両方失敗なら `comment: null`（フロントはコメント領域を非表示、診断結果本体は影響なし）。
- LLM は数値・ランクを再計算せず「確定済み結果の解説」に徹するプロンプト。
- 実接続確認: このサンドボックスは外部到達不可のためモックで検証済み。`vercel dev` ＋ `.env`（`LLM_OLLAMA_ENDPOINT=https://ollama.gerupon.uk`）でローカル疎通を確認してください。

### kanjiapi.dev フォールバック（T-004）
- seed／キャッシュに無い文字のみ `GET /v1/kanji/{char}` で画数取得（5秒タイムアウト・失敗時1回リトライ）→ ランタイムキャッシュに1回書き込み。
- 404（kanjiapi にも無い）→ `DIAGNOSIS_UNAVAILABLE`。API障害（5xx・接続不可）→ `SERVICE_UNAVAILABLE`（フォールバックAPIは実装しない方針）。
- 取得画数は熊崎式の部首補正が反映されない現代画数（`source='kanjiapi'`）である限界を許容。

## 五格・スコアの設計メモ

- **五格（熊崎式）**: 天格＝姓合計、地格＝名合計、人格＝姓末字＋名頭字、総格＝姓名合計、
  外格＝総格−人格。姓または名が1文字の場合は**霊数1**を該当格に補う（総格には含めない）。
- **スコア**: 各格の画数を **81画吉凶テーブル**（`api/_lib/fortune/fortuneTable81.ts`）で
  品質値（大吉100／吉85／半吉55／凶25）に変換し、重み付き合成（人格0.30・総格0.25・
  地格0.20・外格0.15・天格0.10）で 0〜100 に算出。
- **ランク閾値**: SS=90+ / S=80-89 / A=65-79 / B=50-64 / C=49-（要件定義 v1.7）。
- 81画分類・重み・閾値はいずれも**調整可能な初期ルールセット**。

### 性別・詳細情報（F-013 / F-014）
- **性別（F-013・`api/_lib/fortune/gender.ts`）**: 五格の計算は性別に影響しない。女性の注意数
  （21・23・29・32・33・39画）に該当する格のみ吉凶を1段階（大吉/吉→半吉）引き下げ、スコアと
  解説に反映。表現は伝統的見方と現代的見直しを併記。注意数リストは設定値化。
- **各格の意味（F-014）**: 役割説明（`gokakuMeaning.ts`）＋1〜81画の象意キーワード・短評
  （`strokeMeaning.ts`）。
- **三才配置（`sansai.ts`）**: 天・人・地の画数を五行（木火土金水）に変換し、相生・相剋で吉凶判定。
- **五行サマリ（`wuxing`）**: 三才の五行内訳と不足五行を構造化出力。**四柱推命など五行を使う
  他占術との連携用**（F-015 で実際に利用。`api/_lib/bazi/` が求めた用神と突き合わせる）。
- これらはすべて**都度計算・DB非保存**。診断結果とともに `POST /api/comment` に渡し、LLMコメントの
  材料にしている（ただし **`wuxingBonus` はLLMに渡さない**。姓名判断の解説はLLM、四柱推命の
  説明はボーナスブロック自身が担う）。

### 四柱推命による五行ボーナス（F-015・`api/_lib/bazi/`）
- **用神論**で「補うべき五行」を決める（身弱→印星・比劫／身強→食傷・財・官）。
  **「最も少ない五行を補う」という簡易方式は採用しない**（本モジュールは将来
  四柱推命アプリのエンジンにもなるため）。
- **節入り・立春は天文計算**（`solarTerms.ts`）。固定テーブルは使わない。年単位キャッシュ。
- **日柱の `dayOffset=10` は万年暦照合済み**（1900-01-01=甲戌／2000-01-01=戊午）。**変更禁止**。
- **早子時**（23:00〜23:59は翌日の日柱）。出生時刻入力時のみ適用し、**時差補正後の時刻で判定**。
- **蔵干テーブルは子平式が既定**。算命学式も実装済みで `BAZI_ZOUKAN_TABLE` で切替可能
  （算命学は本来 三柱＝時柱なしの体系なので、採用時は時柱の扱いを別途整理）。
- **JSTとUTCを取り違えないこと**（実装で踏んだ不具合）。節入り・立春は「真の瞬間(UTC)」、
  日柱・早子時・時支は「JSTの暦日・時刻」で判定する。`meishiki.ts` の `instantMs` と
  `jstPseudoMs` を混同すると9時間ずれる。

## 開発

### API（`/api`）
```bash
cd api
npm install
npm test          # vitest（五格・スコア・境界値）
npm run typecheck
vercel dev        # ローカルAPIサーバ（要 Vercel CLI）
```

### フロント（`/frontend`）
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
# API別オリジン時は VITE_API_BASE を設定
```

### DB シード
`db/seed/character_master.seed.json` が唯一の正。SQL再生成:
```bash
python3 db/build-seed-sql.py   # → db/migrations/002_seed_character_master.sql
```

## ディレクトリ
```
/frontend   React + Vite（静的サイト）
/api        Vercel Functions（TypeScript）※各.tsが1エンドポイント
  /_lib     姓名判断ロジック・文字マスタ参照（先頭_でVercelの関数化対象外）
/db         マイグレーション・シード
/docs       設計ドキュメント
```

## 本番公開（全部Vercelにまとめる）— はじめての人向け

フロント（画面）とAPIを**1つのVercelプロジェクト**で公開する。同じドメインになるので
CORS設定は不要。`vercel.json` と ルートの `package.json` が、フロントのビルドとAPIの関数化を
まとめて面倒みる。

### 仕組み（ざっくり）
- ルート `package.json` の `build` が `frontend` をビルド → 画面は `frontend/dist` から配信。
- `/api` の中の各 `.ts` が自動でAPI（サーバー処理）になる。`/api/_lib`（先頭が `_`）は
  部品なので関数にはならない。
- 画面から `/api/diagnose` を同じドメインで呼ぶ（`VITE_API_BASE` は空のままでOK）。

### あなたの作業（ブラウザ＋かんたんなコマンド）

**0. 前準備**: もし `api` フォルダの中に `.vercel` フォルダができていたら削除する
（以前 `api` の中で `vercel dev` した名残。プロジェクト直下から公開したいため）。

**1. Vercelにログイン**（初回のみ）: プロジェクト直下で
```bash
cd C:\Users\user\Documents\命名サービス
vercel login
```

**2. 初回デプロイ（プレビュー）**: **プロジェクト直下**で（`api`の中ではない）
```bash
vercel
```
質問には基本Enter（デフォルト）でOK:
- Set up and deploy? → `y`
- Which scope? → 自分のチーム（gerupon-s-projects）
- Link to existing project? → `n`
- Project name? → そのままEnter
- In which directory is your code located? → `./`（そのままEnter）
- Override settings? → `n`（`vercel.json` が効くので不要）

完了すると `https://xxxx.vercel.app` のようなプレビューURLが出る。

**3. 環境変数を登録**: Vercelの画面（ダッシュボード）で
`プロジェクト → Settings → Environment Variables` を開き、次を追加（Environmentは
Production と Preview 両方にチェック）:

| 名前 | 値 |
|------|----|
| `DATABASE_URL` | Neonでコピーした接続文字列 |
| `LLM_OLLAMA_ENDPOINT` | `https://ollama.gerupon.uk` |
| `LLM_OLLAMA_MODEL` | `gemma4:31b-cloud`（自分のOllamaにあるモデル名） |
| `LLM_FALLBACK_ORDER` | `ollama,openrouter` |
| `LLM_OPENROUTER_API_KEY` | OpenRouterのキー（無ければ登録しなくてOK） |
| `LLM_OPENROUTER_MODEL` | `google/gemma-4-31b-it:free`（キーがある場合） |

※ `KANJIAPI_*` は既定値で動くので登録不要。OpenRouterのキーが無くても、Ollamaが
つながればコメントは出る（両方ダメならコメント欄が消えるだけで診断は動く）。

**4. 本番デプロイ**: 環境変数を入れたら、本番URLに反映するため
```bash
vercel --prod
```
出てきた本番URLを開き、姓名を入れて診断できれば公開完了。

### 動作確認
- `https://<本番URL>/api/health` を開き、`"db":{"enabled":true,"ok":true}` ならDB接続OK。
- 画面で診断 → 五格・スコアが出て、少し後にコメントが出れば全機能OK。

### うまくいかない時
- 画面は出るが診断でエラー → 環境変数 `DATABASE_URL` の登録漏れ／値ミス。登録後は
  必ず `vercel --prod` で再デプロイ（環境変数は再デプロイで反映される）。
- コメントだけ出ない → Ollama/OpenRouter に届いていない。診断結果自体は正常に出る仕様。
- ビルド失敗 → ログの最後の数行を教えてください。
