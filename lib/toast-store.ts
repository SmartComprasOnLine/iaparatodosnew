import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

// Auto-cleanup toasts after their duration
const MAX_TOASTS = 5

export const useToastStore = create<ToastStore>()(
  subscribeWithSelector((set, get) => ({
    toasts: [],

    addToast: (toast) => {
      const id = Math.random().toString(36).substring(2, 9)
      const newToast: Toast = {
        id,
        duration: 5000,
        ...toast,
      }

      set((state) => {
        const updatedToasts = [newToast, ...state.toasts].slice(0, MAX_TOASTS)
        return { toasts: updatedToasts }
      })

      // Auto-remove after duration
      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          get().removeToast(id)
        }, newToast.duration)
      }
    },

    removeToast: (id) => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }))
    },

    clearToasts: () => {
      set({ toasts: [] })
    },
  }))
)

// Helper functions for common toast types
export const toast = {
  success: (title: string, description?: string) => {
    useToastStore.getState().addToast({
      title,
      description,
      variant: 'success',
    })
  },

  error: (title: string, description?: string) => {
    useToastStore.getState().addToast({
      title,
      description,
      variant: 'destructive',
    })
  },

  info: (title: string, description?: string) => {
    useToastStore.getState().addToast({
      title,
      description,
      variant: 'default',
    })
  },
}
