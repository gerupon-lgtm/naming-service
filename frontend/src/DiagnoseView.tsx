import { useEffect, useState, useCallback } from "react";
import {
  diagnose,
  fetchComment,
  ApiError,
  WUXING_JP,
  WUXING_BONUS_NOTE,
  type BirthInput,
  type DiagnosisResult,
  type Rank,
  type Sex,
} from "./api";
import { validateNameField } from "./validation";
import { PREFECTURE_OPTIONS } from "./prefectures";

// S-001（入力）と S-002（結果）。App のタブから呼ばれる。

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

export default function DiagnoseView() {
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

  // 四柱推命による五行ボーナス（F-015）用。すべて任意入力。
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [birthOpen, setBirthOpen] = useState(false);

  const run = useCallback(
    async (s: string, m: string, sx: Sex, birth: BirthInput = {}) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setComment(null);
    setToast("");
    try {
      const r = await diagnose(s, m, sx, birth);
      setResult(r);
      // 【重要】共有URLには生年月日を含めない（プライバシー方針）。
      // そのため共有URLで開いた結果には五行ボーナスが付かない（仕様）。
      const params = new URLSearchParams({ mode: "meimei", sei: s, mei: m, sex: sx });
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
  },
    []
  );

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
    // 未入力の項目は送らない（サーバー側で勝手に補完させない）
    void run(sei.trim(), mei.trim(), sex, {
      birthDate: birthDate || undefined,
      birthTime: birthTime || undefined,
      birthPlace: birthPlace || undefined,
    });
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
    // 四柱推命による五行ボーナス（F-015）。由来・星・注釈まで含めて出力する。
    if (r.wuxingBonus) {
      const b = r.wuxingBonus;
      lines.push(
        "",
        "■ 四柱推命による五行ボーナス（生年月日から算出）",
        `${b.stars}  ${b.label}`,
        `　あなたにとって吉となる五行: ${b.targetElements
          .map((e) => WUXING_JP[e] ?? e)
          .join(" → ")}`,
        `　この名前の五行: 総格${r.soukaku}画=${
          WUXING_JP[b.soukakuElement] ?? b.soukakuElement
        } ／ 三才=${b.sansaiElements.map((e) => WUXING_JP[e] ?? e).join("・")}`,
        `　${b.summary}`
      );
      if (b.levelHint) lines.push(`　${b.levelHint}`);
      lines.push(`　${WUXING_BONUS_NOTE}`);
    }
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
    <>
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

          {/* 四柱推命による五行ボーナス（F-015）。すべて任意入力。
              生年月日だけで判定できる。未入力でも従来どおり診断できる。 */}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="birthDate">生年月日（任意）</label>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <p className="field-hint">
              入力すると、生まれ持った五行のバランスを、姓名判断の結果とあわせて
              参考表示します（四柱推命の考え方）。空欄でもご利用いただけます。
            </p>
          </div>

          {birthDate && (
            <div className="field birth-detail">
              <button
                type="button"
                className="disclosure"
                aria-expanded={birthOpen}
                onClick={() => setBirthOpen((v) => !v)}
              >
                {birthOpen ? "▼" : "▶"} さらに詳しく（出生時刻・出生地／任意）
              </button>

              {birthOpen && (
                <div className="birth-detail__body">
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="birthTime">出生時刻（任意）</label>
                      <input
                        id="birthTime"
                        type="time"
                        value={birthTime}
                        onChange={(e) => setBirthTime(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="birthPlace">出生地（任意）</label>
                      <select
                        id="birthPlace"
                        value={birthPlace}
                        onChange={(e) => setBirthPlace(e.target.value)}
                      >
                        <option value="">指定しない</option>
                        {PREFECTURE_OPTIONS.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="field-hint">
                    未入力の項目は計算から除きます（推測で補うことはしません）。
                    出生時刻を入れると時柱まで、出生地も入れると時差の補正まで反映します。
                  </p>
                </div>
              )}
            </div>
          )}

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
            <div className="verdict">
              <div className={"verdict__rank rank--" + RANK_TONE[result.rank]}>
                {result.rank}
              </div>
              <div className="verdict__sub">
                総合運勢
                <span className="verdict__score">参考 {result.score}点</span>
              </div>
            </div>

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

            <div className="sansai">
              <div className="sansai__title">三才（五行の巡り）</div>
              <div className="sansai__row">
                <span className="sansai__cell">
                  天<b>{result.sansai.tenLabel}</b>
                </span>
                <span className="sansai__rel">{result.sansai.relationTenJin}</span>
                <span className="sansai__cell">
                  人<b>{result.sansai.jinLabel}</b>
                </span>
                <span className="sansai__rel">{result.sansai.relationJinChi}</span>
                <span className="sansai__cell">
                  地<b>{result.sansai.chiLabel}</b>
                </span>
                <span className={"cat cat--" + result.sansai.category}>
                  {result.sansai.categoryLabel}
                </span>
              </div>
              <p className="sansai__summary">{result.sansai.summary}</p>
            </div>

            {/* 四柱推命による五行ボーナス（F-015）。
                総合ランクの枠外に独立ブロックとして置き、スコアに影響しないことを
                見た目でも注釈でも明示する。生年月日の入力があるときだけ表示。 */}
            {result.wuxingBonus && (
              <section className="bonus" aria-labelledby="bonus-title">
                <div className="bonus__head">
                  <div>
                    <h3 className="bonus__title" id="bonus-title">
                      四柱推命による五行ボーナス
                    </h3>
                    <span className="bonus__origin">生年月日から算出（四柱推命）</span>
                  </div>
                  <div className="bonus__stars" aria-label={result.wuxingBonus.label}>
                    {result.wuxingBonus.stars}
                  </div>
                </div>

                <p className="bonus__label">{result.wuxingBonus.label}</p>

                <dl className="bonus__facts">
                  <div>
                    <dt>あなたにとって吉となる五行</dt>
                    <dd>
                      {result.wuxingBonus.targetElements
                        .map((e) => WUXING_JP[e] ?? e)
                        .join(" → ")}
                    </dd>
                  </div>
                  <div>
                    <dt>この名前の五行</dt>
                    <dd>
                      総格{result.soukaku}画=
                      {WUXING_JP[result.wuxingBonus.soukakuElement] ??
                        result.wuxingBonus.soukakuElement}
                      {" ／ 三才="}
                      {result.wuxingBonus.sansaiElements
                        .map((e) => WUXING_JP[e] ?? e)
                        .join("・")}
                    </dd>
                  </div>
                </dl>

                <p className="bonus__summary">{result.wuxingBonus.summary}</p>

                {result.wuxingBonus.levelHint && (
                  <p className="bonus__hint">{result.wuxingBonus.levelHint}</p>
                )}

                <p className="bonus__note">{WUXING_BONUS_NOTE}</p>
              </section>
            )}

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
    </>
  );
}
