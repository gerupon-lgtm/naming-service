import { useEffect, useState, useCallback } from "react";
import {
  diagnose,
  fetchComment,
  ApiError,
  type DiagnosisResult,
  type Rank,
  type Sex,
} from "./api";
import { validateNameField } from "./validation";

// S-001（入力）と S-002（結果）を1コンポーネントで表現する。
// F-006 URL共有: 診断条件を ?sei=..&mei=..&sex=.. に埋め込み、直接アクセス時に再計算する。

// 総合ランク（言葉）→ 表示トーン。生々しい点数の代わりに言葉を主役にする。
const RANK_TONE: Record<Rank, string> = {
  大吉: "daikichi",
  吉: "kichi",
  中吉: "chukichi",
  小吉: "shokichi",
  末吉: "suekichi",
  凶: "kyo",
};

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "unspecified", label: "未指定" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
];
const SEX_LABEL: Record<Sex, string> = {
  male: "男性",
  female: "女性",
  unspecified: "未指定",
};

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
    const lines: string[] = [
      "◆ 姓名診断結果（熊崎式）",
      `お名前: ${sei} ${mei}　／　性別: ${SEX_LABEL[r.sex]}`,
      `総合運勢: 【${r.rank}】（参考スコア ${r.score}点）`,
      "",
      "■ 五格 — 画数の成り立ちと運勢",
    ];
    for (const d of r.details) {
      const star = d.key === "jinkaku" ? "★" : "　";
      const parts = d.members.map((i) => r.chars[i]?.char ?? "").join("＋");
      const reisu = d.reisu ? "＋霊数" : "";
      lines.push(
        `${star}${d.nickname}（${d.label}）  ${d.strokes}画 = ${d.categoryLabel}`,
        `　　${d.plain}`,
        `　　成り立ち: ${parts}${reisu}　象意: ${d.keyword} — ${d.summary}`
      );
      if (d.caution) lines.push(`　　※ ${d.caution}`);
    }
    lines.push(
      "",
      "■ 三才 — 五行の巡り",
      `天=${r.sansai.tenLabel}・人=${r.sansai.jinLabel}・地=${r.sansai.chiLabel}  （${r.sansai.categoryLabel}）`,
      `　天と人=${r.sansai.relationTenJin}、人と地=${r.sansai.relationJinChi}`,
      `　${r.sansai.summary}`
    );
    // LLM解説コメント（生成済みのときのみ含める）
    if (typeof comment === "string" && comment) {
      lines.push("", "■ 解説コメント", comment);
    } else if (comment === "loading") {
      lines.push("", "■ 解説コメント", "（生成中のため未収録。少し待って再度保存/コピーすると含まれます）");
    }
    lines.push("", "※ 姓名判断は参考としてお楽しみください。");
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
            {/* 総合運勢は言葉を主役に。点数は控えめ */}
            <div className="verdict">
              <div className={"verdict__rank rank--" + RANK_TONE[result.rank]}>
                {result.rank}
              </div>
              <div className="verdict__sub">
                総合運勢
                <span className="verdict__score">参考 {result.score}点</span>
              </div>
            </div>

            {/* 名前の文字 */}
            <div className="namebar">
              {result.chars.map((c, i) => (
                <div className="namebar__tile" key={i}>
                  <div className="namebar__char">{c.char}</div>
                  <div className="namebar__meta">
                    {c.part === "sei" ? "姓" : "名"}・{c.strokes}画
                  </div>
                </div>
              ))}
            </div>

            {/* 格の成り立ち（どの文字がこの格を作るか） */}
            <div className="lanes">
              {result.details.map((d) => (
                <div
                  className={"lane" + (d.key === "jinkaku" ? " lane--star" : "")}
                  key={d.key}
                >
                  <div className="lane__head">
                    <div className="lane__names">
                      <span className="lane__nick">
                        {d.nickname}
                        {d.key === "jinkaku" && (
                          <span className="lane__badge">中心</span>
                        )}
                      </span>
                      <span className="lane__tech">{d.label}</span>
                    </div>
                    <div className="lane__chips">
                      {result.chars.map((c, i) => (
                        <span
                          key={i}
                          className={
                            "chip" + (d.members.includes(i) ? " chip--on" : "")
                          }
                        >
                          {c.char}
                        </span>
                      ))}
                      {d.reisu && <span className="chip chip--reisu">霊</span>}
                    </div>
                    <div className="lane__right">
                      <span className="lane__strokes">
                        {d.strokes}
                        <small>画</small>
                      </span>
                      <span className={"cat cat--" + d.category}>
                        {d.categoryLabel}
                      </span>
                    </div>
                  </div>
                  <div className="lane__plain">
                    {d.plain}｜{d.keyword} — {d.summary}
                  </div>
                  {d.caution && <div className="kaku__caution">{d.caution}</div>}
                </div>
              ))}
            </div>

            {/* 三才配置（五行） */}
            <div className="sansai">
              <div className="sansai__title">三才（五行の巡り）</div>
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
                <span className={"cat cat--" + result.sansai.category}>
                  {result.sansai.categoryLabel}
                </span>
              </div>
              <p className="sansai__summary">{result.sansai.summary}</p>
            </div>

            {/* F-012 LLM解説コメント */}
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
