# 命名サービス（姓名診断＋ペット命名提案）

## 概要
姓名判断エンジンを使い、(1) 既存の姓名を診断する機能と、(2) その逆利用でペット（犬・猫・小動物）の命名候補を提案する機能を提供する無料Webサービス。個人開発・低コスト運用が前提。

## 前提（仮置き）
- フロントエンドはReact + Vite + TypeScript（当初のGitHub Pages案は非採用。Vercelが静的配信も担当）
- バックエンドAPIはVercel Functions（Node.js + TypeScript）。フロントと同一Vercelプロジェクト・同一ドメイン
- 【想定】DBはNeon（Postgres無料枠）。Vercel Functionsはファイルシステムが永続化されないため、SQLite等のファイルDBは採用しない
- 【想定】スコア→ランク（SS〜C）の閾値は初期値を仮設定し、実装中に調整可能な設定値として持つ
- 【想定】Ollamaの「応答不可」判定はタイムアウト5秒＋HTTP 5xx／接続エラー
- 【想定】LLMフォールバック順・使用モデルは環境変数で管理する（下記参照）
- 将来的にOCI VPSへ移行予定。DB・API実装は移行を見据え、特定ホスティングに強く依存しない構成にする

## 技術スタック
- 言語/FW: TypeScript、React + Vite（フロント）、Vercel Functions（API）
- DB: Neon（Postgres無料枠）
- **デプロイ【確定・実装済】: フロント・APIとも1つのVercelプロジェクトにまとめて公開（同一ドメイン＝CORS不要）。** 本番URL: naming-service-red.vercel.app。GitHub連携で自動デプロイ。将来 OCI VPS へ移行（当初の「フロント=GitHub Pages／API=Vercel」案は非採用）
- 認証: なし（MVP時点。将来検討）
- LLM: Ollama（自宅サーバー、第一候補） → OpenRouter（無料枠モデル、フォールバック）

## ディレクトリ構成（実装済）
```
/frontend       React + Vite（Vercelがビルドし frontend/dist を静的配信）
/api            Vercel Functions（TypeScript）※各 .ts が1エンドポイント
/api/_lib       姓名判断ロジック・kanjiapi.devクライアント・LLMクライアント・DBクライアント等
                （先頭 _ でVercelのFunction化対象外。旧 api/lib から改名）
/db             マイグレーション・シード・接続確認/移行スクリプト
/docs           本設計ドキュメント一式
vercel.json     framework:null / buildCommand / outputDirectory=frontend/dist
package.json（ルート） build で frontend をビルド、API実行時依存を宣言
```

## デプロイ上の必須事項【実装で確定】
- `/api` のTS関数は **CommonJSで統一**する。`api/package.json` に `"type": "module"` を置かず、`api/tsconfig.json` は `"module": "CommonJS" / "moduleResolution": "node"`。拡張子なしのimportを使うため、ESMだと `ERR_MODULE_NOT_FOUND`、片方だけCJSだと `Cannot use import statement outside a module` になる。**この設定は変更しないこと。**
- `/api` 配下で関数にしたくない共有コードは必ず `api/_lib`（先頭 `_`）に置く。
- 環境変数（DATABASE_URL, LLM_*, KANJIAPI_*）はVercelダッシュボードで設定。`DATABASE_URL` 未設定時は同梱seed辞書にフォールバックして動作する。
- ローカルのVercel CLIが不調な環境のため、公開は **GitHub web upload → Vercel import** で運用（CLIは使わない）。

## バージョン採番規約
- 形式: **`mvp-MAJOR.MINOR.PATCH`**（現在 `mvp-2.4.2`）。定義は `api/_lib/version.ts` の `APP_VERSION`（フロントは `frontend/src/api.ts` の `APP_VERSION` にも同値を持つ）。
- インクリメント: **小さな修正=末尾(PATCH)／中規模=中央(MINOR)／大きな変更=先頭(MAJOR)**。MINORを上げたらPATCHは0に、MAJORを上げたらMINOR/PATCHは0に。
- 画面フッターに `mvp-x.y.z <サービス名>:<モデル名>` を表示。サービス/モデルは **最初に正常接続できたLLM**（`GET /api/version` の `probeLlm` 結果、サーバー側キャッシュ）。

