// 各格の役割・意味（固定説明）。表示とLLMコメントの材料に使う。

export type KakuKey =
  | "tenkaku"
  | "jinkaku"
  | "chikaku"
  | "gaikaku"
  | "soukaku";

export interface KakuInfo {
  key: KakuKey;
  label: string;
  role: string; // 何を表す格か（役割）
}

export const KAKU_INFO: Record<KakuKey, KakuInfo> = {
  tenkaku: {
    key: "tenkaku",
    label: "天格",
    role: "家系・先祖から受け継ぐ運。姓に由来し、本人の努力では変えにくい土台。",
  },
  jinkaku: {
    key: "jinkaku",
    label: "人格",
    role: "性格・才能・中年期の運。姓名判断の中心となり、その人らしさを最もよく表す。",
  },
  chikaku: {
    key: "chikaku",
    label: "地格",
    role: "幼年〜青年期の運。家庭や愛情面、素質の傾向を表す。",
  },
  gaikaku: {
    key: "gaikaku",
    label: "外格",
    role: "対人関係・社会運。周囲からの影響や、外から見た印象を表す。",
  },
  soukaku: {
    key: "soukaku",
    label: "総格",
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
