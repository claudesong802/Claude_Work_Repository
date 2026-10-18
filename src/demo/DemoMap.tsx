// 덮개 밑 진짜 지도 — 열쇠 없는 공개 스타일(OpenFreeMap positron · 밝은 바탕).
// maplibre 는 나중에 불러온다: 덮개가 지도 묶음(수백 KB)을 기다리지 않고 먼저 뜨게.
import { useEffect, useRef } from "react";
// 작업자(worker)는 Vite 가 따로 묶어 주소만 넘긴다 — 묶음 안에서는 maplibre 가 제 자리를 못 찾는다
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function DemoMap({ onIdle }: { onIdle: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([{ Map, setWorkerUrl }]) => {
      if (cancelled || !boxRef.current) return;
      setWorkerUrl(workerUrl);
      const map = new Map({
        container: boxRef.current,
        style: STYLE_URL,
        center: [126.978, 37.5665],
        zoom: 12.5,
        attributionControl: { compact: true },
      });
      // 「load」 가 아니라 「idle」 — 타일까지 다 그려진 뒤라야 걷어도 빈 지도가 안 보인다
      map.once("idle", () => {
        if (!cancelled) onIdleRef.current();
      });
      remove = () => map.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  // maplibre 가 컨테이너에 position: relative 를 덮어쓴다 — 크기는 바깥 상자가 쥔다
  return (
    <div className="demo-map" data-testid="demo-map">
      <div ref={boxRef} className="demo-map-canvas" />
    </div>
  );
}
