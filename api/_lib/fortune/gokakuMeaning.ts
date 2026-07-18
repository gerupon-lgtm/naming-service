// 各格の役割・意味（固定説明）。表示とLLMコメントの材料に使う。

export type KakuKey =
  | "tenkaku"
  | "jinkaku"
  | "chikaku"
  | "gaikaku"
  | "soukaku";

export interface KakuInfo {
  key: KakuKey;
  label: string; // 専門名（天格 等）
  nickname: string; // やさしい呼び名
  plain: string; // 一言のやさしい説明
  role: string; // 何を表す格か（詳しい役割）
}

export const KAKU_INFO: Record<KakuKey, KakuInfo> = {
  tenkaku: {
    key: "tenkaku",
    label: "天格",
    nickname: "ルーツ運",
    plain: "生まれ持った家系の土台（姓の合計）",
    role: "家系・先祖から受け継ぐ運。姓に由来し、本人の努力では変えにくい土台。",
  },
  jinkaku: {
    key: "jinkaku",
    label: "人格",
    nickname: "本質（中心）",
    plain: "あなたらしさ・才能・仕事運。最も重要",
    role: "性格・才能・中年期の運。姓名判断の中心となり、その人らしさを最もよく表す。",
  },
  chikaku: {
    key: "chikaku",
    label: "地格",
    nickname: "若年運",
    plain: "幼〜青年期の運と才能の芽（名の合計）",
    role: "幼年〜青年期の運。家庭や愛情面、素質の傾向を表す。",
  },
  gaikaku: {
    key: "gaikaku",
    label: "外格",
    nickname: "対人運",
    plain: "まわりとの関係・第一印象（外側の文字）",
    role: "対人関係・社会運。周囲からの影響や、外から見た印象を表す。",
  },
  soukaku: {
    key: "soukaku",
    label: "総格",
    nickname: "総合運",
    plain: "人生全体・晩年の運（全文字の合計）",
    role: "人生全体・晩年運。すべての画数の合計で、総合的な運勢を示す。",
  },
};

export const KAKU_ORDER: KakuKey[] = [
  "tenkaku",
  "jinkaku",
  "chikaku",
  "gaikaku",
  "soukaku",
];
