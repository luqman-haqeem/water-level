import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User } from "@supabase/supabase-js";
import {
  requestNotificationPermission,
  saveUserPreferences,
} from "../utils/permissions";

import { subscribeUser, unsubscribeUser } from "../utils/oneSignalConfig";
import { getUserDetails } from "@/app/action";
import { createClient } from "@/utils/supabase/client";

interface UserState {
  user: User | null;
  isLoggedIn: boolean;
  isSubscribed: boolean;
  setIsSubscribed: (value: boolean) => void;
  checkUserSession: () => Promise<void>;
  listenSessionChanges: () => void;
  login: (
    email: string,
    password: string
  ) => Promise<{ status: boolean; error: Error | null }>;
  loginWithMagicLink: (
    email: string
  ) => Promise<{ status: boolean; error: Error | null }>;
  register: (
    email: string,
    password: string
  ) => Promise<{ status: boolean; error: Error | null }>;
  logout: () => Promise<void>;

  favStations: string[];
  favCameras: string[];
  addFavorite: (value: string, type: "station" | "camera") => void;
  removeFavorite: (value: string, type: "station" | "camera") => void;
  fetchFavorites: (
    type: "station" | "camera",
    data: string
  ) => Promise<string[]>;
}

// Create Zustand store with persistence
const useUserStore = create(
  persist<UserState>(
    (set) => ({
      user: null,
      isLoggedIn: true,
      isSubscribed: false,
      setIsSubscribed: (value) => set({ isSubscribed: value }),
      checkUserSession: async () => {
        const supabase = createClient();

        // console.log("from checkUserSession");
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          //   console.error("Error getting user session:", error);
        } else if (data) {
          const favStations = await useUserStore
            .getState()
            .fetchFavorites("station", data?.user?.id);
          const favCameras = await useUserStore
            .getState()
            .fetchFavorites("camera", data?.user?.id);

          set({
            user: data?.user,
            isLoggedIn: true,
            favStations,
            favCameras,
          });
        } else {
          set({ isLoggedIn: false });
        }
      },
      listenSessionChanges: () => {
        const supabase = createClient();

        supabase.auth.onAuthStateChange(async (event, session) => {
          console.log("Listen session changes");

          if (session && session.provider_token) {
            window.localStorage.setItem(
              "oauth_provider_token",
              session.provider_token
            );
          }

          if (session && session.provider_refresh_token) {
            window.localStorage.setItem(
              "oauth_provider_refresh_token",
              session.provider_refresh_token
            );
          }
          if (event === "SIGNED_IN") {
            // console.log("SIGNED_IN");
            // console.log("session", session);

            const user = session?.user;
            // console.log("user", user);

            if (user) {
              //   console.log("user exist");

              //   console.log("fetching favorites");

              //   const favStations = await useUserStore
              //     .getState()
              //     .fetchFavorites("station", user?.id);
              //   const favCameras = await useUserStore
              //     .getState()
              //     .fetchFavorites("camera", user?.id);

              // request  notification pemision
              console.log("request notification permission");

              const requestPermision =
                (await requestNotificationPermission()) ?? true;

              if (requestPermision) {
                await subscribeUser(user?.id ?? "");
                console.log(" requestPermision", requestPermision);
              }

              set({
                user: user,
                isLoggedIn: true,
                // favStations,
                // favCameras,
              });

              set({ isSubscribed: requestPermision });
              // await logSubscriptionChange(true);
            } else {
              console.log("user is null");
            }
          }

          if (event === "SIGNED_OUT") {
            console.log("User signed out");
            window.localStorage.removeItem("oauth_provider_token");
            window.localStorage.removeItem("oauth_provider_refresh_token");

            set({
              user: null,
              isLoggedIn: false,
              favStations: [],
              favCameras: [],
            });
          }
        });
      },
      setNotificationPermission: async (permission: any) => {
        if (permission) {
          console.log(`permission accepted!`);
          const userId = useUserStore.getState().user?.id ?? "";
          await subscribeUser(userId);
        } else {
          await unsubscribeUser();
        }
        useUserStore.getState().setIsSubscribed(permission);

        // await logSubscriptionChange(true);
      },
      loginWithMagicLink: async (email) => {
        const supabase = createClient();

        const { error } = await supabase.auth.signInWithOtp({
          email,
        });
        if (error) {
          console.error("Magic Link Error:", error.message);
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

      login: async (email, password) => {
        const supabase = createClient();

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("Login Error:", error.message);
          return {
            status: false,
            error: error,
          };
        }
        const favStations = await useUserStore
          .getState()
          .fetchFavorites("station", data?.user?.id);
        const favCameras = await useUserStore
          .getState()
          .fetchFavorites("camera", data?.user?.id);

        set({
          user: data?.user,
          isLoggedIn: true,
          favStations,
          favCameras,
        });

        return {
          status: true,
          error: null,
        };
      },
      register: async (email, password) => {
        const supabase = createClient();

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          console.error("Register Error:", error.message);
          return {
            status: false,
            error: error,
          };
        }
        set({
          user: data?.user,
          isLoggedIn: true,
          favStations: [],
          favCameras: [],
        });

        return {
          status: true,
          error: null,
        };
      },
      fetchFavorites: async (type: "station" | "camera", userId: string) => {
        const supabase = createClient();

        if (!userId) {
          console.log("No user ID provided");
        }
        // console.log("in fetchFavorites", type, userId);

        let tableName =
          type === "station" ? "favorite_stations" : "favorite_cameras";

        let colomnName = type === "station" ? "station_id" : "camera_id";

        const { data: favorites, error } = await supabase
          .from(tableName)
          .select(colomnName)
          .eq("user_id", userId);

        if (error) {
          console.error(`Error fetching ${type} favorites:`, error.message);
          return [];
        }

        //   console.log("favorites", favorites);
        return (
          favorites
            ?.map((fav) => {
              const value = (fav as any)[colomnName];
              return value ? value.toString() : null;
            })
            .filter((value) => value !== null) || []
        );
      },
      logout: async () => {
        const supabase = createClient();

        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error("Logout Error:", error.message);
          return;
        }
        set({
          user: null,
          isLoggedIn: false,
          favStations: [],
          favCameras: [],
        });
      },
      favStations: [],
      favCameras: [],
      addFavorite: async (value, type: "station" | "camera") => {
        const supabase = createClient();

        const user = await getUserDetails();

        if (!user) {
          console.log("No user found");
          return;
        }
        const tableName =
          type === "station" ? "favorite_stations" : "favorite_cameras";

        const columnName = type === "station" ? "station_id" : "camera_id";
        const stateKey = type === "station" ? "favStations" : "favCameras";

        const { error } = await supabase.from(tableName).insert([
          {
            user_id: user?.id,
            [columnName]: value,
          },
        ]);
        if (error) {
          console.log("Error adding favorite station:", error);
          return;
        }
        set((state) => ({
          ...state,
          [stateKey]: [...state[stateKey], value],
        }));
      },
      removeFavorite: async (value, type: "station" | "camera") => {
        const supabase = createClient();

        const stateKey = type === "station" ? "favStations" : "favCameras";

        const user = await getUserDetails();
        const tableName =
          type === "station" ? "favorite_stations" : "favorite_cameras";
        const columnName = type === "station" ? "station_id" : "camera_id";

        if (user) {
          const { error } = await supabase
            .from(tableName)
            .delete()
            .eq("user_id", user?.id)
            .eq(columnName, value);
          if (error) {
            console.error("Error removing favorite :", error);
            return;
          }
          set((state) => ({
            ...state,
            [stateKey]: state[stateKey].filter((station) => station !== value),
          }));
        }
      },
    }),
    {
      name: "user-storage",
      storage: createJSONStorage(() => sessionStorage),
      //   merge: (persistedState, currentState) => ({
      //     ...currentState,
      //     ...(persistedState as UserState),
      //   }),
    }
  )
);

export default useUserStore;
