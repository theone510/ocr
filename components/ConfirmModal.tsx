import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useConfirm = (): ConfirmContextValue => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const normalised: ConfirmOptions =
        typeof options === 'string' ? { message: options } : options;
      setPending({ ...normalised, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending]
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && <ConfirmModal options={pending} onClose={handleClose} />}
    </ConfirmContext.Provider>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  options: PendingConfirm;
  onClose: (confirmed: boolean) => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ options, onClose }) => {
  const {
    title = 'تأكيد',
    message,
    confirmLabel = 'تأكيد',
    cancelLabel = 'إلغاء',
    dangerous = false,
  } = options;

  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on open (safer default)
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Trap focus inside the modal
  useEffect(() => {
    const modal = document.getElementById('confirm-modal-dialog');
    if (!modal) return;

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      dir="rtl"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />

      {/* Panel */}
      <div
        id="confirm-modal-dialog"
        className="relative z-10 w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 animate-modal-in"
        style={{ animationDuration: '200ms' }}
      >
        {/* Close X */}
        <button
          onClick={() => onClose(false)}
          className="absolute top-4 left-4 p-1 rounded text-slate-600 hover:text-white transition-colors"
          aria-label="إغلاق"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${dangerous ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
            <AlertTriangle size={20} />
          </div>
          <h2 id="confirm-modal-title" className="text-lg font-bold text-white">
            {title}
          </h2>
        </div>

        {/* Message */}
        <p className="text-slate-300 text-sm leading-relaxed">{message}</p>

        {/* Accent divider */}
        <div className="h-px bg-white/5" />

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelBtnRef}
            id="confirm-cancel-btn"
            onClick={() => onClose(false)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 border border-white/10 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            id="confirm-ok-btn"
            onClick={() => onClose(true)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              dangerous
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_16px_rgba(220,38,38,0.3)]'
                : 'bg-gradient-to-r from-[#c5a059] to-[#9f7d3d] text-slate-900 shadow-[0_0_16px_rgba(197,160,89,0.25)] hover:shadow-[0_0_24px_rgba(197,160,89,0.4)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        .animate-modal-in { animation: modal-in forwards; }
      `}</style>
    </div>
  );
};
