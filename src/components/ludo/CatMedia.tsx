import { useRef, useState } from "react";
import { catUrl, type CatId } from "@/lib/ludo/cat-effects";
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
