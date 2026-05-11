import { auth } from '../config/firebase';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getFeedSelections } from '../services/feedPreferences';
import { useAuth } from './AuthContext';
import { prefetchAppData, warmScreenData } from '../services/prefetchService';

type BootReason = 'launch' | 'login' | 'setup' | 'refresh';

type AppBootstrapContextType = {
  isBootstrapping: boolean;
  showLoadingScreen: boolean;
  bootReason: BootReason;
  bootLabel: string;
  bootSublabel: string;
  bootstrapApp: (options?: { reason?: BootReason; userId?: string }) => Promise<void>;
};

const AppBootstrapContext = createContext<AppBootstrapContextType | undefined>(undefined);

const BOOT_COPY: Record<BootReason, { label: string; sublabel: string }> = {
  launch: {
    label: 'Loading Sideline',
    sublabel: 'Preparing live, upcoming, results, news, and communities.',
  },
  login: {
    label: 'Loading your matchday',
    sublabel: 'Signing in and warming up your football feed.',
  },
  setup: {
    label: 'Building your app',
    sublabel: 'Saving preferences and preparing your home screen.',
  },
  refresh: {
    label: 'Refreshing Sideline',
    sublabel: 'Pulling the latest matches, news, and communities.',
  },
};
const MIN_BOOT_SCREEN_MS = 200;
const getFeedSelectionKey = (userId?: string, selections?: { teams: string[]; leagues: string[] }) => {
  if (!userId) return 'guest';
  return `${userId}:${JSON.stringify({
    teams: selections?.teams || [],
    leagues: selections?.leagues || [],
  })}`;
};

export const AppBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootReason, setBootReason] = useState<BootReason>('launch');
  const inflightRef = useRef<Promise<void> | null>(null);
  const preparedKeyRef = useRef<string | null>(null);
  const bootingKeyRef = useRef<string | null>(null);

  const bootstrapApp = useCallback(async ({ reason = 'launch', userId }: { reason?: BootReason; userId?: string } = {}) => {
    const resolvedUserId = userId ?? auth.currentUser?.uid ?? user?.uid;
    const feedSelections =
      resolvedUserId && userProfile?.uid === resolvedUserId
        ? getFeedSelections(userProfile)
        : { teams: [], leagues: [] };
    const sessionKey = getFeedSelectionKey(resolvedUserId, feedSelections);

    if (inflightRef.current && bootingKeyRef.current === sessionKey) {
      return inflightRef.current;
    }

    setBootReason(reason);
    setIsBootstrapping(true);
    bootingKeyRef.current = sessionKey;

    const request = (async () => {
      const startedAt = Date.now();
      try {
        // Always use cache-first: show cached data immediately and fetch fresh in background.
        // Only block if there is no usable cache at all (first-ever launch).
        await prefetchAppData({
          userId: resolvedUserId,
          feedSelections,
          waitForFresh: false,
        });
        if (reason !== 'refresh') {
          void Promise.allSettled([
            warmScreenData('live'),
            warmScreenData('upcoming'),
            warmScreenData('results'),
            warmScreenData('news'),
          ]);
        }
        preparedKeyRef.current = sessionKey;
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_BOOT_SCREEN_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_BOOT_SCREEN_MS - elapsed));
        }
        if (bootingKeyRef.current === sessionKey) {
          bootingKeyRef.current = null;
        }
        inflightRef.current = null;
        setIsBootstrapping(false);
      }
    })();

    inflightRef.current = request;
    return request;
  }, [user?.uid, userProfile]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      preparedKeyRef.current = getFeedSelectionKey(undefined, { teams: [], leagues: [] });
      bootingKeyRef.current = null;
      inflightRef.current = null;
      setIsBootstrapping(false);
      return;
    }
    const sessionKey = getFeedSelectionKey(user?.uid, user?.uid ? getFeedSelections(userProfile) : { teams: [], leagues: [] });
    if (preparedKeyRef.current === sessionKey) {
      setIsBootstrapping(false);
      return;
    }
    // If we've already booted for this user and only feed selections changed, use
    // 'refresh' so the loading screen is not shown (background re-fetch only).
    const prevKey = preparedKeyRef.current;
    const prevUserId = prevKey ? prevKey.split(':')[0] : null;
    const reason = prevUserId && prevUserId === user?.uid ? 'refresh' : 'launch';
    void bootstrapApp({ reason, userId: user?.uid });
  }, [authLoading, bootstrapApp, user?.uid, userProfile]);

  const copy = BOOT_COPY[bootReason];
  const value = useMemo<AppBootstrapContextType>(() => ({
    isBootstrapping,
    showLoadingScreen: authLoading || (isBootstrapping && bootReason !== 'refresh'),
    bootReason,
    bootLabel: copy.label,
    bootSublabel: copy.sublabel,
    bootstrapApp,
  }), [authLoading, bootReason, bootstrapApp, copy.label, copy.sublabel, isBootstrapping]);

  return <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>;
};

export const useAppBootstrap = () => {
  const context = useContext(AppBootstrapContext);
  if (!context) {
    throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  }
  return context;
};
