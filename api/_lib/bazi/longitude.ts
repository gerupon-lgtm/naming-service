// 時差・真太陽時の補正（⑤）。docs/integration-shichu.md 11.3.2。
//
// ユーザーに緯度経度を入力させる必要はない。必要なのは
//   (1) 都道府県 → 代表経度のテーブル（47件）
//   (2) 均時差（日付から計算式で求まる。入力不要）
// の2つだけで、どちらもオフラインで完結する。外部API不要。
//
//   時刻補正 = (出生地の経度 − 135°) × 4分 + 均時差
//
// 135°＝明石（日本標準時の基準）。東京で約+19分、福岡で約−18分。
//
// 【適用条件】出生時刻（L2以上）が入力されている場合のみ意味を持つ。
// 出生地未入力（L2）なら経度補正を適用せず処理を続行する。

export interface Prefecture {
  code: string;
  name: string;
  /** 県庁所在地のおおよその東経（度）。 */
  longitude: number;
}

/** 都道府県の代表経度（県庁所在地基準）。 */
export const PREFECTURES: Prefecture[] = [
  { code: "01", name: "北海道", longitude: 141.35 },
  { code: "02", name: "青森県", longitude: 140.74 },
  { code: "03", name: "岩手県", longitude: 141.15 },
  { code: "04", name: "宮城県", longitude: 140.87 },
  { code: "05", name: "秋田県", longitude: 140.10 },
  { code: "06", name: "山形県", longitude: 140.36 },
  { code: "07", name: "福島県", longitude: 140.47 },
  { code: "08", name: "茨城県", longitude: 140.45 },
  { code: "09", name: "栃木県", longitude: 139.88 },
  { code: "10", name: "群馬県", longitude: 139.06 },
  { code: "11", name: "埼玉県", longitude: 139.65 },
  { code: "12", name: "千葉県", longitude: 140.12 },
  { code: "13", name: "東京都", longitude: 139.69 },
  { code: "14", name: "神奈川県", longitude: 139.64 },
  { code: "15", name: "新潟県", longitude: 139.02 },
  { code: "16", name: "富山県", longitude: 137.21 },
  { code: "17", name: "石川県", longitude: 136.63 },
  { code: "18", name: "福井県", longitude: 136.22 },
  { code: "19", name: "山梨県", longitude: 138.57 },
  { code: "20", name: "長野県", longitude: 138.18 },
  { code: "21", name: "岐阜県", longitude: 136.72 },
  { code: "22", name: "静岡県", longitude: 138.38 },
  { code: "23", name: "愛知県", longitude: 136.91 },
  { code: "24", name: "三重県", longitude: 136.51 },
  { code: "25", name: "滋賀県", longitude: 135.87 },
  { code: "26", name: "京都府", longitude: 135.76 },
  { code: "27", name: "大阪府", longitude: 135.52 },
  { code: "28", name: "兵庫県", longitude: 135.18 },
  { code: "29", name: "奈良県", longitude: 135.83 },
  { code: "30", name: "和歌山県", longitude: 135.17 },
  { code: "31", name: "鳥取県", longitude: 134.24 },
  { code: "32", name: "島根県", longitude: 133.05 },
  { code: "33", name: "岡山県", longitude: 133.93 },
  { code: "34", name: "広島県", longitude: 132.46 },
  { code: "35", name: "山口県", longitude: 131.47 },
  { code: "36", name: "徳島県", longitude: 134.56 },
  { code: "37", name: "香川県", longitude: 134.04 },
  { code: "38", name: "愛媛県", longitude: 132.77 },
  { code: "39", name: "高知県", longitude: 133.53 },
  { code: "40", name: "福岡県", longitude: 130.42 },
  { code: "41", name: "佐賀県", longitude: 130.30 },
  { code: "42", name: "長崎県", longitude: 129.87 },
  { code: "43", name: "熊本県", longitude: 130.74 },
  { code: "44", name: "大分県", longitude: 131.61 },
  { code: "45", name: "宮崎県", longitude: 131.42 },
  { code: "46", name: "鹿児島県", longitude: 130.56 },
  { code: "47", name: "沖縄県", longitude: 127.68 },
];

const PREF_BY_CODE = new Map(PREFECTURES.map((p) => [p.code, p]));
const PREF_BY_NAME = new Map(PREFECTURES.map((p) => [p.name, p]));

/** 都道府県コードまたは名称から経度を引く。見つからなければ null。 */
export function findPrefecture(key: string | undefined): Prefecture | null {
  if (!key) return null;
  return PREF_BY_CODE.get(key) ?? PREF_BY_NAME.get(key) ?? null;
}

/** 日本標準時の基準経度（明石）。 */
export const JST_STANDARD_LONGITUDE = 135;

/**
 * 均時差（分）。真太陽時 − 平均太陽時。
 * 年間で概ね −14分〜+16分の範囲を周期的に変動する。
 * 出典として一般的な近似式（Spencer/NOAA 系）を用いる。入力は不要で日付のみで決まる。
 */
export function equationOfTimeMinutes(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((date.getTime() - start) / 86400000) + 1;

  // 年周角
  const B = ((2 * Math.PI) / 365) * (dayOfYear - 81);
  // 標準的な近似式（誤差は概ね±30秒）
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/**
 * 時刻補正（分）を求める。
 * 出生地が未指定なら経度補正は行わない（0を返す）。
 *
 * 【注意】補正の結果、時刻が日境界や節入り境界をまたぐと日柱・月柱が変わり得る。
 * 呼び出し側は「時差補正 → 早子時判定 → 日柱確定」の順で処理すること。
 */
export function calcTimeShiftMinutes(
  date: Date,
  birthPlace: string | undefined
): number {
  const pref = findPrefecture(birthPlace);
  if (!pref) return 0;
  const longitudeShift = (pref.longitude - JST_STANDARD_LONGITUDE) * 4;
  return longitudeShift + equationOfTimeMinutes(date);
}
