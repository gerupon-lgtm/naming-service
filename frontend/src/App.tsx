import { useEffect, useState, useCallback } from "react";
import {
  diagnose,
  fetchComment,
  ApiError,
  type DiagnosisResult,
} from "./api";
import { validateNameField } from "./validation";

// S-001（入力）と S-002（結果）を1コンポーネントで表現する。
// F-006 URL共有: 診断条件を ?sei=..&mei=.. に埋め込み、直接アクセス時に再計算する。

const RANK_LABEL: Record<DiagnosisResult["rank"], string> = {
  SS: "SS ・最高",
  S: "S ・優",
  A: "A ・良",
  B: "B ・可",
  C: "C ・要注意",
};

const GOKAKU_FIELDS: { key: keyof DiagnosisResult; label: string }[] = [
  { key: "tenkaku", label: "天格" },
  { key: "jinkaku", label: "人格" },
  { key: "chikaku", label: "地格" },
  { key: "gaikaku", label: "外格" },
  { key: "soukaku", label: "総格" },
];

interface ErrState {
  message: string;
  recoverable: boolean; // true: 表記を変えて再入力を促す
}

export default function App() {
  const [sei, setSei] = useState("");
  const [mei, setMei] = useState("");
  const [seiErr, setSeiErr] = useState<string | null>(null);
  const [meiErr, setMeiErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<ErrState | null>(null);
  const [comment, setComment] = useState<"loading" | string | null>(null);
  const [toast, setToast] = useState("");

  const run = useCallback(async (s: string, m: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setComment(null);
    setToast("");
    try {
      const r = await diagnose(s, m);
      setResult(r);
      // F-006: URLに条件を反映（結果自体は保存せず再計算で再現）
      const params = new URLSearchParams({ sei: s, mei: m });
      window.history.replaceState(null, "", `?${params.toString()}`);
      // F-012: 診断結果は即時表示。コメントは非同期で後追い表示
      setComment("loading");
      fetchComment(r, s, m).then(setComment);
    } catch (e) {
      if (e instanceof ApiError) {
        // DIAGNOSIS_UNAVAILABLE / INVALID_INPUT は表記を変えれば回復可能
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
    if (s && m) {
      setSei(s);
      setMei(m);
      void run(s, m);
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
    !loading &&
    sei.trim() !== "" &&
    mei.trim() !== "" &&
    !seiErr &&
    !meiErr;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void run(sei.trim(), mei.trim());
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

  const asText = (r: DiagnosisResult) =>
    [
      "姓名診断結果（熊崎式）",
      `姓名: ${sei} ${mei}`,
      `総合点: ${r.score} / ランク: ${r.rank}`,
      `天格: ${r.tenkaku}  人格: ${r.jinkaku}  地格: ${r.chikaku}`,
      `外格: ${r.gaikaku}  総格: ${r.soukaku}`,
    ].join("\n");

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
          {(seiErr || meiErr) && (
            <p className="field-error">{seiErr ?? meiErr}</p>
          )}
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
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

            <div className="gokaku">
              {GOKAKU_FIELDS.map((f) => (
                <div className="gokaku__cell" key={f.key}>
                  <div className="gokaku__label">{f.label}</div>
                  <div className="gokaku__value">{result[f.key]}</div>
                </div>
              ))}
            </div>
            <p className="gokaku__note">数字は各格の画数です</p>

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
