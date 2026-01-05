"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DashboardAuthContextValue = {
  supabase: SupabaseClient<Database>;
  user: User | null;
  loading: boolean;
};

const DashboardAuthContext = createContext<DashboardAuthContextValue | undefined>(undefined);

export function DashboardAuthProvider({
  value,
  children,
}: {
  value: DashboardAuthContextValue;
  children: ReactNode;
}) {
  return (
    <DashboardAuthContext.Provider value={value}>
      {children}
    </DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth() {
  const context = useContext(DashboardAuthContext);
  if (!context) {
    throw new Error("useDashboardAuth must be used within DashboardAuthProvider");
  }
  return context;
}
