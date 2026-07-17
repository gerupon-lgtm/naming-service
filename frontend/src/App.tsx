import { useEffect, useState, useCallback } from "react";
import {
  diagnose,
  fetchComment,
  ApiError,
  type DiagnosisResult,
  type Sex,
} from "./api";
import { validateNameField } from "./validation";

// S-001（入力）と S-002（結果）を1コンポーネントで表現する。
// F-006 URL共有: 診断条件を ?sei=..&mei=..&sex=.. に埋め込み、直接アクセス時に再計算する。

const RANK_LABEL: Record<DiagnosisResult["rank"], string> = {
  SS: "SS ・最高",
  S: "S ・優",
  A: "A ・良",
  B: "B ・可",
  C: "C ・要注意",
};

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "unspecified", label: "未指定" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
];

interface ErrState {
  message: string;
  recoverable: boolean;
}

export default function App() {
  const [sei, setSei] = useState("");
  const [mei, setMei] = useState("");
  const [sex, setSex] = useState<Sex>("unspecified");
  const [seiErr, setSeiErr] = useState<string | null>(null);
  const [meiErr, setMeiErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<ErrState | null>(null);
  const [comment, setComment] = useState<"loading" | string | null>(null);
  const [toast, setToast] = useState("");

  const run = useCallback(async (s: string, m: string, sx: Sex) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setComment(null);
    setToast("");
    try {
      const r = await diagnose(s, m, sx);
      setResult(r);
      const params = new URLSearchParams({ sei: s, mei: m, sex: sx });
      window.history.replaceState(null, "", `?${params.toString()}`);
      setComment("loading");
      fetchComment(r, s, m).then(setComment);
    } catch (e) {
      if (e instanceof ApiError) {
        const recoverable =
          e.code === "DIAGNOSIS_UNAVAILABLE" || e.code === "INVALID_INPUT";
        setError({ message: e.message, recoverable });
      } else {
        setError({
          message: "診断に失敗しました。しばらくしてから再度お試しください。",
          recoverable: false,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 共有URLで開かれた場合、パラメータから再計算する
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("sei") ?? "";
    const m = p.get("mei") ?? "";
    const rawSex = p.get("sex");
    const sx: Sex =
      rawSex === "male" || rawSex === "female" ? rawSex : "unspecified";
    if (s && m) {
      setSei(s);
      setMei(m);
      setSex(sx);
      void run(s, m, sx);
    }
  }, [run]);

  const onChangeSei = (v: string) => {
    setSei(v);
    setSeiErr(validateNameField(v, "姓"));
  };
  const onChangeMei = (v: string) => {
    setMei(v);
    setMeiErr(validateNameField(v, "名"));
  };

  const canSubmit =
    !loading && sei.trim() !== "" && mei.trim() !== "" && !seiErr && !meiErr;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void run(sei.trim(), mei.trim(), sex);
  };

  const backToInput = () => {
    setResult(null);
    setError(null);
    setComment(null);
    setToast("");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2000);
  };

  const asText = (r: DiagnosisResult) => {
    const lines = [
      "姓名診断結果（熊崎式）",
      `姓名: ${sei} ${mei}`,
      `総合点: ${r.score} / ランク: ${r.rank}`,
      "",
      "【五格】",
      ...r.details.map(
        (d) =>
          `${d.label}: ${d.strokes}画（${d.categoryLabel}） ${d.keyword}／${d.summary}`
      ),
      "",
      `【三才】天=${r.sansai.tenLabel}・人=${r.sansai.jinLabel}・地=${r.sansai.chiLabel}（${r.sansai.categoryLabel}）`,
      r.sansai.summary,
    ];
    return lines.join("\n");
  };

  const copyResult = async (r: DiagnosisResult) => {
    await navigator.clipboard.writeText(asText(r));
    flash("結果をコピーしました");
  };

  const copyShareUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    flash("共有URLをコピーしました");
  };

  const download = (r: DiagnosisResult) => {
    const blob = new Blob([asText(r)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `姓名診断_${sei}${mei}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    flash("ファイルを保存しました");
  };

  const showInput = !result && !loading;

  return (
    <main className="app">
      <h1 className="app__title">姓名診断</h1>
      <p className="app__subtitle">熊崎式・無料</p>

      {showInput && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <div className="field-row">
            <div className="field">
              <label htmlFor="sei">姓</label>
              <input
                id="sei"
                value={sei}
                onChange={(e) => onChangeSei(e.target.value)}
                placeholder="山田"
                autoComplete="off"
                aria-invalid={!!seiErr}
              />
            </div>
            <div className="field">
              <label htmlFor="mei">名</label>
              <input
                id="mei"
                value={mei}
                onChange={(e) => onChangeMei(e.target.value)}
                placeholder="太郎"
                autoComplete="off"
                aria-invalid={!!meiErr}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>性別（任意）</label>
            <div className="segmented">
              {SEX_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className={
                    "segmented__btn" + (sex === o.value ? " is-active" : "")
                  }
                  onClick={() => setSex(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="field-hint">
              画数の計算には影響しません。一部の画数の吉凶の見方にのみ反映します。
            </p>
          </div>

          {(seiErr || meiErr) && (
            <p className="field-error">{seiErr ?? meiErr}</p>
          )}
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canSubmit}
          >
            診断する
          </button>
        </form>
      )}

      {loading && (
        <div className="progress" role="status" aria-live="polite">
          <div className="spinner" />
          診断しています。少しお待ちください…
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          <button className="btn" onClick={backToInput}>
            {error.recoverable ? "表記を変えて試す" : "入力に戻る"}
          </button>
        </div>
      )}

      {result && !loading && (
        <section className="result">
          <div className="card">
            <div className="score">
              <div className="score__num">{result.score}</div>
              <div className="score__rank">{RANK_LABEL[result.rank]}</div>
            </div>

            {/* 各格の詳細 */}
            <div className="kaku-list">
              {result.details.map((d) => (
                <div className="kaku" key={d.key}>
                  <div className="kaku__head">
                    <span className="kaku__label">{d.label}</span>
                    <span className="kaku__strokes">{d.strokes}画</span>
                    <span
                      className={
                        "kaku__badge kaku__badge--" + d.category
                      }
                    >
                      {d.categoryLabel}
                    </span>
                  </div>
                  <div className="kaku__role">{d.role}</div>
                  <div className="kaku__meaning">
                    <b>{d.keyword}</b> — {d.summary}
                  </div>
                  {d.caution && <div className="kaku__caution">{d.caution}</div>}
                </div>
              ))}
            </div>

            {/* 三才配置（五行） */}
            <div className="sansai">
              <div className="sansai__title">三才配置（五行）</div>
              <div className="sansai__row">
                <span className="sansai__cell">
                  天<b>{result.sansai.tenLabel}</b>
                </span>
                <span className="sansai__rel">
                  {result.sansai.relationTenJin}
                </span>
                <span className="sansai__cell">
                  人<b>{result.sansai.jinLabel}</b>
                </span>
                <span className="sansai__rel">
                  {result.sansai.relationJinChi}
                </span>
                <span className="sansai__cell">
                  地<b>{result.sansai.chiLabel}</b>
                </span>
                <span className="kaku__badge kaku__badge--info">
                  {result.sansai.categoryLabel}
                </span>
              </div>
              <p className="sansai__summary">{result.sansai.summary}</p>
            </div>

            {/* F-012 LLM解説コメント（非同期・失敗時は非表示） */}
            {comment === "loading" && (
              <div className="comment comment--pending">
                <span className="comment__dot" />
                コメント生成中…
              </div>
            )}
            {typeof comment === "string" && comment && (
              <div className="comment">{comment}</div>
            )}
          </div>

          <div className="actions">
            <button className="btn" onClick={() => download(result)}>
              ファイルに保存
            </button>
            <button className="btn" onClick={() => copyResult(result)}>
              結果をコピー
            </button>
            <button className="btn" onClick={copyShareUrl}>
              共有URLをコピー
            </button>
          </div>
          <div className="toast" aria-live="polite">
            {toast}
          </div>
          <div className="actions">
            <button className="btn btn--link" onClick={backToInput}>
              もう一度診断する
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
