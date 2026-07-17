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

- 初期データは常用漢字・ひらがな・カタカナを中心にシード投入する
- **【確定】** `source` 列は元のデータ構造設計（v8まで）にはないが、キャッシュ由来かどうかを区別するために実装上追加する
- **【確定】流派は熊崎式を採用する。** 熊崎式は一部の部首で伝統的な画数補正（氵→水4画、扌→手4画等）を行うため、該当する文字はシードデータ作成時（T-003）に補正済みの画数で投入する。kanjiapi.devからの自動キャッシュ（source=kanjiapi）はこの補正を反映しないため、稀な文字でのみ画数が実際の熊崎式と異なる可能性がある限界を許容する
- **【確定】部首補正の半自動化**: シードデータ生成スクリプト（ビルド時のみ・本番の実行時APIではない）で [Kanji alive API](https://kanjialive.com/overview-jp/)（第一候補）から各文字の部首名・画数・位置を取得し、あらかじめ用意する「部首→補正値」対応表（10〜20件程度）と突き合わせて自動補正する
- **【想定・要検証】** Kanji aliveの対応漢字（1235字）外の文字は、[MuzukanjiAPI](https://rapidapi.com/baqterya/api/muzukanjiapi)（13,000字以上収録と説明されているが、レスポンス形式・無料枠は未検証）を第二候補として試し、それでもカバーできない文字のみ手動確認する。T-003着手時に実際のAPIレスポンスを確認してから採用可否を決める

## Phase1では使用しないテーブル（Phase2以降）

`name_master`, `name_character`, `name_target`, `name_gender`, `category_master`, `name_category`, `fortune_result`, `fortune_detail` はPhase2（ペット命名提案）着手時に構築する。`fortune_method` は複数流派対応が必要になるまで作らない（Phase1・Phase2とも熊崎式ハードコード）。詳細はデータ構造設計ドキュメント（v11）参照。

## 姓名診断（F-001）の永続化方針

- 診断結果（五格・スコア・ランク）はDBに保存しない。都度計算し、URLパラメータに入力条件を埋め込むことでステートレスに再現・共有する
- Phase1ではDB書き込みは「未知文字のkanjiapi.devキャッシュ書き込み」のみ

## 読み逆引き（Phase2で使用）

- `character_reading` 等の読み用テーブルは新設しない。kanjiapi.devの `GET /v1/reading/{reading}` を都度ライブ呼び出しする（データ構造設計 14章参照）
