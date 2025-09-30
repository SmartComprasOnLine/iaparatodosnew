'use client'

import { useEffect } from 'react'
import { useToastStore } from '@/lib/toast-store'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: ReturnType<typeof useToastStore>['toasts'][0]
  onRemove: (id: string) => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id)
      }, toast.duration)

      return () => clearTimeout(timer)
    }
  }, [toast.id, toast.duration, onRemove])

  const variantClasses = {
    default: 'bg-white border-gray-200 text-gray-900',
    destructive: 'bg-red-50 border-red-200 text-red-900',
    success: 'bg-green-50 border-green-200 text-green-900',
  }

  return (
    <div
      className={cn(
        'relative p-4 rounded-lg border shadow-lg transition-all duration-300 ease-in-out',
        variantClasses[toast.variant || 'default']
      )}
    >
      <button
        onClick={() => onRemove(toast.id)}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {toast.title && (
        <div className="font-semibold text-sm mb-1 pr-6">
          {toast.title}
        </div>
      )}

      {toast.description && (
        <div className="text-sm opacity-90 pr-6">
          {toast.description}
        </div>
      )}
    </div>
  )
}
