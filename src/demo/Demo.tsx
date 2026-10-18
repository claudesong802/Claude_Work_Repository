import { useEffect, useState } from "react";
import { CloudCover } from "../cover/CloudCover";
import { DebugPanel } from "./DebugPanel";
import { DemoMap } from "./DemoMap";
import type { DemoParams } from "./params";

/** 덮개 밑에 지도 하나 · 주소 칸 갈래대로 준비 신호와 note 를 낸다 */
export function Demo({ params }: { params: DemoParams }) {
  const [mapIdle, setMapIdle] = useState(params.noMap);
  const [idleAt, setIdleAt] = useState<number | null>(null);
  const [warm, setWarm] = useState(params.warmMs > 0);
  const [ready, setReady] = useState(false);
  const [coverGone, setCoverGone] = useState(false);

  useEffect(() => {
    if (!warm) return;
    const t = setTimeout(() => setWarm(false), params.warmMs);
    return () => clearTimeout(t);
  }, [warm, params.warmMs]);

  // 준비 = 지도 idle · 서버 준비 끝 · 그 뒤 delay 만큼 — hang 이면 끝내 안 옴
  useEffect(() => {
    if (params.hang || !mapIdle || warm) return;
    const t = setTimeout(() => setReady(true), params.delayMs);
    return () => clearTimeout(t);
  }, [params.hang, params.delayMs, mapIdle, warm]);

  return (
    <>
      {params.noMap ? <div className="demo-map" data-testid="demo-map" /> : (
        <DemoMap
          onIdle={() => {
            setIdleAt(performance.now());
            setMapIdle(true);
          }}
        />
      )}
      {coverGone ? null : (
        <CloudCover
          ready={ready}
          note={warm ? "서버 준비 중" : null}
          capMs={params.capMs}
          design={params.design}
          reducedMotion={params.reduced ? true : undefined}
          onGone={() => setCoverGone(true)}
        />
      )}
      {params.debug ? <DebugPanel params={params} ready={ready} idleAt={idleAt} /> : null}
    </>
  );
}
