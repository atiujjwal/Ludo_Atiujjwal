import { useRef, useState } from "react";
import { catUrl, type CatId } from "@/lib/ludo/cat-effects";
import { usePageVisible } from "@/lib/page-visibility";
import { useAdaptiveStaticEffects } from "@/lib/ludo/adaptive-effects";

export function CatMedia({
  cat,
  session,
  animated = true,
  onLoaded,
  className = "",
  matchId = 0,
}: {
  cat: CatId;
  session: string;
  animated?: boolean;
  onLoaded?: (() => void) | undefined;
  className?: string;
  matchId?: number;
}) {
  const visible = usePageVisible();
  const adaptiveStill = useAdaptiveStaticEffects(matchId, animated && visible);
  const [failed, setFailed] = useState(false);
  const delivered = useRef(false);
  const loaded = () => {
    if (delivered.current) return;
    delivered.current = true;
    onLoaded?.();
  };
  const still = !animated || !visible || failed || adaptiveStill;
  return (
    <picture className={`royal-cat-media ${className}`} aria-hidden="true" data-cat={cat}>
      <source media="(prefers-reduced-motion: reduce)" srcSet={catUrl(cat, true)} />
      <img
        src={`${catUrl(cat, still)}?effect=${encodeURIComponent(session)}`}
        alt=""
        width="320"
        height="320"
        onLoad={loaded}
        onError={() => {
          setFailed(true);
          loaded();
        }}
      />
    </picture>
  );
}
