import { useEffect, useRef, useState } from "react";
import { CAT_DISPLAY_MS, catUrl, type CatId } from "@/lib/ludo/cat-effects";
import { usePageVisible } from "@/lib/page-visibility";

export function CatMedia({
  cat,
  session,
  animated = true,
  onLoaded,
  className = "",
}: {
  cat: CatId;
  session: string;
  animated?: boolean;
  onLoaded?: (() => void) | undefined;
  className?: string;
}) {
  const visible = usePageVisible();
  const [failed, setFailed] = useState(false);
  const delivered = useRef(false);
  const loaded = () => {
    if (delivered.current) return;
    delivered.current = true;
    onLoaded?.();
  };
  const still = !animated || !visible || failed;
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

/** Resumed completed games show static artwork without replay. */
export function ResultCat({
  cat,
  animate,
  session,
}: {
  cat: CatId;
  animate: boolean;
  session: string;
}) {
  const [shown, setShown] = useState(true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!animate) return;
    const timer = window.setTimeout(() => setShown(false), loaded ? CAT_DISPLAY_MS : 10000);
    return () => window.clearTimeout(timer);
  }, [animate, loaded]);
  if (!shown) return null;
  return (
    <CatMedia
      cat={cat}
      session={session}
      animated={animate}
      onLoaded={() => setLoaded(true)}
      className="royal-result-cat"
    />
  );
}
