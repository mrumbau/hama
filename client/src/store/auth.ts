/**
 * Zustand auth store.
 *
 * Wraps supabase.auth state. The only place the rest of the app reads the
 * current user. Subscribes to onAuthStateChange so reactive updates
 * propagate everywhere without re-querying.
 */

import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  user: null,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({
      session: data.session,
      user: data.session?.user ?? null,
      status: data.session ? "authenticated" : "anonymous",
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        status: session ? "authenticated" : "anonymous",
      });
    });
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    set({
      session: data.session,
      user: data.user,
      status: "authenticated",
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, status: "anonymous" });
  },
}));
