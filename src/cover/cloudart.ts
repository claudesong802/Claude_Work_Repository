// 구름 그림 주소와 미리 받기. CloudCover 가 뜰 때(첫 화면) artReady() 를 불러 내려받기 · 해독을 시작한다.
// 그 전까지는 코드에 든 흐린 미리보기(cloudblur)가 구름을 그리므로 늦게 시작해도 흰 화면이 없다(10-19).
import billowy from "./assets/cloud-billowy.webp";
import curled from "./assets/cloud-curled.webp";
import diagonal from "./assets/cloud-diagonal.webp";
import original from "./assets/cloud-original.webp";
import wide from "./assets/cloud-wide.webp";
import wispy from "./assets/cloud-wispy.webp";
import type { ArtName } from "./cloudshape";

export const ART_URL: Record<ArtName, string> = {
  original,
  wide,
  billowy,
  diagonal,
  wispy,
  curled,
};

let ready: Promise<void> | null = null;

/** 모든 그림을 받아 해독(img.decode())까지 — 하나가 실패해도 나머지를 기다린 뒤 끝난다(덮개는 그림 없이도 돈다) */
export function artReady(): Promise<void> {
  if (ready) return ready;
  if (typeof Image === "undefined") return (ready = Promise.resolve());
  ready = Promise.all(
    Object.values(ART_URL).map((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img.decode().catch(() => undefined);
    }),
  ).then(() => undefined);
  return ready;
}
