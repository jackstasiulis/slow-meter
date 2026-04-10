import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Ctx = {
  inlineEditOpen: boolean;
  setInlineEditOpen: (v: boolean) => void;
  /** Call once when starting a “show dock” animation; returns true if we should use the slower profile-edit return. */
  consumePendingSlowDockReturn: () => boolean;
};

const ProfileInlineEditContext = createContext<Ctx | null>(null);

export function ProfileInlineEditProvider({ children }: { children: React.ReactNode }) {
  const [inlineEditOpen, setInlineEditOpenState] = useState(false);
  const pendingSlowDockReturnRef = useRef(false);

  const setInlineEditOpen = useCallback((v: boolean) => {
    setInlineEditOpenState((prev) => {
      if (!v && prev) {
        pendingSlowDockReturnRef.current = true;
      }
      return v;
    });
  }, []);

  const consumePendingSlowDockReturn = useCallback(() => {
    if (!pendingSlowDockReturnRef.current) return false;
    pendingSlowDockReturnRef.current = false;
    return true;
  }, []);

  const value = useMemo(
    () => ({
      inlineEditOpen: inlineEditOpen,
      setInlineEditOpen,
      consumePendingSlowDockReturn,
    }),
    [inlineEditOpen, setInlineEditOpen, consumePendingSlowDockReturn],
  );

  return (
    <ProfileInlineEditContext.Provider value={value}>
      {children}
    </ProfileInlineEditContext.Provider>
  );
}

/** When true, the main tab dock slides down (inline edit profile on Profile tab). */
export function useProfileInlineEditDockOpen() {
  return useContext(ProfileInlineEditContext)?.inlineEditOpen ?? false;
}

export function useSetProfileInlineEditDockOpen() {
  return useContext(ProfileInlineEditContext)?.setInlineEditOpen ?? (() => {});
}

export function useProfileInlineEditDockConsumeSlowReturn() {
  return useContext(ProfileInlineEditContext)?.consumePendingSlowDockReturn ?? (() => false);
}
