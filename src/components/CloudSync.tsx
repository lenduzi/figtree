import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useCRMContext } from '@/contexts/CRMContext';
import {
  applyBackup,
  buildBackup,
  CLOUD_BACKUP_TABLE,
  CLOUD_BOOTSTRAP_KEY,
  CLOUD_LAST_PULL_KEY,
  CLOUD_LAST_SYNC_KEY,
  CLOUD_SYNC_ENABLED_KEY,
  OUTREACH_LAST_CHANGE_KEY,
  validateBackup,
} from '@/lib/backup';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 60000;
const PULL_POLL_MS = 45000;

export default function CloudSync() {
  const {
    contacts,
    tasks,
    stages,
    activities,
    researchEntries,
    researchLists,
    eisenhowerItems,
    projects,
    projectVisits,
    creators,
  } = useCRMContext();
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<'pending' | 'ready'>('pending');
  const [tick, setTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const lastDataHashRef = useRef<string | null>(null);
  const pullInFlightRef = useRef(false);

  const isSyncEnabled = () => {
    try {
      return localStorage.getItem(CLOUD_SYNC_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  };

  const parseTimestamp = (value: string | null) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const getLocalLastActivity = () => {
    try {
      const lastSync = parseTimestamp(localStorage.getItem(CLOUD_LAST_SYNC_KEY));
      const lastPull = parseTimestamp(localStorage.getItem(CLOUD_LAST_PULL_KEY));
      const lastOutreach = parseTimestamp(localStorage.getItem(OUTREACH_LAST_CHANGE_KEY));
      return Math.max(lastSync, lastPull, lastOutreach);
    } catch {
      return 0;
    }
  };

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
    if (!supabase || !session) {
      setBootstrapStatus('ready');
      return;
    }
    if (!isSupabaseConfigured || !isSyncEnabled()) {
      setBootstrapStatus('ready');
      return;
    }

    let isMounted = true;
    setBootstrapStatus('pending');

    const bootstrap = async () => {
      const { data, error } = await supabase
        .from(CLOUD_BACKUP_TABLE)
        .select('backup, updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!isMounted) return;
      if (error || !data?.updated_at || !data.backup) {
        setBootstrapStatus('ready');
        return;
      }

      const cloudTime = parseTimestamp(data.updated_at);
      const lastBootstrap = parseTimestamp(localStorage.getItem(CLOUD_BOOTSTRAP_KEY));
      if (cloudTime !== 0 && lastBootstrap >= cloudTime) {
        setBootstrapStatus('ready');
        return;
      }
      const localLast = getLocalLastActivity();
      if (cloudTime !== 0 && localLast >= cloudTime) {
        try {
          localStorage.setItem(CLOUD_BOOTSTRAP_KEY, data.updated_at);
        } catch {
          // ignore storage errors
        }
        setBootstrapStatus('ready');
        return;
      }

      const validation = validateBackup(data.backup);
      if (!validation.ok) {
        setBootstrapStatus('ready');
        return;
      }
      const result = applyBackup(validation.data);
      if (!result.ok) {
        setBootstrapStatus('ready');
        return;
      }

      try {
        localStorage.setItem(CLOUD_LAST_PULL_KEY, data.updated_at);
        localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, '1');
        localStorage.setItem(CLOUD_BOOTSTRAP_KEY, data.updated_at);
      } catch {
        // ignore storage errors
      }

      setBootstrapStatus('ready');
      window.location.reload();
    };

    bootstrap();
    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    if (bootstrapStatus !== 'ready') return;
    const interval = window.setInterval(() => {
      if (!isSyncEnabled()) return;
      setTick((prev) => prev + 1);
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [session, bootstrapStatus]);

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
        projects,
        projectVisits,
        creators,
      }),
    [contacts, tasks, activities, researchEntries, stages, researchLists, eisenhowerItems, projects, projectVisits, creators, tick],
  );

  const dataHash = useMemo(() => JSON.stringify(backup.data), [backup]);

  useEffect(() => {
    if (!supabase || !session) return;
    if (bootstrapStatus !== 'ready') return;
    if (!isSyncEnabled()) return;
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
          localStorage.setItem(CLOUD_BOOTSTRAP_KEY, updatedAt);
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
  }, [backup, dataHash, session, bootstrapStatus]);

  useEffect(() => {
    if (!supabase || !session) return;
    if (bootstrapStatus !== 'ready') return;
    if (!isSyncEnabled()) return;

    const checkForCloudUpdate = async () => {
      if (pullInFlightRef.current) return;
      if (dataHash !== lastDataHashRef.current) return;
      const localLast = getLocalLastActivity();
      const { data, error } = await supabase
        .from(CLOUD_BACKUP_TABLE)
        .select('backup, updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error || !data?.updated_at || !data.backup) return;
      const cloudTime = new Date(data.updated_at).getTime();
      if (Number.isNaN(cloudTime) || cloudTime <= localLast) return;

      pullInFlightRef.current = true;
      const validation = validateBackup(data.backup);
      if (!validation.ok) {
        pullInFlightRef.current = false;
        return;
      }
      const result = applyBackup(validation.data);
      if (!result.ok) {
        pullInFlightRef.current = false;
        return;
      }
      try {
        localStorage.setItem(CLOUD_LAST_PULL_KEY, data.updated_at);
        localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, '1');
        localStorage.setItem(CLOUD_BOOTSTRAP_KEY, data.updated_at);
      } catch {
        // ignore storage errors
      }
      window.location.reload();
    };

    checkForCloudUpdate();
    const interval = window.setInterval(checkForCloudUpdate, PULL_POLL_MS);
    return () => window.clearInterval(interval);
  }, [session, dataHash, bootstrapStatus]);

  return null;
}
