import { create } from "zustand";

interface SoftphoneState {
  isOpen: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  setIsOpen: (isOpen: boolean) => void;
  setConnected: (isConnected: boolean) => void;
  setConnecting: (isConnecting: boolean) => void;
  toggle: () => void;
}

export const useSoftphoneStore = create<SoftphoneState>((set) => ({
  isOpen: false,
  isConnected: false,
  isConnecting: false,
  setIsOpen: (isOpen) => set({ isOpen }),
  setConnected: (isConnected) => set({ isConnected }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
