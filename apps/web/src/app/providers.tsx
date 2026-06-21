"use client";
import { ReactNode } from "react";
import { PermissionsProvider } from "@/contexts/permissions-context";

export function Providers({ children }: { children: ReactNode }) {
  return <PermissionsProvider>{children}</PermissionsProvider>;
}
