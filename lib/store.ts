import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "./supabaseClient"; // Import Supabase client
import { User } from "@supabase/supabase-js";

interface UserState {
  user: User | null;
  isLoggedIn: boolean;
  isSubscribed: boolean;
  setIsSubscribed: (value: boolean) => void;
  checkUserSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
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
}

// Create Zustand store with persistence
const useUserStore = create(
  persist<UserState>(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isSubscribed: false,
      setIsSubscribed: (value) => set({ isSubscribed: value }),
      checkUserSession: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          //   console.error("Error getting user session:", error);
        } else if (data) {
          //   console.log(data);
          set({
            user: data?.user,
            isLoggedIn: true,
          });
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

        const fetchFavorites = async (type: "station" | "camera") => {
          let tableName =
            type === "station" ? "favorite_stations" : "favorite_cameras";

          let colomnName = type === "station" ? "station_id" : "camera_id";

          const { data: favorites, error } = await supabase
            .from(tableName)
            .select(colomnName)
            .eq("user_id", data?.user?.id);

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
        };

        const favStations = await fetchFavorites("station");
        const favCameras = await fetchFavorites("camera");

        set({
          user: data?.user,
          isLoggedIn: true,
          favStations,
          favCameras,
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
          favStations: state.favStations.filter((station) => station !== value),
        }));
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
