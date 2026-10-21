import { useEffect, useRef } from 'react';
import { useCRMContext } from '@/contexts/CRMContext';
import { countOpenJobs } from '@/lib/research';

const POLL_MS = 30_000;

/**
 * While AI research jobs are queued or running, re-load data whenever some
 * finish, so the app shows (and never saves over) what the research wrote.
 */
export function ResearchWatcher() {
  const { dataStatus, refreshData } = useCRMContext();
  const lastOpen = useRef<number | null>(null);

  useEffect(() => {
    if (dataStatus !== 'ready') return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const open = await countOpenJobs();
        if (cancelled) return;
        if (lastOpen.current !== null && open < lastOpen.current) refreshData();
        lastOpen.current = open;
      } catch {
        // Next poll tries again.
      }
    };
    check();
    const interval = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [dataStatus, refreshData]);

  return null;
}
