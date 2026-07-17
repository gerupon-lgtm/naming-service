# API設計

## Phase1（MVP）

| メソッド | パス | 概要 | 対応機能ID |
|---------|------|------|-----------|
| POST | /api/diagnose | 姓・名・性別を受け取り、都度計算で診断結果を返す（LLMコメントは含まない、即時応答） | F-001, F-013 |
| GET | /api/diagnose?sei=...&mei=...&sex=... | URLパラメータから診断結果を再計算して返す（共有用） | F-006 |
| GET | /api/health | ヘルスチェック。DB接続状態（`db.enabled`/`db.ok`）を返す | - |
| POST | /api/comment | 構造化された結果（診断結果 or 命名候補）を受け取り、LLMで解説コメントを生成する（共通基盤。Phase1では姓名診断結果に、Phase2では命名候補にも利用） | F-011, F-012 |

### POST /api/diagnose

リクエスト（`sex` は任意。`male` / `female` / `unspecified`。省略時は `unspecified`）:
```json
{ "sei": "山田", "mei": "太郎", "sex": "male" }
```

レスポンス（正常系。v1.2で `sex` / `details` / `sansai` / `wuxing` を追加）:
```json
{
  "strokeTotal": 25,
  "tenkaku": 8, "jinkaku": 9, "chikaku": 17, "gaikaku": 16, "soukaku": 25,
  "score": 69,
  "rank": "中吉",
  "sex": "male",
  "chars": [
    { "char": "山", "strokes": 3, "part": "sei" },
    { "char": "田", "strokes": 5, "part": "sei" },
    { "char": "太", "strokes": 4, "part": "mei" },
    { "char": "郎", "strokes": 13, "part": "mei" }
  ],
  "details": [
    {
      "key": "jinkaku", "label": "人格", "nickname": "本質（中心）", "strokes": 9,
      "category": "kyo", "categoryLabel": "凶",
      "role": "性格・才能・中年期の運。姓名判断の中心…",
      "plain": "あなたらしさ・才能・仕事運。最も重要",
      "keyword": "窮迫・浮沈", "summary": "才あれど浮き沈み多く…",
      "members": [1, 2],
      "reisu": false,
      "caution": "（女性の注意数に該当する場合のみ付与）"
    }
  ],
  "sansai": {
    "ten": "metal", "jin": "water", "chi": "fire",
    "tenLabel": "金", "jinLabel": "水", "chiLabel": "火",
    "relationTenJin": "相生", "relationJinChi": "相剋",
    "category": "hankichi", "categoryLabel": "半吉",
    "summary": "五行に生かし合いと抑え合いが混在し…"
  },
  "wuxing": {
    "wood": 0, "fire": 1, "earth": 0, "metal": 1, "water": 1,
    "dominant": "fire", "lacking": ["wood", "earth"]
  }
}
```

- **`rank`（総合ランク・6段階）**: 大吉 ＞ 吉 ＞ 中吉 ＞ 小吉 ＞ 末吉 ＞ 凶。各下限を上から順に設定値化（大吉90／吉76／中吉62／小吉48／末吉34／凶）。生々しい点数ではなくこの言葉を主表示にする（`score` は参考値）。
- **`chars`**: 名前を構成する文字（姓→名の順）と画数。格の「成り立ち」表示に使う。
- **`details`**: 各格（天→人→地→外→総）の役割・**やさしい呼び名（nickname）**・画数・吉凶（性別適用後）・象意キーワードと短評。`members` はその格を構成する文字の `chars` 配列インデックス（例: 人格＝姓の末字＋名の頭字）。姓/名が1文字で霊数を補う場合は `reisu:true`。女性の注意数に該当する格には `caution` が付く。
- **`sansai`**: 三才配置。天・人・地の画数を五行（木火土金水）に変換し、相生・相剋で吉凶判定。
- **`wuxing`**: 三才の五行内訳・不足五行。**四柱推命など他占術との連携用**の構造化データ（DBには保存しない）。
- **性別（F-013）**: 五格の"計算"は性別に影響しない。女性の注意数（21・23・29・32・33・39画）に該当する格のみ、吉凶を1段階（大吉/吉→半吉）引き下げ、スコアと解説に反映する（設定値化）。

レスポンス（未知文字がkanjiapi.devにも存在しない場合、エラー）:
```json
{ "error": "DIAGNOSIS_UNAVAILABLE", "message": "一部の文字の画数情報を取得できませんでした。表記を変えて試すか、しばらくしてから再度お試しください。" }
```

### 内部処理フロー
1. 入力文字を1文字ずつ `character_master` から検索
2. 見つからない文字は kanjiapi.dev の `GET /v1/kanji/{character}` に問い合わせ、`stroke_count` を取得して `character_master` にキャッシュ（`source=kanjiapi`）
3. kanjiapi.devにも存在しない場合は `DIAGNOSIS_UNAVAILABLE` エラーを返す
4. 五格（天格・人格・地格・外格・総格）を計算し、スコア・ランクを算出して返す（DBには保存しない）
5. フロントエンドは診断結果を即時表示した後、別リクエストとして `POST /api/comment` を呼び出しLLMコメントを取得する（診断結果の表示はコメント生成を待たない）

