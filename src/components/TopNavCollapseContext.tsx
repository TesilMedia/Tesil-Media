"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TopNavCollapseContextValue = {
  open: boolean;
  close: () => void;
  toggle: () => void;
};

const TopNavCollapseContext =
  createContext<TopNavCollapseContextValue | null>(null);

export function TopNavCollapseProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  const value = useMemo(
    () => ({
      open,
      close,
      toggle,
    }),
    [close, open, toggle],
  );

  return (
    <TopNavCollapseContext.Provider value={value}>
      {children}
    </TopNavCollapseContext.Provider>
  );
}

export function useTopNavCollapse() {
  const context = useContext(TopNavCollapseContext);
  if (!context) {
    throw new Error(
      "useTopNavCollapse must be used inside TopNavCollapseProvider",
    );
  }

  return context;
}
