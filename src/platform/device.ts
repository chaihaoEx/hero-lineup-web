import { useEffect, useState } from "react";

type DeviceSignals = {
  userAgent: string;
  userAgentDataMobile?: boolean | undefined;
  maxTouchPoints: number;
  coarsePointer: boolean;
  viewportWidth: number;
};

const mobileUserAgent = /Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile.*Firefox|HarmonyOS.+Mobile/i;

export function shouldUseMobileInterface({
  userAgent,
  userAgentDataMobile,
  maxTouchPoints,
  coarsePointer,
  viewportWidth,
}: DeviceSignals): boolean {
  if (userAgentDataMobile === true) return true;
  if (mobileUserAgent.test(userAgent)) return true;

  // Covers smaller touch-first handsets whose embedded browsers use a custom UA.
  return coarsePointer && maxTouchPoints > 0 && viewportWidth <= 767;
}

function readDeviceSignals(): DeviceSignals {
  const userAgentData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    userAgent: navigator.userAgent,
    userAgentDataMobile: userAgentData.userAgentData?.mobile,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
  };
}

function detectCurrentInterface(): boolean {
  const previewMode = new URLSearchParams(window.location.search).get("ui");
  if (previewMode === "mobile") return true;
  if (previewMode === "desktop") return false;
  return shouldUseMobileInterface(readDeviceSignals());
}

export function useMobileInterface(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && detectCurrentInterface());

  useEffect(() => {
    const pointerQuery = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : undefined;
    const update = () => setMobile(detectCurrentInterface());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("popstate", update);
    pointerQuery?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("popstate", update);
      pointerQuery?.removeEventListener?.("change", update);
    };
  }, []);

  return mobile;
}