## 規約
- 機能実装時は `docs/tasks.md` のタスクID（例: T-001）をコミットメッセージに含める
- 姓名診断結果・命名候補データはDBに永続化しない（診断結果）／永続化する（命名候補マスタ）の区別を厳守する（`docs/data-model.md` 参照）
- 環境変数はすべて `.env.example` に列挙し、実値はコミットしない

## コマンド（想定）
- フロント開発サーバ: `npm run dev`（frontend/）
- API開発サーバ: `vercel dev`
- テスト: `npm test`

## 環境変数（LLMフォールバック関連）
```
LLM_FALLBACK_ORDER=ollama,openrouter
LLM_OLLAMA_ENDPOINT=<自宅サーバーの公開URL>
LLM_OLLAMA_MODEL=gemma4:31b-cloud
LLM_OPENROUTER_API_KEY=<APIキー>
LLM_OPENROUTER_MODEL=google/gemma-4-31b-it:free
LLM_TIMEOUT_MS=10000
```
- 総合ランクは6段階（大吉/吉/中吉/小吉/末吉/凶）。各下限は `api/_lib/fortune/score.ts` の設定値（大吉90/吉76/中吉62/小吉48/末吉34/凶）。表示は言葉が主役・点数は参考値。
- LLM応答不可判定は **タイムアウト10秒＋HTTP 4xx/5xx・接続エラー**（v1.15決定）。

## 実装上の注意
- 姓名診断（F-001）は `character_master` を都度参照して画数計算する。DBに存在しない文字は kanjiapi.dev から取得しキャッシュする（書き込みは1回のみ、以後はDB参照）
- 流派は熊崎式を採用する。将来複数流派に対応できるよう、計算ロジックは流派を差し替え可能な構造にしておくが、Phase1では熊崎式のみをハードコードし `fortune_method` テーブルは作らない
- 熊崎式は一部の部首で伝統的な画数補正（氵→水4、⻖→阜8、⻏→邑7 等）を行うが、kanjiapi.devの画数はこれを反映しない。シードは補正済み画数で持つ（source=seed）。自動キャッシュされた未知文字（source=kanjiapi）はこの補正が反映されない限界がある。
- **【v1.16実装済】部首補正は自動化**: `db/build-seed.cjs`（ビルド時のみ）でオフラインパッケージ `kanji-data`（現代画数）＋`kanji`（`kanjiTree`部品分解）を使い、部首グリフ（氵扌艹忄⺨⻖⻏王礻衤⻌）を検出して `radical_corrections.json` の補正値を加算する。**RapidAPIキー不要**（当初のKanji alive／MuzukanjiAPI案は非採用）。シードは常用＋人名用＋かな（濁音・半濁音・拗音・促音・々含む）約3,168字。再生成: `npm i kanji-data kanji && node db/build-seed.cjs` → `python3 db/build-seed-sql.py`。補正適用文字は `db/seed/correction_review.json` に監査用出力。月(肉づき)のみ字形が月(つき)と同じで自動判別できず未補正（手動確認対象）。**シード更新後は Neon に `db/setup_all.sql` を再投入（UPSERT）すること。**
- 命名候補提案（F-002〜F-005・F-011）は**Phase2として実装済み**（`api/_lib/pet/`、`/api/suggest`、フロントは「ペットの名づけ」タブ）。提案はユーザー希望（よみ由来・使いたい文字由来）をLLM生成＋不足分は条件一致マスタからランダム（件数は `SUGGEST_DEFAULT_COUNT`）。**希望よみの漢字表記は機械的逆引きではなくLLM生成**（`kanjiNameLLM.ts`。自然な表記を生成→先頭2＋画数上位を採用）。候補コメントはよみ中心・日本語のみ・1件ずつ順次・同一よみ統一
- **使いたい文字（F-003・v2.4.0再定義）**: **単体1文字を名前の表記に含める**（文字種問わず。詳細 `docs/pet-usable-char.md`）。かな→表記照合（ひらがな・カタカナ同一視）／漢字→表記／アルファベット→ローマ字表記（ヘボン式・`romaji.ts`）。**LLM出力は必ず機械検証**（表記に含むか）してから採用する。使いたい文字×希望のよみが両立しないときはよみ優先＋`notice` を返す。**ローマ字候補の画数はアルファベットに画数が無いためよみ（かな）で数える**（`suggest.ts` の `toItem`）。この点を忘れるとローマ字候補が全て落ちる
- kanjiapi.devの障害時はエラー表示のみとし、フォールバックAPIは実装しない（`docs/tasks.md` 参照）
- LLMコメント生成（F-011, F-012）はOllama優先、応答不可時のみOpenRouterにフォールバックする。フォールバック順・モデルは環境変数で変更可能にする
- LLMコメントは「ロジックで確定した結果への肉付け」役に徹する。診断結果の数値・ランクはロジック側で確定させ、LLMに再計算させない
- 診断結果本体は即時表示し、LLMコメントは非同期で後から表示する（コメント生成の遅延で診断結果表示を待たせない）

