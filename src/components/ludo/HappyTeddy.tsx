import { useEffect, useState } from "react";

/** A brief victory flourish; never drives game state or keeps animating forever. */
export function HappyTeddy() {
  const [loaded, setLoaded] = useState(false);
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnimated(false), loaded ? 5000 : 10000);
    return () => window.clearTimeout(timer);
  }, [loaded]);
  return (
    <picture className="royal-happy-teddy" aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet="/happy_teddy-still.png" />
      <img
        src={animated ? "/happy_teddy.gif" : "/happy_teddy-still.png"}
        alt=""
        width="512"
        height="512"
        onLoad={() => setLoaded(true)}
        onError={() => setAnimated(false)}
      />
    </picture>
  );
}
