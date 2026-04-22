import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** Whether the slide-out exit animation is running */
  exiting: boolean;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    // Start exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    // Remove after animation (~400ms)
    timersRef.current[`remove-${id}`] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 400);
  }, []);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    // Auto-dismiss after 4 seconds
    timersRef.current[id] = setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const value: ToastContextValue = {
    success: (msg) => addToast(msg, 'success'),
    error:   (msg) => addToast(msg, 'error'),
    info:    (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

// ─── Container ────────────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      dir="rtl"
    >
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// ─── Toast Card ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />,
  error:   <AlertCircle  size={18} className="shrink-0 text-red-400" />,
  info:    <Info         size={18} className="shrink-0 text-blue-400" />,
  warning: <AlertTriangle size={18} className="shrink-0 text-amber-400" />,
};

const BG_MAP: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error:   'border-red-500/30     bg-red-500/10',
  info:    'border-blue-500/30    bg-blue-500/10',
  warning: 'border-amber-500/30   bg-amber-500/10',
};

const BAR_MAP: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error:   'bg-red-500',
  info:    'bg-blue-500',
  warning: 'bg-amber-500',
};

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss }) => {
  return (
    <div
      role="alert"
      className={`
        relative pointer-events-auto overflow-hidden
        flex items-center gap-3
        px-4 py-3 rounded-xl
        border backdrop-blur-md shadow-2xl
        bg-slate-900/90 text-slate-100 text-sm font-medium
        ${BG_MAP[toast.type]}
        transition-all duration-400
        ${toast.exiting
          ? 'opacity-0 -translate-y-2 scale-95'
          : 'opacity-100 translate-y-0 scale-100 animate-toast-in'}
      `}
      style={{ animationDuration: '300ms' }}
    >
      {/* Accent bar */}
      <span className={`absolute right-0 top-0 bottom-0 w-1 rounded-r-xl ${BAR_MAP[toast.type]}`} />

      {ICON_MAP[toast.type]}

      <span className="flex-1 leading-snug">{toast.message}</span>

      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-0.5 rounded text-slate-500 hover:text-white transition-colors"
        aria-label="إغلاق الإشعار"
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <span
        className={`absolute bottom-0 right-0 h-[2px] ${BAR_MAP[toast.type]} animate-toast-progress`}
        style={{ animationDuration: '4000ms', animationTimingFunction: 'linear' }}
      />

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .animate-toast-in       { animation-name: toast-in; }
        .animate-toast-progress { animation-name: toast-progress; animation-fill-mode: forwards; }
      `}</style>
    </div>
  );
};
