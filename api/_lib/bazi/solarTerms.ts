// 節入り（節気）の計算。docs/integration-shichu.md 11.2（①②の修正）。
//
// 【なぜ計算するのか】
// 移植元 diagnose.js は節入り日を固定値テーブル（SETSUIRI）で持っていたが、
// 実際の節入りは年により1日ずれ、時刻まである。境界付近の生まれで月柱が丸ごと
// 1つずれ、月支・月干・蔵干の3つが変わって gogyoCount に直撃する。
//
// 節入りは「太陽黄経が特定の角度に達する瞬間」として天文学的に一意に定まる。
// 1900〜2100年のテーブルを同梱する案もあったが、実行時計算にすることで
// データファイル不要・年代の上限なし・ビルド手順の追加なしにできる。
// 計算量は年12回ぶんで、年単位にキャッシュすれば無視できる。
//
// 【精度】Meeus "Astronomical Algorithms" の太陽黄経（見かけの黄経）を実装。
// 誤差は概ね1分角未満＝時刻にして1分未満で、節入り日の判定には十分。

/** 節気の定義。月支は立春(315°)から順に 寅→卯→…→丑。 */
export interface SolarTerm {
  /** 太陽黄経（度）。 */
  longitude: number;
  /** 節気名。 */
  name: string;
  /** この節気から始まる月支のインデックス（BRANCHES 配列基準: 子=0）。 */
  branchIndex: number;
}

/**
 * 「節」（中気ではない）のみ。月柱の切り替えに使うのはこの12個。
 * 立春=315° を起点に30度ずつ。branchIndex は 寅=2 から順に一巡する。
 */
export const SOLAR_TERMS: SolarTerm[] = [
  { longitude: 315, name: "立春", branchIndex: 2 },  // 寅
  { longitude: 345, name: "啓蟄", branchIndex: 3 },  // 卯
  { longitude: 15, name: "清明", branchIndex: 4 },   // 辰
  { longitude: 45, name: "立夏", branchIndex: 5 },   // 巳
  { longitude: 75, name: "芒種", branchIndex: 6 },   // 午
  { longitude: 105, name: "小暑", branchIndex: 7 },  // 未
  { longitude: 135, name: "立秋", branchIndex: 8 },  // 申
  { longitude: 165, name: "白露", branchIndex: 9 },  // 酉
  { longitude: 195, name: "寒露", branchIndex: 10 }, // 戌
  { longitude: 225, name: "立冬", branchIndex: 11 }, // 亥
  { longitude: 255, name: "大雪", branchIndex: 0 },  // 子
  { longitude: 285, name: "小寒", branchIndex: 1 },  // 丑
];

const RAD = Math.PI / 180;

/** ユリウス日（UTCのミリ秒から）。 */
function toJulianDay(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

/** ユリウス日 → UTCミリ秒。 */
function fromJulianDay(jd: number): number {
  return (jd - 2440587.5) * 86400000;
}

/**
 * ΔT（TT − UT）の概算（秒）。Espenak/Meeus の多項式近似（簡略版）。
 * 節入り時刻を分単位で扱うため、数十秒の誤差は許容範囲だが、
 * 1900年以前などで無視できない大きさになるため補正しておく。
 */
function deltaTSeconds(year: number): number {
  let t: number;
  if (year >= 2005 && year < 2050) {
    t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  if (year >= 1986 && year < 2005) {
    t = year - 2000;
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t * t +
      0.0017275 * t * t * t +
      0.000651814 * t * t * t * t +
      0.00002373599 * t * t * t * t * t
    );
  }
  if (year >= 1961 && year < 1986) {
    t = year - 1975;
    return 45.45 + 1.067 * t - (t * t) / 260 - (t * t * t) / 718;
  }
  if (year >= 1941 && year < 1961) {
    t = year - 1950;
    return 29.07 + 0.407 * t - (t * t) / 233 + (t * t * t) / 2547;
  }
  if (year >= 1920 && year < 1941) {
    t = year - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
  }
  if (year >= 1900 && year < 1920) {
    t = year - 1900;
    return (
      -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t -
      0.000197 * t * t * t * t
    );
  }
  if (year >= 2050) {
    t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  // 1900年以前は本サービスの想定外だが、破綻させず概算を返す
  t = (year - 1820) / 100;
  return -20 + 32 * t * t;
}

/**
 * 見かけの太陽黄経（度, 0〜360）。
 * jde: ユリウス日（力学時 TT）。
 */
export function apparentSolarLongitude(jde: number): number {
  const T = (jde - 2451545.0) / 36525;

  // 太陽の幾何平均黄経
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // 太陽の平均近点角
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  // 地球軌道の離心率
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  const Mr = M * RAD;
  // 中心差
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);

  // 真黄経
  const trueLong = L0 + C;
  // 真近点角（離心率 e は将来の精度改善用に保持）
  void e;

  // 章動・光行差を含む見かけの黄経
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  return ((apparent % 360) + 360) % 360;
}

/**
 * 指定した太陽黄経に太陽が達する瞬間を求める（UTCミリ秒）。
 * targetLongitude: 0〜360
 * approxMs: 探索の起点（この前後で最も近い到達時刻を返す）
 */
function solveSolarLongitude(targetLongitude: number, approxMs: number): number {
  // 目標との差（-180〜+180に正規化）を返す関数。単調増加とみなして二分法で解く。
  const diff = (ms: number): number => {
    const year = new Date(ms).getUTCFullYear();
    const jde = toJulianDay(ms) + deltaTSeconds(year) / 86400;
    let d = apparentSolarLongitude(jde) - targetLongitude;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };

  // 起点の前後20日を探索範囲とする（太陽黄経は1日約1度進むため十分）
  const DAY = 86400000;
  let lo = approxMs - 20 * DAY;
  let hi = approxMs + 20 * DAY;

  let dLo = diff(lo);
  let dHi = diff(hi);

  // 範囲内で符号が変わらない場合はずらして再探索（境界付近の保険）
  if (dLo > 0 && dHi > 0) {
    lo -= 40 * DAY;
    dLo = diff(lo);
  } else if (dLo < 0 && dHi < 0) {
    hi += 40 * DAY;
    dHi = diff(hi);
  }

  // 二分法。1秒未満まで詰める
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const dMid = diff(mid);
    if (Math.abs(hi - lo) < 1000) return mid;
    if (dLo <= 0 && dMid >= 0) {
      hi = mid;
      dHi = dMid;
    } else {
      lo = mid;
      dLo = dMid;
    }
  }
  return (lo + hi) / 2;
}

