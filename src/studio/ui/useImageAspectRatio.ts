// file: src/studio/ui/useImageAspectRatio.ts
//
// Measures an <img>'s REAL aspect ratio from its own naturalWidth/
// naturalHeight once it loads, instead of trusting a hardcoded per-side
// table (placement-config.ts's getTemplateAspectRatio, which is a static
// { front: 1, back: 1024/1536 } guess). That table went stale the moment
// the underlying template PNGs on disk were swapped for differently-shaped
// photos (front went from a 2480x2480 square to a ~1118x2353 portrait, for
// example) -- the front/back preview size mismatch the user kept reporting
// persisted through multiple CSS fixes because the CONTAINER was still
// being sized from the wrong, stale ratio, no matter how correctly the
// image itself was told to fill that container.
//
// Usage: pass the current image src and a fallback ratio to use before the
// real image has loaded (avoids a layout flash of the wrong shape). Once
// the image loads, the real measured ratio takes over and stays cached per
// src so switching between already-seen front/back images doesn't re-flash.
import { useEffect, useState } from "react";

const ratioCache = new Map<string, number>();

export function useImageAspectRatio(src: string | null | undefined, fallback: number): number {
  const [ratio, setRatio] = useState<number>(() => {
    if (src && ratioCache.has(src)) return ratioCache.get(src)!;
    return fallback;
  });

  useEffect(() => {
    if (!src) {
      setRatio(fallback);
      return;
    }

    const cached = ratioCache.get(src);
    if (cached) {
      setRatio(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const measured = img.naturalWidth / img.naturalHeight;
        ratioCache.set(src, measured);
        setRatio(measured);
      }
    };
    img.onerror = () => {
      if (!cancelled) setRatio(fallback);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
    // fallback intentionally excluded -- changing the fallback shouldn't
    // re-trigger a network load of the same src.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return ratio;
}
