import { useEffect, useState } from "react";

type LeaseRelease = () => void;
let activeRelease: LeaseRelease | null = null;

export function takePreviewLease(release: LeaseRelease) {
  if (activeRelease && activeRelease !== release) activeRelease();
  activeRelease = release;
}

export function releasePreviewLease(release: LeaseRelease) {
  if (activeRelease === release) activeRelease = null;
}

const TRUE_HOVER_MQ = "(hover: hover) and (pointer: fine)";

export function useTrueHover() {
  const [trueHover, setTrueHover] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(TRUE_HOVER_MQ);
    const update = () => setTrueHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return trueHover;
}
