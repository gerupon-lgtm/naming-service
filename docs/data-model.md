# データモデル

データ構造の全体設計は `命名サービス向けデータ構造設計.md`（v11）を正とする。本書はPhase分けと実装観点の補足のみ記載する。

## Phase1（MVP: 姓名診断＋LLMコメント）で必要なテーブル

### character_master（文字マスタ）
| 列 | 型 | 必須 | 説明 |
|----|----|------|------|
| character_id | serial | ◯ | PK |
| character | text | ◯ | 文字（1文字） |
| stroke_count | int | ◯ | 画数 |
| character_type | text | ◯ | kanji / hiragana / katakana / roman / symbol |
| source | text | ◯ | `seed`（初期投入） / `kanjiapi`（API取得キャッシュ） |

- **【実装済・v1.16】** 初期シードは **常用漢字＋人名用漢字（grade1〜10）＋ひらがな・カタカナ、計約3,096字**を投入。生成は `db/build-seed.cjs`（ビルド時のみ・本番の実行時APIではない）。
- **【確定】** `source` 列はキャッシュ由来かどうかを区別するために実装上追加する（`seed` / `kanjiapi`）。
- **【確定】流派は熊崎式。** 一部の部首で伝統的な画数補正（氵→水4、扌→手4、艹→艸6、⻖→阜8、⻏→邑7 等）を行う。
- **【実装済】部首補正の自動化（当初の半自動案から変更）**: 外部APIキー不要のオフラインパッケージで自動適用する。
  - `kanji-data`（KanjiDic2由来）で現代画数を取得。
  - `kanji` の `kanjiTree`（部品分解）で部首グリフ（氵扌艹忄⺨⻖⻏王礻衤⻌）を検出し、`db/seed/radical_corrections.json` の補正値を加算。
  - 補正を適用した文字の一覧は `db/seed/correction_review.json`（監査用・約685字）に出力。
  - **限界**: 月(肉づき)は「月(つき)」と字形が同一で自動判別できないため補正しない（手動確認対象）。分解データが稀に 廿 を 艹 と誤ラベルする等の誤検出は残る。kanjiapi.devからの自動キャッシュ（source=kanjiapi）は補正なし現代画数のため、シード外の稀字でのみ熊崎式と差が出る限界を許容。
  - 当初検討した Kanji alive API／MuzukanjiAPI（RapidAPIキーが必要）は不要になった。

## Phase2テーブル: name_master（ペット名候補・実装済 v1.19）

正規化（name_character/name_target/name_gender/category_master/name_category）は将来必要になったら行う方針で、まずは**配列カラムを持つ単一テーブル**で実装。

| 列 | 型 | 説明 |
|----|----|------|
| name_id | serial | PK |
| name | text | 候補名（UNIQUE） |
| reading | text | よみ（ひらがな） |
| char_type | text | hiragana / katakana / kanji |
| targets | text[] | dog / cat / small |
| genders | text[] | male / female / neutral |
| categories | text[] | かわいい 等 |

- 定義: `db/migrations/003_name_master.sql`、シード: `db/migrations/004_seed_name_master.sql`（`db/seed/name_master.seed.json`・約216件から `db/build-name-seed-sql.py` で生成、UPSERT）。`db/setup_all.sql` に含む。
- 参照: `api/_lib/pet/nameMaster.ts` の `getCandidates()` が **DATABASE_URL があれば name_master をSELECT、無ければ seed JSON にフォールバック**（コールドスタートごとに1回キャッシュ）。
- `fortune_result`/`fortune_detail`/`fortune_method` はPhase2でも作らない（診断・提案とも熊崎式ハードコード、画数は都度計算）。

## 姓名診断（F-001）の永続化方針

- 診断結果（五格・スコア・ランク・各格詳細・三才・五行サマリ）はDBに保存しない。都度計算し、URLパラメータ（`sei`/`mei`/`sex`）に入力条件を埋め込むことでステートレスに再現・共有する
- Phase1ではDB書き込みは「未知文字のkanjiapi.devキャッシュ書き込み」のみ

## スコア算出方式（【確定】ドキュメント未定義だった部分を決定）

- **81画吉凶テーブル方式**を採用（`api/_lib/fortune/fortuneTable81.ts`）。各格の画数を1〜81に還元し、大吉/吉/半吉/凶の品質値（100/85/55/25）に変換。
- 重み付き合成（人格0.30・総格0.25・地格0.20・外格0.15・天格0.10）で0〜100点を算出（`api/_lib/fortune/kumazaki.ts`）。
- **総合ランク（6段階・v1.15）**: 大吉 ＞ 吉 ＞ 中吉 ＞ 小吉 ＞ 末吉 ＞ 凶。各下限を上から順に設定値化（`api/_lib/fortune/score.ts`: 大吉90／吉76／中吉62／小吉48／末吉34／凶）。表示は言葉が主役、点数は参考値。
- 81画分類・重み・ランク閾値はいずれも**調整可能な初期ルールセット**。
- 五格は熊崎式。姓または名が1文字の場合は**霊数1**を該当格に補う（総格には含めない）。

## 診断結果の拡張情報（表示・LLMコメント材料・他占術連携用。すべてDB非保存）

- **各格詳細（F-014）**: 役割・**やさしい呼び名（nickname）**・吉凶（性別適用後）・画数の象意キーワードと短評（1〜81画は `api/_lib/fortune/strokeMeaning.ts`、役割/呼び名は `gokakuMeaning.ts`）。
- **成り立ち（v1.15）**: `chars`（構成文字）と各格の `members`（その格を作る文字のインデックス）を返し、「どの文字がこの格を作るか」を可視化できる。姓/名1文字の霊数は `reisu` フラグ。
- **三才配置**: 天・人・地の画数を五行（木火土金水）に変換し、相生・相剋で吉凶判定（`api/_lib/fortune/sansai.ts`）。
- **五行サマリ（wuxing）**: 三才の五行内訳と不足五行。四柱推命など五行を使う他占術との連携用の構造化出力。
- **性別（F-013）**: 女性の注意数（21・23・29・32・33・39画、`gender.ts` で設定値化）に該当する格の吉凶を1段階引き下げ、スコア・解説に反映。五格の計算自体は不変。

## 読み逆引き（Phase2で使用）

- `character_reading` 等の読み用テーブルは新設しない。kanjiapi.devの `GET /v1/reading/{reading}` を都度ライブ呼び出しする（データ構造設計 14章参照）
