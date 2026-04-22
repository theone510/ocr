import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FileText, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfStartPageOptions {
  totalPages: number;
}

interface PendingPrompt extends PdfStartPageOptions {
  resolve: (page: number | null) => void;
}

interface PdfStartPageContextValue {
  promptPdfStartPage: (options: PdfStartPageOptions) => Promise<number | null>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PdfStartPageContext = createContext<PdfStartPageContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const usePdfStartPage = (): PdfStartPageContextValue => {
  const ctx = useContext(PdfStartPageContext);
  if (!ctx) throw new Error('usePdfStartPage must be used inside <PdfStartPageProvider>');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const PdfStartPageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const promptPdfStartPage = useCallback(
    (options: PdfStartPageOptions): Promise<number | null> => {
      return new Promise<number | null>((resolve) => {
        setPending({ ...options, resolve });
      });
    },
    []
  );

  const handleClose = useCallback(
    (page: number | null) => {
      pending?.resolve(page);
      setPending(null);
    },
    [pending]
  );

  return (
    <PdfStartPageContext.Provider value={{ promptPdfStartPage }}>
      {children}
      {pending && (
        <PdfStartPageModal totalPages={pending.totalPages} onClose={handleClose} />
      )}
    </PdfStartPageContext.Provider>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface PdfStartPageModalProps {
  totalPages: number;
  onClose: (page: number | null) => void;
}

const PdfStartPageModal: React.FC<PdfStartPageModalProps> = ({ totalPages, onClose }) => {
  const [value, setValue] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Escape key cancels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safe = Math.max(1, Math.min(value, totalPages));
    onClose(safe);
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      dir="rtl"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose(null)}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 animate-modal-in"
        style={{ animationDuration: '200ms' }}
      >
        {/* Close */}
        <button
          onClick={() => onClose(null)}
          className="absolute top-4 left-4 p-1 rounded text-slate-600 hover:text-white transition-colors"
          aria-label="إلغاء"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#c5a059]/15 text-[#c5a059]">
            <FileText size={20} />
          </div>
          <div>
            <h2 id="pdf-modal-title" className="text-base font-bold text-white">
              بدء استخراج الـ PDF
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              المستند يحتوي على <span className="text-[#c5a059] font-bold">{totalPages}</span> صفحة
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="pdf-start-page-input"
              className="block text-sm text-slate-300 mb-2"
            >
              من أي صفحة PDF تريد بدء الاستخراج؟
            </label>
            <input
              id="pdf-start-page-input"
              ref={inputRef}
              type="number"
              min={1}
              max={totalPages}
              value={value}
              onChange={(e) => setValue(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-center text-2xl font-bold text-[#c5a059] outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/40 transition-colors"
            />
            <p className="text-xs text-slate-600 mt-1.5 text-center">
              النطاق المسموح: 1 – {totalPages}
            </p>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              id="pdf-modal-cancel-btn"
              onClick={() => onClose(null)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 border border-white/10 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
            >
              إلغاء
            </button>
            <button
              type="submit"
              id="pdf-modal-confirm-btn"
              className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-[#c5a059] to-[#9f7d3d] text-slate-900 shadow-[0_0_16px_rgba(197,160,89,0.25)] hover:shadow-[0_0_24px_rgba(197,160,89,0.4)] transition-all active:scale-95"
            >
              بدء الاستخراج
            </button>
          </div>
        </form>
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
