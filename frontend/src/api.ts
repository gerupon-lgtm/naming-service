// API クライアント（診断結果の取得）。
// 開発時は VITE_API_BASE で API のベース URL を切り替える。
// 本番はフロント（GitHub Pages）と API（Vercel）が別オリジンになる想定。

export type Sex = "male" | "female" | "unspecified";

export type Rank = "大吉" | "吉" | "中吉" | "小吉" | "末吉" | "凶";

export interface NameChar {
  char: string;
  strokes: number;
  part: "sei" | "mei";
}

export interface KakuDetail {
  key: "tenkaku" | "jinkaku" | "chikaku" | "gaikaku" | "soukaku";
  label: string;
  nickname: string;
  strokes: number;
  category: string;
  categoryLabel: string;
  role: string;
  plain: string;
  keyword: string;
  summary: string;
  members: number[];
  reisu?: boolean;
  caution?: string;
}

export interface Sansai {
  tenLabel: string;
  jinLabel: string;
  chiLabel: string;
  relationTenJin: string;
  relationJinChi: string;
  category: string;
  categoryLabel: string;
  summary: string;
}

export interface WuxingSummary {
  wood: number;
  fire: number;
  earth: number;
  metal: number;
  water: number;
  dominant: string;
  lacking: string[];
}

/**
 * 四柱推命による五行ボーナス（F-015）。生年月日を入力したときだけ返る。
 *
 * 【重要】これは別枠の参考情報であり、score / rank / 五格には一切影響しない。
 * 共有URL（F-006）では生年月日を渡さないため、共有URLで開いた結果には付かない。
 */
export interface WuxingBonus {
  targetElements: string[];
  soukakuElement: string;
  sansaiElements: string[];
  matched: string[];
  /** 4段階。3=★★★ / 2=★★☆ / 1=★☆☆ / 0=☆☆☆（恩恵なし） */
  level: 3 | 2 | 1 | 0;
  /** "★★★" / "★★☆" / "★☆☆" / "☆☆☆" */
  stars: string;
  /** 度合いのラベル。**画面には表示しない**（aria-label 等のテキスト等価物としてのみ使う）。 */
  label: string;
  summary: string;
  /** 由来が四柱推命であることの明示。 */
  source: "shichu";
  inputLevel: "L1" | "L2" | "L3";
  levelHint: string | null;
}

export interface DiagnosisResult {
  tenkaku: number;
  jinkaku: number;
  chikaku: number;
  gaikaku: number;
  soukaku: number;
  strokeTotal: number;
  score: number;
  rank: Rank;
  sex: Sex;
  chars: NameChar[];
  details: KakuDetail[];
  sansai: Sansai;
  wuxing: WuxingSummary;
  /** 生年月日の入力があったときだけ付く（F-015）。 */
  wuxingBonus?: WuxingBonus;
}

/** 五行の英名 → 日本語表記。 */
export const WUXING_JP: Record<string, string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

/** 五行ボーナスの導入文（相性の目安・後押し・点数に影響しない）。 */
export const WUXING_BONUS_INTRO =
  "生年月日から見た「あなたに合う五行」を、この名前が持っているかを四柱推命の観点でみた相性の目安です。上の姓名判断の点数には影響しません。星が多いほど、名前があなたの運の巡りを後押ししていると考えられます。";

/** 五行ボーナスの注釈文（必須表示・短縮版。画面のツールチップ無し版）。 */
export const WUXING_BONUS_NOTE =
  "※四柱推命の五行・三才をもとにした参考情報です。上の姓名判断の結果（総合ランク・各格）には影響しません。生年月日は保存されません。";

/** 生年月日を伴う診断の任意入力。 */
export interface BirthInput {
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  /**
   * 共有URL用。算出済みの用神リスト（"metal-water-wood" 形式）。
   * **生年月日の代わり**に渡してボーナスだけを再現する。
   * 生年月日は復元できないため、URLに個人情報を載せずに共有できる。
   */
  wuxingTargets?: string;
}

/** 用神リストを共有URL用の文字列にする（"metal-water-wood"）。 */
export function serializeTargets(targets: string[]): string {
  return targets.join("-");
}

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "DIAGNOSIS_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "NETWORK";

export interface ApiErrorBody {
  error: string;
  message: string;
}

/** APIエラー。code で画面側の出し分けができる。 */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export const APP_VERSION = "mvp-2.4.3";
// mvp-2.2.0 = ボーナス用語説明のツールチップ化、datetimepicker系アイコンのsvg化
// mvp-2.3.0 = 共有URLに用神リスト(wx)を付与、使いたい文字をLLM生成に切替（よみ照合）
// mvp-2.3.1 = 使いたい文字由来の候補チップを「よみから生成」と区別（source: chars）
// mvp-2.4.0 = 使いたい文字を単体1文字・表記照合に再定義。ローマ字出力＋アルファベット対応。
//            使いたい文字×よみの2段構え＋フォールバックのお知らせ
// mvp-2.4.1 = 使いたい文字/よみ欄の縦位置を揃え、説明を簡潔化。アルファベット時のみ注釈表示
//            （アルファベットは出力文字種を無視しローマ字強制）
// mvp-2.4.2 = 五行ボーナスに導入文①＋「吉となる五行の取り入れ方」折りたたみ②を追加。
//            下部注釈を短縮（ツールチップ維持）
// mvp-2.4.3 = 五行ボーナスの折りたたみ見出しを .disclosure と同じ淡い茶色の
//            ボタン風にして押せる感を出す

