
import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, X, BookOpenCheck, Image as ImageIcon } from 'lucide-react';
import { UploadedImage } from '../types';

interface ImageUploaderProps {
  image: UploadedImage | null;
  onImageSelected: (base64: string, mimeType: string, previewUrl: string) => void;
  onPdfSelected: (file: File) => void;
  onClear: () => void;
  isLoading: boolean;
  isPdfMode?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  image, 
  onImageSelected,
  onPdfSelected,
  onClear,
  isLoading,
  isPdfMode
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    if (file.type === 'application/pdf') {
      onPdfSelected(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Resize if too large (max 2000px) to optimize Gemini payload
          const MAX_SIZE = 2000;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const base64 = canvas.toDataURL('image/jpeg', 0.85); // 0.85 Quality
          const cleanBase64 = base64.split(',')[1];
          
          onImageSelected(cleanBase64, 'image/jpeg', base64);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      alert('الرجاء رفع ملف PDF أو صورة (JPG/PNG).');
    }
  };

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [onPdfSelected, onImageSelected]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const triggerUpload = () => {
    if (!isLoading) fileInputRef.current?.click();
  };

  // Case 1: Processing Mode (Showing the current page being analyzed)
  if (image) {
    return (
      <div className="w-full h-full min-h-[300px] flex flex-col bg-slate-900 rounded-xl overflow-hidden border border-white/10">
         {/* Image Viewer Area */}
         <div className="flex-1 relative overflow-auto flex items-center justify-center p-4 bg-black/20">
            <img 
              src={image.previewUrl} 
              alt="Current Page" 
              className="max-w-full h-auto object-contain shadow-2xl rounded border border-white/5"
            />
            {/* Overlay Status */}
            <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 backdrop-blur px-4 py-1.5 rounded-full shadow-lg border flex items-center gap-2 ${isLoading ? 'bg-slate-900/90 border-[#c5a059]/30' : 'bg-red-950/90 border-red-500/50'}`}>
                {isLoading ? (
                  <>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
                    <span className="text-xs font-bold text-white tracking-wide">
                      {isPdfMode ? 'AUTO-ANALYSIS RUNNING...' : 'ANALYZING IMAGE...'}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"></div>
                    <span className="text-xs font-bold text-red-200 tracking-wide">
                      توقف بسبب خطأ (راجع الخطأ بالأسفل)
                    </span>
                  </>
                )}
            </div>
         </div>
         
         {/* Footer / Controls */}
         <div className="bg-slate-800 border-t border-white/5 p-3 flex justify-between items-center">
            <span className="text-xs text-slate-400 font-medium font-mono">
              {isPdfMode ? 'MODE: BATCH SEQUENCE' : 'MODE: SINGLE SHOT'}
            </span>
            {!isLoading && (
               <button
                 onClick={onClear}
                 className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1 px-3 py-1 hover:bg-red-900/20 rounded-lg transition-colors"
               >
                 <X size={14} /> Close
               </button>
            )}
         </div>
      </div>
    );
  }

  // Case 2: Idle Mode (Waiting for PDF Upload)
  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full h-full min-h-[300px] rounded-xl overflow-hidden transition-all duration-300
        flex flex-col items-center justify-center text-center p-8
        border border-dashed cursor-pointer
        ${isLoading ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-700' : ''}
        ${!isLoading && isDragging ? 'border-[#c5a059] bg-[#c5a059]/5 scale-[1.01] shadow-[0_0_30px_rgba(197,160,89,0.1)]' : ''}
        ${!isLoading && !isDragging ? 'border-slate-700 bg-slate-900/50 hover:border-[#c5a059]/50 hover:bg-slate-800' : ''}
      `}
      onClick={triggerUpload}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf, image/jpeg, image/png, image/webp"
        className="hidden"
        disabled={isLoading}
      />

      {isLoading ? (
        <div className="flex flex-col items-center">
           <div className="w-12 h-12 border-4 border-[#c5a059]/20 border-t-[#c5a059] rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(197,160,89,0.2)]"></div>
           <p className="text-sm font-bold text-[#c5a059] animate-pulse tracking-widest">PROCESSING DATA...</p>
        </div>
      ) : (
        <>
          <div className={`p-5 rounded-full mb-6 transition-all duration-300 ${isDragging ? 'bg-[#c5a059] text-slate-900' : 'bg-slate-800 text-[#c5a059] border border-white/5'}`}>
             <div className="relative">
                <BookOpenCheck size={48} strokeWidth={1.5} />
                <ImageIcon size={24} className="absolute -bottom-2 -right-2 text-white bg-[#c5a059] rounded-full p-0.5" />
             </div>
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2">رفع الملفات</h3>
          
          <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-6">
             قم بسحب وإفلات 
             <span className="font-bold text-[#c5a059]"> ملف PDF </span>
             للمعالجة الكاملة، أو 
             <span className="font-bold text-[#c5a059]"> صورة </span>
             لاستخراج صفحة واحدة.
          </p>

          <div className="flex gap-2">
             <span className="px-3 py-1 bg-[#c5a059]/10 text-[#c5a059] border border-[#c5a059]/20 rounded text-[10px] font-bold font-mono">PDF SUPPORTED</span>
             <span className="px-3 py-1 bg-slate-800 text-slate-500 rounded text-[10px] font-mono">JPG / PNG</span>
          </div>

          {isDragging && (
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-10 animate-in fade-in duration-200">
              <div className="text-[#c5a059] font-bold text-lg flex items-center gap-3">
                 <Upload size={24} className="animate-bounce" />
                 <span>DROP FILE TO UPLOAD</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
