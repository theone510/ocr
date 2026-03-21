
import React from 'react';
import { Play, Pause, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';
import { toHindi } from '../App';

interface BatchControlsProps {
  totalPDFPages: number;
  currentPDFPage: number;
  isProcessing: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  fileName: string;
}

export const BatchControls: React.FC<BatchControlsProps> = ({
  totalPDFPages,
  currentPDFPage,
  isProcessing,
  isPaused,
  onPause,
  onResume,
  fileName
}) => {
  const progress = Math.min(100, Math.round((currentPDFPage / totalPDFPages) * 100));

  return (
    <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-white/5 mb-4 animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
           <div className={`p-2 rounded-full ${isProcessing && !isPaused ? 'bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-500'}`}>
              {isProcessing && !isPaused ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
           </div>
           <div>
              <h3 className="font-bold text-slate-200 text-sm tracking-wide">المعالجة الآلية: <span className="text-[#c5a059]">{fileName}</span></h3>
              <p className="text-xs text-slate-500 font-mono">
                {isPaused ? '>>> STATUS: PAUSED' : '>>> STATUS: PROCESSING...'} <span className="text-emerald-500/70">| ٢ صفحات بالتوازي</span>
              </p>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
           {isPaused ? (
             <Button size="sm" variant="primary" onClick={onResume} className="bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-emerald-900/50">
                <Play size={16} className="ml-1" /> استئناف
             </Button>
           ) : (
             <Button size="sm" variant="outline" onClick={onPause} className="text-amber-500 border-amber-900 hover:bg-amber-900/20">
                <Pause size={16} className="ml-1" /> إيقاف مؤقت
             </Button>
           )}
        </div>
      </div>

      {/* Ticker Progress Bar */}
      <div className="space-y-1">
         <div className="flex justify-between text-xs font-bold text-slate-400 font-mono">
            <span>PAGE: {toHindi(currentPDFPage)} / {toHindi(totalPDFPages)}</span>
            <span className={isPaused ? "text-amber-500" : "text-emerald-400"}>{toHindi(progress)}%</span>
         </div>
         <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <div 
              className={`h-full transition-all duration-500 ease-out shadow-[0_0_10px_currentColor] ${isPaused ? 'bg-amber-500' : 'bg-[#c5a059]'}`}
              style={{ width: `${progress}%` }}
            ></div>
         </div>
         <p className="text-[10px] text-slate-600 text-center pt-1 font-mono">
           AUTO-SAVE ENABLED. SESSION PERSISTENT.
         </p>
      </div>
    </div>
  );
};
