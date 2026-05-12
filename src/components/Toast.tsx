'use client';
import { useEffect, useState } from 'react';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

let toastSetter: ((s: ToastState) => void) | null = null;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  if (toastSetter) toastSetter({ message, type, visible: true });
}

export function ToastContainer() {
  const [state, setState] = useState<ToastState>({ message: '', type: 'success', visible: false });

  useEffect(() => {
    toastSetter = setState;
    return () => { toastSetter = null; };
  }, []);

  useEffect(() => {
    if (state.visible) {
      const t = setTimeout(() => setState((s) => ({ ...s, visible: false })), 3500);
      return () => clearTimeout(t);
    }
  }, [state.visible]);

  const bg = state.type === 'error' ? 'bg-danger' : 'bg-success';
  const translate = state.visible ? 'translate-x-0' : 'translate-x-[420px]';

  return (
    <div
      className={`fixed top-[88px] right-6 ${bg} text-white px-5 py-3.5 rounded-md text-sm font-medium shadow-2xl z-[2000] transition-transform duration-300 ${translate}`}
    >
      {state.message}
    </div>
  );
}
