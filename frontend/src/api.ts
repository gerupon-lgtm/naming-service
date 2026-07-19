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

/** 五行ボーナスの注釈文（必須表示）。 */
export const WUXING_BONUS_NOTE =
  "※四柱推命をもとに、生年月日から五行（木・火・土・金・水）のバランスを見て、あなたを支える要素を導き、名前の画数や三才（天格・人格・地格のバランス）とどれだけ調和しているかで評価しています。上の姓名判断の結果（総合ランク・各格）には影響しません。生年月日は保存されません。";

/** 生年月日を伴う診断の任意入力。 */
export interface BirthInput {
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
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

export const APP_VERSION = "mvp-2.1.0";

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
export type NameType = "hiragana" | "katakana" | "kanji";

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
  source: "master" | "dynamic";
  reasons: string[];
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

export async function suggest(q: SuggestQuery): Promise<SuggestItem[]> {
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
  return (data as { candidates: SuggestItem[] }).candidates ?? [];
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
