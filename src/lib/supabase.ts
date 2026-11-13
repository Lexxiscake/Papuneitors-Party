"use client";

import { createBrowserClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  Boolean(URL) &&
  Boolean(KEY) &&
  /^https?:\/\//.test(URL ?? "") &&
  !URL!.includes("tu-proyecto");

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabase() {
  if (!isSupabaseConfigured) {
    throw new Error("supabase_not_configured");
  }
  if (!client) {
    client = createBrowserClient(URL!, KEY!);
  }
  return client;
}
