import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface ConvexUserState {
  isLoggedIn: boolean;
  isSubscribed: boolean;
  setIsSubscribed: (value: boolean) => void;
  favoriteStationIds: Id<"stations">[];
  favoriteCameraIds: Id<"cameras">[];
}

// Create Zustand store for local state management
const useConvexUserStore = create(
  persist<ConvexUserState>(
    (set) => ({
      isLoggedIn: false,
      isSubscribed: false,
      setIsSubscribed: (value) => set({ isSubscribed: value }),
      favoriteStationIds: [],
      favoriteCameraIds: [],
    }),
    {
      name: "convex-user-storage",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

// Custom hook that combines Convex auth with local state
export const useUserStore = () => {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const localState = useConvexUserStore();
  
  // Convex queries and mutations
  const favoriteStations = useQuery(api.favorites.getFavoriteStations) || [];
  const favoriteCameras = useQuery(api.favorites.getFavoriteCameras) || [];
  const addFavoriteStationMutation = useMutation(api.favorites.addFavoriteStation);
  const removeFavoriteStationMutation = useMutation(api.favorites.removeFavoriteStation);
  const addFavoriteCameraMutation = useMutation(api.favorites.addFavoriteCamera);
  const removeFavoriteCameraMutation = useMutation(api.favorites.removeFavoriteCamera);

  // Convert Convex IDs to strings for compatibility with existing code
  const favStations = favoriteStations.map(id => id.toString());
  const favCameras = favoriteCameras.map(id => id.toString());

  const loginWithMagicLink = async (email: string) => {
    try {
      await signIn("resend", { email });
      return { status: true, error: null };
    } catch (error) {
      console.error("Magic Link Error:", error);
      return {
        status: false,
        error: error instanceof Error ? error : new Error('Login failed'),
      };
    }
  };

  const loginWithGoogle = async () => {
    try {
      await signIn("google");
      return { status: true, error: null };
    } catch (error) {
      console.error("Google Login Error:", error);
      return {
        status: false,
        error: error instanceof Error ? error : new Error('Login failed'),
      };
    }
  };

  const logout = async () => {
    try {
      await signOut();
      localState.setIsSubscribed(false);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const addFavStation = async (stationId: string) => {
    try {
      await addFavoriteStationMutation({ stationId: stationId as Id<"stations"> });
    } catch (error) {
      console.error("Error adding favorite station:", error);
    }
  };

  const removeFavStation = async (stationId: string) => {
    try {
      await removeFavoriteStationMutation({ stationId: stationId as Id<"stations"> });
    } catch (error) {
      console.error("Error removing favorite station:", error);
    }
  };

  const addFavCamera = async (cameraId: string) => {
    try {
      await addFavoriteCameraMutation({ cameraId: cameraId as Id<"cameras"> });
    } catch (error) {
      console.error("Error adding favorite camera:", error);
    }
  };

  const removeFavCamera = async (cameraId: string) => {
    try {
      await removeFavoriteCameraMutation({ cameraId: cameraId as Id<"cameras"> });
    } catch (error) {
      console.error("Error removing favorite camera:", error);
    }
  };

  return {
    ...localState,
    isLoggedIn: isAuthenticated,
    user: isAuthenticated ? { id: 'convex-user' } : null, // Simplified user object
    favStations,
    favCameras,
    loginWithMagicLink,
    loginWithGoogle,
    logout,
    addFavStation,
    removeFavStation,
    addFavCamera,
    removeFavCamera,
    // Keep these for compatibility but they're not used with magic link only
    login: async () => ({ status: false, error: new Error('Use magic link instead') }),
    register: async () => ({ status: false, error: new Error('Use magic link instead') }),
    checkUserSession: async () => {},
    listenSessionChanges: () => {},
    fetchFavorites: async () => [],
  };
};

export default useUserStore;