## 参照
- 要件定義書: `命名サービス_要件定義書.md`（機能IDはここを正とする）
- データ構造設計: `命名サービス向けデータ構造設計.md`（v11）
- 設計: `docs/data-model.md`, `docs/screens.md`, `docs/api-design.md`, `docs/tasks.md`
- 四柱推命連携（F-015・**Phase A 実装済 v2.0.0**／Phase B 未着手）: `docs/integration-shichu.md`。実装は `api/_lib/bazi/`。生年月日の不足五行を**姓名診断（S-001/S-002）に参考表示**する。Phase A=五行計算内蔵で自己完結→Phase B=四柱推命アプリのエンジンへ切替。**次の3点は厳守**:
  - **突合は総合スコア・ランク・五格を一切変えない**。「**四柱推命による五行ボーナス**」として別枠表示する（共有URL(F-006)の再現性と姓名判断の一貫性を守るため。生年月日はURLに載せない）
  - 評価は**星4段階**（★★★／★★☆／★☆☆／☆☆☆=恩恵なし）。記号3枠に★を0〜3個。**0〜100の数値は出さない**（「言葉が主役・点数は参考値」方針に合わせ総合点と競合させない）。**四柱推命由来であることを見出し・由来バッジ・注釈文・テキスト出力で明示する**
  - **度合いのラベルは画面に出さない**（星と本文で伝える）。ただし `aria-label` にはテキスト等価物を残す。**名前を否定する文言は使わない**（「補えていません」等は不可）。恩恵なしでも本文は必ず返し、開運要素の案内に振る
  - 生年月日は**8桁テキスト入力を主**、出生時刻は**4桁テキスト入力を主**とし、ピッカーは併用手段として双方向同期する（標準の日付入力は年に6桁入り、時刻入力は分の挙動が不安定なため）。検証ロジックは `frontend/src/birthInput.ts`
  - **ペット命名モードでは使わない**（ペットの生年月日は不明なことが多い）。`api/_lib/pet/suggest.ts` は変更しない
  - **人の五行は四柱推命式・名前の五行は画数一の位式**という役割分担を厳守（同じ計算式に統一しない）
  - **補うべき五行は「用神」で決める**（身弱→印星・比劫／身強→食傷・財・官）。**「最も少ない五行を補う」は簡易方式なので採用しない**（本モジュールは四柱推命アプリのエンジンにもなるため）
  - **生年月日のみで判定を完了できること。** 出生時刻・出生地は任意で、未入力でも処理を止めない（L1三柱→L2四柱→L3時差補正の積み上げ式）。**未入力項目を勝手に補完しない**（「正午」「東京」等とみなさない）
  - 日柱の `dayOffset=10` は万年暦と照合済み（1900-01-01=甲戌／2000-01-01=戊午）。**変更禁止**
  - **早子時説を採用**（23:00〜23:59生まれは翌日の日柱）。出生時刻入力時のみ適用し、**時差補正後の時刻で判定**する（順序: 時差補正→早子時判定→日柱確定）
  - 蔵干テーブルは**子平式を既定**とし、算命学式も実装して設定値で切替可能にする（算命学は本来 三柱＝時柱なしの体系なので、採用時は時柱の扱いを別途整理）
  - **JSTとUTCを取り違えないこと（実装で踏んだ不具合）**。節入り・立春は天文計算の「真の瞬間(UTC)」、日柱・早子時・時支は「JSTの暦日・時刻」で判定する。`meishiki.ts` の `instantMs` と `jstPseudoMs` を混同すると9時間ずれる
  - **LLMコメントには五行ボーナスを渡さない**（`DiagnosisPayload` に含めない）。姓名判断の解説はLLM、四柱推命の説明はボーナスブロック自身が担う。四柱推命寄りのコメントは専門アプリ側で扱う
