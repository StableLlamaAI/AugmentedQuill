// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Lightweight toast notification system that replaces browser alert() for
 * non-blocking inline error, warning, success, and info messages.
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

type ToastFn = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  error: 6000,
  success: 3000,
  info: 4000,
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
  error: <AlertCircle size={16} className="shrink-0 text-red-400" />,
  success: <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />,
  info: <Info size={16} className="shrink-0 text-blue-400" />,
};

const BG_CLASS: Record<ToastVariant, string> = {
  error: 'bg-brand-gray-900 border-red-700/50',
  success: 'bg-brand-gray-900 border-emerald-700/50',
  info: 'bg-brand-gray-900 border-blue-700/50',
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xl text-sm text-brand-gray-100 min-w-[280px] max-w-sm ${BG_CLASS[toast.variant]}`}
    >
      {ICONS[toast.variant]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-brand-gray-400 hover:text-brand-gray-100 transition-colors shrink-0 -mt-0.5"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[variant]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[10100] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
