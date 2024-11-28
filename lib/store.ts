import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "./supabaseClient"; // Import Supabase client
import { User } from "@supabase/supabase-js";
import {
  requestNotificationPermission,
  saveUserPreferences,
} from "../utils/permissions";
import { subscribeUser, unsubscribeUser } from "../utils/oneSignalConfig";

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

  addFavStation: (value: string) => void;
  removeFavStation: (value: string) => void;
  addFavCamera: (value: string) => void;
  removeFavCamera: (value: string) => void;
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
        console.log("from checkUserSession");
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
      addFavStation: async (value) => {
        const user = useUserStore.getState().user;

        const { error } = await supabase.from("favorite_stations").insert([
          {
            user_id: user?.id,
            station_id: value,
          },
        ]);
        if (error) {
          console.error("Error adding favorite station:", error);
          return;
        }
        set((state) => ({
          ...state,
          favStations: [...state.favStations, value],
        }));
      },
      removeFavStation: async (value) => {
        const user = useUserStore.getState().user;

        if (user) {
          const { error } = await supabase
            .from("favorite_stations")
            .delete()
            .eq("user_id", user?.id)
            .eq("station_id", value);
          if (error) {
            console.error("Error removing favorite station:", error);
            return;
          }
          set((state) => ({
            ...state,
            favStations: state.favStations.filter(
              (station) => station !== value
            ),
          }));
        } else {
          console.error("Error removing favorite station: User not logged in");
        }
      },
      addFavCamera: async (value) => {
        const user = useUserStore.getState().user;
        const { error } = await supabase.from("favorite_cameras").insert([
          {
            user_id: user?.id,
            camera_id: value,
          },
        ]);
        if (error) {
          console.error("Error adding favorite camera:", error);
          return;
        }
        set((state) => ({
          ...state,
          favCameras: [...state.favCameras, value],
        }));
      },
      removeFavCamera: async (value) => {
        const user = useUserStore.getState().user;

        if (user) {
          const { error } = await supabase
            .from("favorite_cameras")
            .delete()
            .eq("user_id", user?.id)
            .eq("camera_id", value);
          if (error) {
            console.error("Error removing favorite camera:", error);
            return;
          }
          set((state) => ({
            ...state,
            favCameras: state.favCameras.filter((camera) => camera !== value),
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