export interface SolarTermInstant {
  term: SolarTerm;
  /** 節入りの瞬間（UTCミリ秒）。 */
  ms: number;
}

// 年単位のキャッシュ。Vercel Functions はプロセスが再利用されるため効果がある。
const _cache = new Map<number, SolarTermInstant[]>();

/**
 * 指定した年（グレゴリオ暦）の12個の節入り時刻を返す（時刻昇順）。
 * 立春(2月頃)から小寒(翌年1月頃ではなくその年の1月)まで、暦年内に収まるものを返す。
 */
export function getSolarTermsOfYear(year: number): SolarTermInstant[] {
  const cached = _cache.get(year);
  if (cached) return cached;

  const result: SolarTermInstant[] = [];
  for (const term of SOLAR_TERMS) {
    // 各節気のおおよその月を起点にする。
    // 立春=2月上旬 … 小寒=1月上旬。longitude 315→2月, 345→3月, 15→4月 …
    let approxMonth = Math.round(((term.longitude - 315 + 360) % 360) / 30) + 2;
    if (approxMonth > 12) approxMonth -= 12;
    const approx = Date.UTC(year, approxMonth - 1, 6, 0, 0, 0);
    const ms = solveSolarLongitude(term.longitude, approx);
    result.push({ term, ms });
  }
  result.sort((a, b) => a.ms - b.ms);
  _cache.set(year, result);
  return result;
}

/** テスト用: キャッシュを消す。 */
export function _clearSolarTermCache(): void {
  _cache.clear();
}

/** 日本標準時のオフセット（ミリ秒）。 */
export const JST_OFFSET_MS = 9 * 3600000;

/**
 * 真の瞬間（UTCミリ秒）を「JSTの暦日の0時」に丸めた値を返す。
 * 蔵干の経過日数は暦日で数えるため、UTC日ではなくJST日で揃える必要がある。
 */
export function jstDayStart(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / 86400000) * 86400000 - JST_OFFSET_MS;
}

export interface MonthTermInfo {
  /** その日時が属する節気（＝月支を決める節）。 */
  term: SolarTerm;
  /** その節の節入り時刻（UTCミリ秒）。 */
  termMs: number;
  /** 節入りからの経過日数（蔵干の分野決定に使う。0始まり。JSTの暦日で数える）。 */
  daysFromTerm: number;
}

/**
 * 指定した「真の瞬間」（UTCミリ秒）が、どの節気の期間に属するかを返す。
 * 月柱・蔵干の決定に使う。
 *
 * 【注意】引数は真の瞬間（UTC）であること。JSTの暦日を Date.UTC() で作った
 * 疑似UTC値をそのまま渡すと9時間ずれるので、呼び出し側で変換すること。
 */
export function findMonthTerm(ms: number): MonthTermInfo {
  // JSTの年を基準に前後の年も集める（年境界の取りこぼし防止）
  const jstYear = new Date(ms + JST_OFFSET_MS).getUTCFullYear();
  const all = [
    ...getSolarTermsOfYear(jstYear - 1),
    ...getSolarTermsOfYear(jstYear),
    ...getSolarTermsOfYear(jstYear + 1),
  ].sort((a, b) => a.ms - b.ms);

  let current = all[0];
  for (const t of all) {
    if (t.ms <= ms) current = t;
    else break;
  }

  // 経過日数はJSTの暦日で数える
  const daysFromTerm = Math.round(
    (jstDayStart(ms) - jstDayStart(current.ms)) / 86400000
  );
  return {
    term: current.term,
    termMs: current.ms,
    daysFromTerm: Math.max(0, daysFromTerm),
  };
}

/**
 * 立春の瞬間（UTCミリ秒）。年柱の切り替えに使う。
 * diagnose.js は 2/4 決め打ちだったが、実際には年により 2/3〜2/5 に振れる。
 */
export function getRisshunMs(year: number): number {
  const terms = getSolarTermsOfYear(year);
  const risshun = terms.find((t) => t.term.name === "立春");
  // SOLAR_TERMS に必ず含まれるため見つからないことはないが、型の保険
  return risshun ? risshun.ms : Date.UTC(year, 1, 4);
}
