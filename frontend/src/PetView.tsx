import { useEffect, useState, useCallback } from "react";
import {
  suggest,
  fetchCategories,
  fetchPetComment,
  ApiError,
  PET_TARGET_LABEL,
  type SuggestItem,
  type SuggestQuery,
  type PetTarget,
  type NameType,
} from "./api";

// S-003（条件入力）と S-004（候補一覧＋各候補のLLMコメント）。

const TARGETS: { value: PetTarget; label: string }[] = [
  { value: "dog", label: "犬" },
  { value: "cat", label: "猫" },
  { value: "small", label: "小動物" },
];
const SEX_OPTIONS: { value: "" | "male" | "female"; label: string }[] = [
  { value: "", label: "指定なし" },
  { value: "male", label: "男の子" },
  { value: "female", label: "女の子" },
];
const CHAR_TYPES: { value: NameType; label: string }[] = [
  { value: "kanji", label: "漢字" },
  { value: "hiragana", label: "ひらがな" },
  { value: "katakana", label: "カタカナ" },
];
const FORTUNE_TONE: Record<string, string> = {
  daikichi: "daikichi",
  kichi: "kichi",
  hankichi: "hankichi",
  kyo: "kyo",
};

type CommentState = "loading" | string | null;

export default function PetView() {
  const [target, setTarget] = useState<PetTarget>("dog");
  const [sex, setSex] = useState<"" | "male" | "female">("");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [includeChars, setIncludeChars] = useState("");
  const [reading, setReading] = useState("");
  const [charTypes, setCharTypes] = useState<NameType[]>([]);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SuggestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentState>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 2000);
  };

  const buildQuery = useCallback(
    (): SuggestQuery => ({
      target,
      sex: sex || undefined,
      categories: selectedCats.length ? selectedCats : undefined,
      includeChars: includeChars.trim() ? [includeChars.trim()] : undefined,
      charTypes: charTypes.length ? charTypes : undefined,
      reading: reading.trim() || undefined,
      // 件数は API 側の設定値 SUGGEST_DEFAULT_COUNT（既定8）に従う
    }),
    [target, sex, selectedCats, includeChars, charTypes, reading]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setItems(null);
    setComments({});
    setToast("");
    const q = buildQuery();
    try {
      const res = await suggest(q);
      setItems(res);
      // コメントは「よみ」で決まるので、同じよみは1回だけ生成して共有（統一）。
      // サーバー負荷とAIの暴走を避けるため、順番に（段階的に）リクエストする。
      const readings = Array.from(new Set(res.map((it) => it.reading)));
      const init: Record<string, CommentState> = {};
      for (const r of readings) init[r] = "loading";
      setComments(init);
      void (async () => {
        for (const r of readings) {
          const c = await fetchPetComment(r, q); // 1件ずつ順次
          setComments((prev) => ({ ...prev, [r]: c }));
        }
      })();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "候補の生成に失敗しました。しばらくしてから再度お試しください。"
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleCat = (c: string) =>
    setSelectedCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const toggleType = (t: NameType) =>
    setCharTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const listText = (its: SuggestItem[]) => {
    const lines = [
      `◆ ${PET_TARGET_LABEL[target]}の名前候補`,
      sex ? `向き: ${sex === "male" ? "男の子" : "女の子"}` : "",
      selectedCats.length ? `雰囲気: ${selectedCats.join("・")}` : "",
      "",
    ].filter(Boolean);
    its.forEach((it, i) => {
      lines.push(
        `${i + 1}. ${it.name}（${it.reading}）  ${it.strokeTotal}画 = ${it.fortuneLabel}`
      );
      if (it.reasons.length) lines.push(`　　${it.reasons.join("・")}`);
      const c = comments[it.reading];
      if (typeof c === "string" && c) lines.push(`　　${c}`);
    });
    lines.push("", "※ 姓名判断は参考としてお楽しみください。");
    return lines.join("\n");
  };

  const copyList = async (its: SuggestItem[]) => {
    await navigator.clipboard.writeText(listText(its));
    flash("候補一覧をコピーしました");
  };
  const downloadList = (its: SuggestItem[]) => {
    const blob = new Blob([listText(its)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ペット名候補_${PET_TARGET_LABEL[target]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    flash("ファイルを保存しました");
  };

  return (
    <>
      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label>対象</label>
          <div className="segmented">
            {TARGETS.map((t) => (
              <button
                type="button"
                key={t.value}
                className={"segmented__btn" + (target === t.value ? " is-active" : "")}
                onClick={() => setTarget(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>性別（重視されます）</label>
          <div className="segmented">
            {SEX_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                className={"segmented__btn" + (sex === o.value ? " is-active" : "")}
                onClick={() => setSex(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>雰囲気（複数選択可）</label>
            <div className="chips-select">
              {categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={"pill" + (selectedCats.includes(c) ? " is-active" : "")}
                  onClick={() => toggleCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="inc">使いたい文字（任意）</label>
            <input
              id="inc"
              value={includeChars}
              onChange={(e) => setIncludeChars(e.target.value)}
              placeholder="も、ら"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="rd">希望のよみ（任意）</label>
            <input
              id="rd"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              placeholder="もも"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>出力文字種（未選択なら全部）</label>
          <div className="chips-select">
            {CHAR_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                className={"pill" + (charTypes.includes(t.value) ? " is-active" : "")}
                onClick={() => toggleType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? "考えています…" : "名前を提案してもらう"}
        </button>
      </form>

      {loading && (
        <div className="progress" role="status" aria-live="polite">
          <div className="spinner" />
          ぴったりの名前をさがしています…
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {items && !loading && (
        <section className="result">
          {items.length === 0 ? (
            <div className="card">
              <p>条件に合う候補が見つかりませんでした。使いたい文字や文字種をゆるめてみてください。</p>
            </div>
          ) : (
            <>
              {items.map((it) => {
                const c = comments[it.reading];
                return (
                  <div className="petcard" key={it.name}>

                    <div className="petcard__head">
                      <div className="petcard__name">
                        {it.name}
                        <span className="petcard__reading">{it.reading}</span>
                      </div>
                      <div className="petcard__right">
                        <span className="petcard__strokes">
                          {it.strokeTotal}
                          <small>画</small>
                        </span>
                        <span className={"cat cat--" + (FORTUNE_TONE[it.fortune] ?? "kyo")}>
                          {it.fortuneLabel}
                        </span>
                      </div>
                    </div>
                    {it.reasons.length > 0 && (
                      <div className="petcard__reasons">
                        {it.reasons.map((r, i) => (
                          <span className="reason" key={i}>
                            {r}
                          </span>
                        ))}
                        {it.source === "dynamic" && (
                          <span className="reason reason--dyn">よみから生成</span>
                        )}
                      </div>
                    )}
                    {c === "loading" && (
                      <div className="comment comment--pending">
                        <span className="comment__dot" />
                        コメント生成中…
                      </div>
                    )}
                    {typeof c === "string" && c && (
                      <div className="comment">{c}</div>
                    )}
                  </div>
                );
              })}

              <div className="actions">
                <button className="btn" onClick={() => downloadList(items)}>
                  一覧をファイルに保存
                </button>
                <button className="btn" onClick={() => copyList(items)}>
                  一覧をコピー
                </button>
              </div>
              <div className="toast" aria-live="polite">
                {toast}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
