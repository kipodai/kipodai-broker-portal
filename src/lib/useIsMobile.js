import { useEffect, useState } from 'react';

const QUERY = '(max-width: 480px)';

// Charts need real per-breakpoint prop changes (axis width, tick font size,
// tick interval) that CSS alone can't reach into Recharts' SVG measurements.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
