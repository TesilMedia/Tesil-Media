"use client";

import { createContext, useContext, useState, ReactNode } from "react";

const ChatDrawerContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <ChatDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </ChatDrawerContext.Provider>
  );
}

export function useChatDrawer() {
  const context = useContext(ChatDrawerContext);
  if (!context) {
    throw new Error("useChatDrawer must be used within ChatDrawerProvider");
  }
  return context;
}