export interface VersionInfo {
  version: string;
  llm: { provider: string; model: string } | null;
}

/** バージョンと、最初に接続できたLLM（サービス:モデル）を取得。失敗時は null。 */
export async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/version`);
    if (!res.ok) return null;
    return (await res.json()) as VersionInfo;
  } catch {
    return null;
  }
}

export async function diagnose(
  sei: string,
  mei: string,
  sex: Sex = "unspecified",
  birth: BirthInput = {}
): Promise<DiagnosisResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 生年月日は指定があるときだけ送る（未入力なら従来と完全に同じリクエスト）
      body: JSON.stringify({
        sei,
        mei,
        sex,
        ...(birth.birthDate ? { birthDate: birth.birthDate } : {}),
        ...(birth.birthTime ? { birthTime: birth.birthTime } : {}),
        ...(birth.birthPlace ? { birthPlace: birth.birthPlace } : {}),
        ...(birth.wuxingTargets ? { wuxingTargets: birth.wuxingTargets } : {}),
      }),
    });
  } catch {
    throw new ApiError(
      "NETWORK",
      "サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。"
    );
  }
  const data = await res.json().catch(() => ({}) as ApiErrorBody);
  if (!res.ok) {
    const body = data as ApiErrorBody;
    const code = (body.error as ApiErrorCode) ?? "SERVICE_UNAVAILABLE";
    throw new ApiError(code, body.message ?? "診断に失敗しました");
  }
  return data as DiagnosisResult;
}

/**
 * 診断結果へのLLM解説コメントを取得する（F-012）。
 * 診断結果本体とは別リクエスト。生成不可時は comment: null が返る。
 */
const SEX_LABEL: Record<Sex, string> = {
  male: "男性",
  female: "女性",
  unspecified: "未指定",
};

export async function fetchComment(
  result: DiagnosisResult,
  sei: string,
  mei: string
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "diagnosis",
        payload: {
          ...result,
          sei,
          mei,
          sexLabel: SEX_LABEL[result.sex],
          // details・sansai は result に含まれるのでそのまま渡る
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { comment: string | null };
    return data.comment;
  } catch {
    return null; // コメント失敗は診断結果本体に影響させない
  }
}

// ===== Phase2: ペット命名提案 =====

export type PetTarget = "dog" | "cat" | "small";
export type NameType = "hiragana" | "katakana" | "kanji" | "romaji";

export interface SuggestQuery {
  target: PetTarget;
  sex?: "male" | "female";
  categories?: string[];
  includeChars?: string[];
  charTypes?: NameType[];
  reading?: string;
  limit?: number;
}

export interface SuggestItem {
  name: string;
  reading: string;
  type: NameType;
  strokeTotal: number;
  fortune: string;
  fortuneLabel: string;
  score: number;
  /**
   * 候補の出どころ（チップ表示に使う）。
   *   master  = 命名候補マスタから
   *   dynamic = 希望よみから生成
   *   chars   = 使いたい文字から生成
   */
  source: "master" | "dynamic" | "chars";
  reasons: string[];
}

/**
 * フォールバックのお知らせ（F-003・v2.4.0）。
 * 使いたい文字と希望のよみを両立できず、よみを優先したとき返る。
 */
export interface SuggestNotice {
  kind: "reading_over_char";
  droppedChar: string;
  reading: string;
}

export interface SuggestResult {
  candidates: SuggestItem[];
  notice?: SuggestNotice;
}

/** notice を表示文言にする。 */
export function noticeText(n: SuggestNotice): string {
  return `使いたい文字「${n.droppedChar}」とよみ「${n.reading}」を両立できる名前が見つからなかったため、よみを優先しました。`;
}

export async function fetchCategories(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/suggest`, { method: "GET" });
    if (!res.ok) return [];
    const data = (await res.json()) as { categories: string[] };
    return data.categories ?? [];
  } catch {
    return [];
  }
}

export async function suggest(q: SuggestQuery): Promise<SuggestResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q),
    });
  } catch {
    throw new ApiError(
      "NETWORK",
      "サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。"
    );
  }
  const data = await res.json().catch(() => ({}) as ApiErrorBody);
  if (!res.ok) {
    const body = data as ApiErrorBody;
    const code = (body.error as ApiErrorCode) ?? "SERVICE_UNAVAILABLE";
    throw new ApiError(code, body.message ?? "候補の生成に失敗しました");
  }
  const d = data as { candidates?: SuggestItem[]; notice?: SuggestNotice };
  return { candidates: d.candidates ?? [], notice: d.notice };
}

const TARGET_JP: Record<PetTarget, string> = {
  dog: "犬",
  cat: "猫",
  small: "小動物",
};

/**
 * よみ（響き）へのLLMコメントを取得する（F-011・T-106）。
 * コメントは画数・吉凶に触れず「よみ」で決まるため、同じよみは同一コメントになる。
 * 生成不可時は null。
 */
export async function fetchPetComment(
  reading: string,
  q: SuggestQuery
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "petName",
        payload: {
          reading,
          target: q.target,
          sexLabel:
            q.sex === "male" ? "男の子" : q.sex === "female" ? "女の子" : undefined,
          categories: q.categories,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { comment: string | null };
    return data.comment;
  } catch {
    return null;
  }
}

export const PET_TARGET_LABEL = TARGET_JP;
