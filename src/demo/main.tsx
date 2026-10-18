import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SEEN_KEY } from "../cover/coverclock";
import { Demo } from "./Demo";
import { readParams } from "./params";
import "./demo.css";

const params = readParams(window.location.search);

// ?fresh=1 — 같은 창 두 번째 표시를 지워 첫 접속처럼(덮개가 읽기 전에)
if (params.fresh) {
  try {
    window.sessionStorage.removeItem(SEEN_KEY);
  } catch {
    // 막혀 있으면 어차피 첫 접속 꼴로 뜬다
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo params={params} />
  </StrictMode>,
);
