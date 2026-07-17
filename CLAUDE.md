# 命名サービス（姓名診断＋ペット命名提案）

## 概要
姓名判断エンジンを使い、(1) 既存の姓名を診断する機能と、(2) その逆利用でペット（犬・猫・小動物）の命名候補を提案する機能を提供する無料Webサービス。個人開発・低コスト運用が前提。

## 前提（仮置き）
- 【想定】フロントエンドはReact + Vite + TypeScript（GitHub Pagesへの静的デプロイ前提）
- 【想定】バックエンドAPIはVercel Functions（Node.js + TypeScript）
- 【想定】DBはNeon（Postgres無料枠）。Vercel Functionsはファイルシステムが永続化されないため、SQLite等のファイルDBは採用しない
- 【想定】スコア→ランク（SS〜C）の閾値は初期値を仮設定し、実装中に調整可能な設定値として持つ
- 【想定】Ollamaの「応答不可」判定はタイムアウト5秒＋HTTP 5xx／接続エラー
- 【想定】LLMフォールバック順・使用モデルは環境変数で管理する（下記参照）
- 将来的にOCI VPSへ移行予定。DB・API実装は移行を見据え、特定ホスティングに強く依存しない構成にする

## 技術スタック
- 言語/FW: TypeScript、React + Vite（フロント）、Vercel Functions（API）
- DB: Neon（Postgres無料枠）
- デプロイ: GitHub Pages（フロント） + Vercel（API）。将来 OCI VPS へ移行
- 認証: なし（MVP時点。将来検討）
- LLM: Ollama（自宅サーバー、第一候補） → OpenRouter（無料枠モデル、フォールバック）

## ディレクトリ構成（想定）
```
/frontend       React + Vite（GitHub Pagesにデプロイ）
/api            Vercel Functions（TypeScript）
/api/lib        姓名判断ロジック、kanjiapi.devクライアント、LLMクライアント等
/db             マイグレーション・シードスクリプト
/docs           本設計ドキュメント一式
```

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
LLM_TIMEOUT_MS=5000
```

## 実装上の注意
- 姓名診断（F-001）は `character_master` を都度参照して画数計算する。DBに存在しない文字は kanjiapi.dev から取得しキャッシュする（書き込みは1回のみ、以後はDB参照）
- 流派は熊崎式を採用する。将来複数流派に対応できるよう、計算ロジックは流派を差し替え可能な構造にしておくが、Phase1では熊崎式のみをハードコードし `fortune_method` テーブルは作らない
- 熊崎式は一部の部首で伝統的な画数補正（氵→水4画等）を行うが、kanjiapi.devの画数はこれを反映しない。補正が必要な文字は `character_master` のシードデータで手動補正し、自動キャッシュされた未知文字はこの補正が反映されない限界がある
- 部首補正の洗い出しは、Kanji alive API（https://app.kanjialive.com/api/docs、第一候補）をシードデータ生成スクリプトでのみ使い、部首名・画数・位置を取得して「部首→補正値」対応表と突き合わせ半自動化する。本番の実行時APIとしては呼び出さない。Kanji aliveの対応漢字（1235字）外はMuzukanjiAPI（https://rapidapi.com/baqterya/api/muzukanjiapi、第二候補・仕様は実装時に要検証）を試し、それでも対応できない文字のみ手動確認する
- 命名候補提案（F-002以降）はPhase2で着手する。Phase1（MVP）は姓名診断＋そのLLMコメント生成（F-012）までを対象とする
- kanjiapi.devの障害時はエラー表示のみとし、フォールバックAPIは実装しない（`docs/tasks.md` 参照）
- LLMコメント生成（F-011, F-012）はOllama優先、応答不可時のみOpenRouterにフォールバックする。フォールバック順・モデルは環境変数で変更可能にする
- LLMコメントは「ロジックで確定した結果への肉付け」役に徹する。診断結果の数値・ランクはロジック側で確定させ、LLMに再計算させない
- 診断結果本体は即時表示し、LLMコメントは非同期で後から表示する（コメント生成の遅延で診断結果表示を待たせない）

## 参照
- 要件定義書: `命名サービス_要件定義書.md`（機能IDはここを正とする）
- データ構造設計: `命名サービス向けデータ構造設計.md`（v11）
- 設計: `docs/data-model.md`, `docs/screens.md`, `docs/api-design.md`, `docs/tasks.md`
