import { useState, useEffect } from "react";
import DiagnoseView from "./DiagnoseView";
import PetView from "./PetView";
import { APP_VERSION, fetchVersion, type VersionInfo } from "./api";

type Mode = "meimei" | "pet";

export default function App() {
  const [ver, setVer] = useState<VersionInfo | null>(null);
  useEffect(() => {
    fetchVersion().then(setVer);
  }, []);
  // URL の ?mode=pet で初期タブを切替可能（共有URL対応）
  const initial: Mode =
    new URLSearchParams(window.location.search).get("mode") === "pet"
      ? "pet"
      : "meimei";
  const [mode, setMode] = useState<Mode>(initial);

  const switchTo = (m: Mode) => {
    setMode(m);
    const params = new URLSearchParams();
    if (m === "pet") params.set("mode", "pet");
    window.history.replaceState(
      null,
      "",
      params.toString() ? `?${params.toString()}` : window.location.pathname
    );
  };

  return (
    <main className="app">
      <h1 className="app__title">
        {mode === "meimei" ? "姓名診断" : "ペットの名づけ"}
      </h1>
      <p className="app__subtitle">熊崎式・無料</p>

      <nav className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "meimei"}
          className={"tab" + (mode === "meimei" ? " is-active" : "")}
          onClick={() => switchTo("meimei")}
        >
          姓名診断
        </button>
        <button
          role="tab"
          aria-selected={mode === "pet"}
          className={"tab" + (mode === "pet" ? " is-active" : "")}
          onClick={() => switchTo("pet")}
        >
          ペットの名づけ
        </button>
      </nav>

      {mode === "meimei" ? <DiagnoseView /> : <PetView />}

      <footer className="appfoot">
        {ver?.version ?? APP_VERSION}
        {ver?.llm ? `　${ver.llm.provider}:${ver.llm.model}` : ""}
      </footer>
    </main>
  );
}
