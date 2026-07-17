# API設計

## Phase1（MVP）

| メソッド | パス | 概要 | 対応機能ID |
|---------|------|------|-----------|
| POST | /api/diagnose | 姓・名を受け取り、都度計算で診断結果を返す（LLMコメントは含まない、即時応答） | F-001 |
| GET | /api/diagnose?sei=...&mei=... | URLパラメータから診断結果を再計算して返す（共有用） | F-006 |
| POST | /api/comment | 構造化された結果（診断結果 or 命名候補）を受け取り、LLMで解説コメントを生成する（共通基盤。Phase1では姓名診断結果に、Phase2では命名候補にも利用） | F-011, F-012 |

### POST /api/diagnose

リクエスト:
```json
{ "sei": "山田", "mei": "太郎" }
```

レスポンス（正常系）:
```json
{
  "strokeTotal": 27,
  "tenkaku": 8,
  "jinkaku": 10,
  "chikaku": 17,
  "gaikaku": 6,
  "soukaku": 23,
  "score": 82,
  "rank": "A"
}
```

レスポンス（未知文字がkanjiapi.devにも存在しない場合、エラー）:
```json
{ "error": "DIAGNOSIS_UNAVAILABLE", "message": "一部の文字の画数情報が見つかりませんでした" }
```

### 内部処理フロー
1. 入力文字を1文字ずつ `character_master` から検索
2. 見つからない文字は kanjiapi.dev の `GET /v1/kanji/{character}` に問い合わせ、`stroke_count` を取得して `character_master` にキャッシュ（`source=kanjiapi`）
3. kanjiapi.devにも存在しない場合は `DIAGNOSIS_UNAVAILABLE` エラーを返す
4. 五格（天格・人格・地格・外格・総格）を計算し、スコア・ランクを算出して返す（DBには保存しない）
5. フロントエンドは診断結果を即時表示した後、別リクエストとして `POST /api/comment` を呼び出しLLMコメントを取得する（診断結果の表示はコメント生成を待たない）

### POST /api/comment（Phase1: F-012 姓名診断結果向け／Phase2: F-011 命名候補向けに拡張）

リクエスト（診断結果向け・Phase1）:
```json
{
  "type": "diagnosis",
  "payload": { "strokeTotal": 27, "tenkaku": 8, "jinkaku": 10, "chikaku": 17, "gaikaku": 6, "soukaku": 23, "score": 82, "rank": "A" }
}
```

レスポンス:
```json
{ "comment": "総格23画は…（LLM生成の解説文）" }
```

- Ollama（環境変数 `LLM_OLLAMA_ENDPOINT`）に問い合わせ、タイムアウト5秒または5xx／接続エラーで応答不可と判定
- 応答不可の場合、`LLM_FALLBACK_ORDER` の次の候補（デフォルトはOpenRouter）に切り替える
- 全プロバイダが応答不可の場合は `comment: null` を返し、フロントエンドはコメント領域を非表示にする（診断結果本体はエラーにしない）
- ロジック側で確定した数値・ランクをLLMが書き換えないよう、プロンプトには「この結果を解説してください」という指示のみを与え、診断結果自体の再計算はさせない

## Phase2（ペット命名提案）

| メソッド | パス | 概要 | 対応機能ID |
|---------|------|------|-----------|
| POST | /api/suggest | 条件を受け取り、命名候補をスコア順に返す | F-002〜F-005 |
| GET | /api/reading-lookup?reading=... | よみがな逆引き（kanjiapi.dev中継） | F-004 |

Phase2では `POST /api/comment` を `type: "petName"` で呼び出し、Phase1で構築した同じLLMフォールバック基盤を再利用する（F-011）。
