"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { PrefsProvider } from "./ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PrefsProvider>{children}</PrefsProvider>
    </SessionProvider>
  );
}
