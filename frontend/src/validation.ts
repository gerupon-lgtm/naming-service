// 入力バリデーション（S-001）。
// 姓名は漢字・ひらがな・カタカナ（長音符・々・ヶ等を含む）のみ許可し、
// 数字・記号・アルファベット等はエラーにする。

// 許可する文字の範囲:
//   一-鿿  CJK統合漢字
//   々         々（繰り返し記号）
//   ぀-ゟ  ひらがな
//   ゠-ヿ  カタカナ（ー含む）
//   ー         長音符（ー）※゠-ヿに含まれるが明示
const ALLOWED = /^[一-鿿々぀-ゟ゠-ヿ]+$/;

export type FieldName = "姓" | "名";

/**
 * 1フィールドを検証し、問題があればメッセージを返す（問題なければ null）。
 */
export function validateNameField(value: string, field: FieldName): string | null {
  const v = value.trim();
  if (!v) return null; // 未入力は「エラー」ではなくボタン非活性で扱う
  if (!ALLOWED.test(v)) {
    return `${field}は漢字・ひらがな・カタカナで入力してください（数字や記号は使えません）。`;
  }
  return null;
}
