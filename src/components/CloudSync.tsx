import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useCRMContext } from '@/contexts/CRMContext';
import { buildBackup, CLOUD_BACKUP_TABLE, CLOUD_LAST_SYNC_KEY, CLOUD_SYNC_ENABLED_KEY } from '@/lib/backup';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 60000;

export default function CloudSync() {
  const {
    contacts,
    tasks,
    stages,
    activities,
    researchEntries,
    researchLists,
    eisenhowerItems,
  } = useCRMContext();
  const [session, setSession] = useState<Session | null>(null);
  const [tick, setTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const lastDataHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    const interval = window.setInterval(() => {
      const syncEnabled = (() => {
        try {
          return localStorage.getItem(CLOUD_SYNC_ENABLED_KEY) === '1';
        } catch {
          return false;
        }
      })();
      if (!syncEnabled) return;
      setTick((prev) => prev + 1);
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [session]);

  const backup = useMemo(
    () =>
      buildBackup({
        contacts,
        tasks,
        activities,
        researchEntries,
        stages,
        researchLists,
        eisenhowerItems,
      }),
    [contacts, tasks, activities, researchEntries, stages, researchLists, eisenhowerItems, tick],
  );

  const dataHash = useMemo(() => JSON.stringify(backup.data), [backup]);

  useEffect(() => {
    if (!supabase || !session) return;
    const syncEnabled = (() => {
      try {
        return localStorage.getItem(CLOUD_SYNC_ENABLED_KEY) === '1';
      } catch {
        return false;
      }
    })();
    if (!syncEnabled) return;
    if (dataHash === lastDataHashRef.current) return;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from(CLOUD_BACKUP_TABLE)
        .upsert(
          {
            user_id: session.user.id,
            backup,
            updated_at: updatedAt,
          },
          { onConflict: 'user_id' },
        );
      if (!error) {
        lastDataHashRef.current = dataHash;
        try {
          localStorage.setItem(CLOUD_LAST_SYNC_KEY, updatedAt);
        } catch {
          // ignore storage errors
        }
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [backup, dataHash, session]);

  return null;
}
