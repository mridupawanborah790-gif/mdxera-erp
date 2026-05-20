import { create } from 'zustand';
import type { RegisteredPharmacy } from '@core/types';

interface AuthState {
  currentUser: RegisteredPharmacy | null;
  isAuthenticated: boolean;
  isOfflineSession: boolean;
  isRestoringSession: boolean;

  setUser: (user: RegisteredPharmacy | null, isOffline?: boolean) => void;
  setRestoringSession: (v: boolean) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isAuthenticated: false,
  isOfflineSession: false,
  isRestoringSession: true, // start true so AuthProvider shows a splash screen

  setUser: (user, isOffline = false) =>
    set({
      currentUser: user,
      isAuthenticated: user !== null,
      isOfflineSession: isOffline,
    }),

  setRestoringSession: (v) => set({ isRestoringSession: v }),

  clearUser: () =>
    set({
      currentUser: null,
      isAuthenticated: false,
      isOfflineSession: false,
    }),
}));
