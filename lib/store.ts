import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "./supabaseClient"; // Import Supabase client

interface UserState {
  user: Object | null;
  isLoggedIn: boolean;
  checkUserSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string
  ) => Promise<{ status: boolean; error: Error | null }>;
  logout: () => Promise<void>;
}

// Create Zustand store with persistence
const useUserStore = create(
  persist<UserState>(
    (set) => ({
      user: null,
      isLoggedIn: false,

      checkUserSession: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          //   console.error("Error getting user session:", error);
        } else if (data) {
          //   console.log(data);
          set({ isLoggedIn: true });
        } else {
          set({ isLoggedIn: false });
        }
      },

      login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          console.error("Login Error:", error.message);
          return;
        }
        console.log(data);
        set({
          user: data?.user,
          isLoggedIn: true,
        });
      },
      register: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          console.error("Register Error:", error.message);
          return {
            status: false,
            error: error,
          };
        }
        return {
          status: true,
          error: null,
        };
      },

      // Logout action using Supabase Auth
      logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error("Logout Error:", error.message);
          return;
        }
        set({ user: null, isLoggedIn: false });
      },
    }),
    {
      name: "user-storage", // Name of the storage (localStorage key)
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    }
  )
);

export default useUserStore;
