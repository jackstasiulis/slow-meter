import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Ctx = {
  /** True from chat `beforeRemove` until tab state confirms we left Conversation. */
  eagerShowDockAfterLeavingChat: boolean;
  signalLeavingChatForDock: () => void;
  clearLeavingChatDockSignal: () => void;
};

const MessagesChatDockExitContext = createContext<Ctx | null>(null);

export function MessagesChatDockExitProvider({ children }: { children: React.ReactNode }) {
  const [eagerShowDockAfterLeavingChat, setEager] = useState(false);

  const signalLeavingChatForDock = useCallback(() => {
    setEager(true);
  }, []);

  const clearLeavingChatDockSignal = useCallback(() => {
    setEager(false);
  }, []);

  const value = useMemo(
    () => ({
      eagerShowDockAfterLeavingChat,
      signalLeavingChatForDock,
      clearLeavingChatDockSignal,
    }),
    [eagerShowDockAfterLeavingChat, signalLeavingChatForDock, clearLeavingChatDockSignal],
  );

  return <MessagesChatDockExitContext.Provider value={value}>{children}</MessagesChatDockExitContext.Provider>;
}

export function useMessagesChatDockEagerExit() {
  const ctx = useContext(MessagesChatDockExitContext);
  return {
    eagerShowDockAfterLeavingChat: ctx?.eagerShowDockAfterLeavingChat ?? false,
    clearLeavingChatDockSignal: ctx?.clearLeavingChatDockSignal ?? (() => {}),
  };
}

export function useSignalMessagesChatDockOnBack() {
  return useContext(MessagesChatDockExitContext)?.signalLeavingChatForDock ?? (() => {});
}
