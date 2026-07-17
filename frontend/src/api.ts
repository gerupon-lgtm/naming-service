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

export async function diagnose(
  sei: string,
  mei: string,
  sex: Sex = "unspecified"
): Promise<DiagnosisResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sei, mei, sex }),
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