### POST /api/comment（Phase1: F-012 姓名診断結果向け／Phase2: F-011 命名候補向けに拡張）

リクエスト（診断結果向け・Phase1。`payload` は /api/diagnose のレスポンス＋`sei`/`mei`/`sexLabel` を渡す。`details`・`sansai` を含めるとコメントが厚くなる）:
```json
{
  "type": "diagnosis",
  "payload": {
    "strokeTotal": 21, "tenkaku": 8, "jinkaku": 9, "chikaku": 13, "gaikaku": 12, "soukaku": 21,
    "score": 65, "rank": "A",
    "sei": "山田", "mei": "太郎", "sexLabel": "男性",
    "details": [ /* 各格の役割・吉凶・象意 */ ],
    "sansai": { /* 三才（五行）の関係と要約 */ }
  }
}
```

レスポンス:
```json
{ "comment": "総格21画は…（LLM生成の解説文）" }
```

- プロンプトには五格の吉凶・象意・三才（五行）・性別注記まで渡し、LLMは「総合印象→重要な格→三才の流れ→心がけ」の順で肉付けする（数値・吉凶・五行は再計算させない）
- Ollama（環境変数 `LLM_OLLAMA_ENDPOINT`）に問い合わせ、**タイムアウト10秒、またはHTTP 4xx／5xx・接続エラー**で応答不可と判定（未解決No.1の決定）
- 応答不可の場合、`LLM_FALLBACK_ORDER` の次の候補（デフォルトはOpenRouter）に切り替える
- 全プロバイダが応答不可の場合は `comment: null` を返し、フロントエンドはコメント領域を非表示にする（診断結果本体はエラーにしない）
- ロジック側で確定した数値・ランクをLLMが書き換えないよう、プロンプトには「この結果を解説してください」という指示のみを与え、診断結果自体の再計算はさせない

## Phase2（ペット命名提案）

| メソッド | パス | 概要 | 対応機能ID |
|---------|------|------|-----------|
| POST | /api/suggest | 条件を受け取り、命名候補をスコア順に返す（**実装済・中核**） | F-002〜F-005 |
| GET | /api/suggest | カテゴリ選択肢一覧（`{categories:[...]}`）を返す補助 | - |

### POST /api/suggest（実装済・v1.17）

苗字がないため姓名判断は**地格＝総格（名前の合計画数）のみ**で評価する。

リクエスト:
```json
{
  "target": "cat",
  "sex": "female",
  "categories": ["かわいい"],
  "includeChars": ["も"],
  "charTypes": ["hiragana", "katakana"],
  "reading": "もも",
  "limit": 20
}
```
- `target`（必須）: `dog` / `cat` / `small`。
- `sex`（任意）: `male` / `female`。**合成スコアで最重視**。
- `categories`（任意・OR加点）、`includeChars`（任意・AND ハードフィルタ、区切り正規化）、`charTypes`（任意・出力文字種の許可リスト）、`reading`（任意・動的補完に使用）。
- `includeChars` に漢字を含むのに `charTypes` が漢字を許可しない場合は `INVALID_INPUT`（矛盾チェック・T-104）。

レスポンス:
```json
{
  "candidates": [
    {
      "name": "あんこ", "reading": "あんこ", "type": "hiragana",
      "strokeTotal": 6, "fortune": "daikichi", "fortuneLabel": "大吉",
      "score": 100, "source": "master",
      "reasons": ["画数6が大吉", "女の子向き", "かわいい"]
    }
  ]
}
```
- **候補の供給（ユーザー希望を優先→不足分はランダム）**: ①希望の `reading` があれば、かな候補（もなか／モナカ）と漢字逆引き候補（F-004）を**先頭に固定**（よみ由来は合計6件まで）。②表示件数 `SUGGEST_DEFAULT_COUNT`（既定8・設定値／リクエストの `count` で上書き可）に満たない分を、**選択条件（対象・性別・カテゴリ・使いたい文字・出力文字種）に合うマスタからランダムに選定**して埋める（再検索ごとに変化）。
- 合成スコア（性別一致0.40＋画数吉凶0.35＋カテゴリ0.25・設定値化）は各候補の `score`・推薦理由（reasons）の算出に使用。並び順はユーザー希望を先頭、残りは条件一致マスタからランダム。
- 画数吉凶は Phase1 の81画テーブルを流用。
- **よみ逆引き（F-004・実装済）**: `reading` 指定時、まず かな候補（もなか／モナカ）を先頭に必ず出す。さらに漢字が許可されていれば、よみを**モーラ分割→各セグメントを kanjiapi.dev `GET /v1/reading/{seg}` で漢字化→合成**（最大5文字、呼び出し・候補数は上限付き、画数の良い順に上位のみ採用）。kanjiapi.dev 障害時は漢字候補をスキップし、かな候補・マスタ候補は残す。

Phase2ではさらに `POST /api/comment` を `type: "petName"` で呼び出し、Phase1で構築した同じLLMフォールバック基盤を再利用する（F-011・T-106）。
