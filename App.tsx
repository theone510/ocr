
import React, { useState, useEffect, useRef } from 'react';
import { PageData, Book, LibraryState, UploadedImage, LoadingState } from './types';
import { analyzeManuscript } from './services/geminiService';
import { loadPDF, renderPageAsImage, PDFDocumentProxy } from './services/pdfService';
import { ImageUploader } from './components/ImageUploader';
import { ResultDisplay } from './components/ResultDisplay';
import { SessionSetup } from './components/SessionSetup';
import { BatchControls } from './components/BatchControls';
import { Button } from './components/Button';
import { 
  ScrollText, 
  BookOpen, 
  History,
  Trash2,
  ArrowRight,
  LogOut,
  FileText,
  Download,
  Eye,
  Edit,
  Save,
  X,
  User,
  Building2,
  BookCopy,
  PlusCircle,
  Hash,
  PanelRightClose,
  PanelRightOpen,
  Calendar,
  MonitorDown,
  Upload,
  Pencil,
  BookOpenCheck,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  SkipBack,
  Search,
  FileCode
} from 'lucide-react';

const STORAGE_KEY = 'manuscript_library_v2'; 

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Helper to convert Western digits to Hindi digits
export const toHindi = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null) return '';
  return String(num).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
};

// Helper to convert Hindi digits to Western digits (for import parsing)
export const fromHindi = (str: string | undefined | null): string => {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
};

const App: React.FC = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [library, setLibrary] = useState<LibraryState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
         const parsed = JSON.parse(saved);
         if (!parsed.publishers) parsed.publishers = ['العتبة الحسينية المقدسة', 'دار المعارف', 'مؤسسة الأعلمي للمطبوعات'];
         if (!parsed.authors) parsed.authors = ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى'];
         return parsed;
      }
      return { 
        books: {}, 
        publishers: ['العتبة الحسينية المقدسة', 'دار المعارف', 'مؤسسة الأعلمي للمطبوعات'],
        authors: ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى']
      };
    } catch (e) {
      return { books: {}, publishers: [], authors: [] };
    }
  });

  const [activeSession, setActiveSession] = useState<{bookTitle: string, currentPage: number} | null>(null);
  const [view, setView] = useState<'setup' | 'workspace' | 'library' | 'full-viewer'>('setup');
  const [viewerMode, setViewerMode] = useState<'read' | 'edit'>('read');
  const [viewingBookTitle, setViewingBookTitle] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<UploadedImage | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [lastProcessedPageId, setLastProcessedPageId] = useState<string | null>(null);

  // --- PDF Batch State ---
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [currentPdfPageIdx, setCurrentPdfPageIdx] = useState<number>(1); // 1-based index for PDF pages
  
  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // Ref to handle loop control without dependency staleness
  const batchControlRef = useRef({ 
    shouldStop: false, 
    activeBook: '', 
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
      console.error("Storage Error", e);
    }
  }, [library]);

  // Handle PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    }
  };

  const handleStartSession = (data: { 
    bookTitle: string, 
    startPage: number,
    author?: string,
    publisher?: string,
    publicationPlace?: string,
    publicationYear?: string,
    totalPages?: number,
    isSeries?: boolean,
    volumeNumber?: string
  }) => {
    if (!library.books[data.bookTitle]) {
       setLibrary(prev => ({
         ...prev,
         books: {
           ...prev.books,
           [data.bookTitle]: {
             title: data.bookTitle,
             pages: [],
             author: data.author,
             publisher: data.publisher,
             publicationPlace: data.publicationPlace,
             publicationYear: data.publicationYear,
             totalPages: data.totalPages,
             isSeries: data.isSeries,
             volumeNumber: data.volumeNumber
           }
         }
       }));
    }

    setActiveSession({ bookTitle: data.bookTitle, currentPage: data.startPage });
    setView('workspace');
    setLastProcessedPageId(null);
    setCurrentImage(null);
    setLoadingState(LoadingState.IDLE);
    
    // Reset Batch State on new session
    setPdfDoc(null);
    setBatchStatus('idle');
  };

  const handleEndSession = () => {
    setActiveSession(null);
    setView('setup');
    setPdfDoc(null);
    setBatchStatus('idle');
    setCurrentImage(null);
  };

  const handleAddPublisher = (name: string) => {
    setLibrary(prev => {
      if (prev.publishers.includes(name)) return prev;
      return { ...prev, publishers: [...prev.publishers, name] };
    });
  };

  const handleAddAuthor = (name: string) => {
    setLibrary(prev => {
      if (prev.authors && prev.authors.includes(name)) return prev;
      return { ...prev, authors: [...(prev.authors || []), name] };
    });
  };

  // --- Single Image Handlers ---
  const handleImageSelected = async (base64: string, mimeType: string, previewUrl: string) => {
    setCurrentImage({ base64, mimeType, previewUrl });
    setLoadingState(LoadingState.ANALYZING);
    setError(null);
    setBatchStatus('idle'); // Ensure batch is idle if manual image upload

    try {
      const text = await analyzeManuscript(base64, mimeType);
      
      if (activeSession) {
        const pageId = generateId();
        const newPage: PageData = {
          id: pageId,
          pageNumber: activeSession.currentPage,
          text: text,
          timestamp: Date.now(),
          previewUrl: ''
        };

        setLibrary(prev => {
          const currentBook = prev.books[activeSession.bookTitle];
          if (!currentBook) return prev;
          
          let updatedPages = [...currentBook.pages];
          const collisionIndex = updatedPages.findIndex(p => p.pageNumber === activeSession.currentPage);
          
          if (collisionIndex !== -1) {
            // Shift pages if inserting in middle
            updatedPages = updatedPages.map(p => {
               if (p.pageNumber >= activeSession.currentPage) {
                 return { ...p, pageNumber: p.pageNumber + 1 };
               }
               return p;
            });
          }
          updatedPages.push(newPage);
          updatedPages.sort((a, b) => a.pageNumber - b.pageNumber);

          return {
            ...prev,
            books: {
              ...prev.books,
              [activeSession.bookTitle]: { ...currentBook, pages: updatedPages }
            }
          };
        });

        setLastProcessedPageId(pageId);
        setLoadingState(LoadingState.SUCCESS);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء استخراج النص');
      setLoadingState(LoadingState.ERROR);
    }
  };


  // --- PDF Batch Logic ---

  const handlePdfSelected = async (file: File) => {
    if (!activeSession) return;
    
    setLoadingState(LoadingState.ANALYZING); // Show global loading while parsing PDF
    try {
      const doc = await loadPDF(file);
      setPdfDoc(doc);
      setPdfFileName(file.name);
      setLoadingState(LoadingState.IDLE);
      
      // Prompt user for PDF start page (This handles the "resume" requirement)
      // Defaults to the currently expected page if new, or 1.
      const suggestedPdfPage = 1; 
      
      const userStartPdfPage = prompt(
        `تم تحميل ملف PDF يحتوي على ${doc.numPages} صفحة.\n\nمن أي صفحة في الـ PDF تريد بدء الاستخراج؟\n(أدخل رقم الصفحة في الـ PDF)`,
        suggestedPdfPage.toString()
      );

      if (userStartPdfPage) {
        const startIdx = parseInt(userStartPdfPage) || 1;
        // Clamp startIdx
        const safeStartIdx = Math.max(1, Math.min(startIdx, doc.numPages));
        
        setCurrentPdfPageIdx(safeStartIdx);
        
        // Setup Batch Control Ref
        batchControlRef.current = {
          shouldStop: false,
          activeBook: activeSession.bookTitle,
        };
        
        // Start immediately
        setBatchStatus('running');
        processNextBatchPage(doc, safeStartIdx, activeSession.currentPage);
      } else {
        // Cancelled
        setPdfDoc(null);
        setLoadingState(LoadingState.IDLE);
      }

    } catch (err) {
      console.error(err);
      alert("فشل في قراءة ملف PDF. قد يكون معطوباً أو محمياً.");
      setLoadingState(LoadingState.IDLE);
    }
  };

  const processNextBatchPage = async (doc: PDFDocumentProxy, pdfPageNum: number, manuscriptPageNum: number) => {
    // Check Stop Condition
    if (batchControlRef.current.shouldStop) {
        setBatchStatus('paused');
        return;
    }

    if (pdfPageNum > doc.numPages) {
        setBatchStatus('completed');
        alert(`تم الانتهاء من معالجة الكتاب بالكامل (${doc.numPages} صفحة).`);
        setPdfDoc(null);
        setBatchStatus('idle');
        setLoadingState(LoadingState.IDLE);
        setCurrentImage(null);
        return;
    }

    setLoadingState(LoadingState.ANALYZING);
    setCurrentPdfPageIdx(pdfPageNum);
    setActiveSession(prev => prev ? ({ ...prev, currentPage: manuscriptPageNum }) : null);

    try {
      // 1. Render Page to Image
      const { base64, mimeType, previewUrl } = await renderPageAsImage(doc, pdfPageNum);
      
      // 2. Update UI to show the image being processed
      setCurrentImage({
          base64,
          mimeType,
          previewUrl
      });

      // 3. Analyze (Extract Text)
      const text = await analyzeManuscript(base64, mimeType);
      
      // 4. Save
      const pageId = generateId();
      const newPage: PageData = {
        id: pageId,
        pageNumber: manuscriptPageNum,
        text: text,
        timestamp: Date.now(),
        previewUrl: '' // We don't save preview URL for PDFs to save space
      };

      setLibrary(prev => {
        const currentBook = prev.books[batchControlRef.current.activeBook];
        if (!currentBook) return prev; 
        
        let updatedPages = [...currentBook.pages];
        
        const collisionIndex = updatedPages.findIndex(p => p.pageNumber === manuscriptPageNum);
        if (collisionIndex !== -1) {
             updatedPages = updatedPages.map(p => {
            if (p.pageNumber >= manuscriptPageNum) {
              return { ...p, pageNumber: p.pageNumber + 1 };
            }
            return p;
          });
        }
        updatedPages.push(newPage);
        updatedPages.sort((a, b) => a.pageNumber - b.pageNumber);

        return {
          ...prev,
          books: {
            ...prev.books,
            [batchControlRef.current.activeBook]: {
              ...currentBook,
              pages: updatedPages
            }
          }
        };
      });

      setLastProcessedPageId(pageId);
      
      // 5. Loop (Sequential Processing)
      // Small delay to allow UI to render the completion of this page before starting next
      setTimeout(() => {
          // Re-check stop condition before next iteration inside timeout
          if (!batchControlRef.current.shouldStop) {
            processNextBatchPage(doc, pdfPageNum + 1, manuscriptPageNum + 1);
          } else {
             setBatchStatus('paused');
             setLoadingState(LoadingState.IDLE);
          }
      }, 500);

    } catch (err: any) {
      console.error("Batch Error:", err);
      // Don't use alert inside the loop if possible, or show it once
      setError(`خطأ في صفحة PDF رقم ${pdfPageNum}: ${err.message}`);
      setBatchStatus('paused');
      batchControlRef.current.shouldStop = true;
      setLoadingState(LoadingState.ERROR);
    }
  };

  const pauseBatch = () => {
    batchControlRef.current.shouldStop = true;
    setBatchStatus('paused');
    setLoadingState(LoadingState.IDLE);
  };

  const resumeBatch = () => {
    if (!pdfDoc || !activeSession) return;
    batchControlRef.current.shouldStop = false;
    setBatchStatus('running');
    setError(null);
    // Resume from current indices
    processNextBatchPage(pdfDoc, currentPdfPageIdx, activeSession.currentPage);
  };

  const handleUpdatePageText = (newText: string) => {
    if (!activeSession || !lastProcessedPageId) return;
    setLibrary(prev => {
      const book = prev.books[activeSession.bookTitle];
      if (!book) return prev;
      const updatedPages = book.pages.map(p => p.id === lastProcessedPageId ? { ...p, text: newText } : p);
      return { ...prev, books: { ...prev.books, [activeSession.bookTitle]: { ...book, pages: updatedPages } } };
    });
  };

  const handleUpdateBookPage = (bookTitle: string, pageId: string, newText: string) => {
    setLibrary(prev => {
      const book = prev.books[bookTitle];
      if (!book) return prev;
      const updatedPages = book.pages.map(p => p.id === pageId ? { ...p, text: newText } : p);
      return { ...prev, books: { ...prev.books, [bookTitle]: { ...book, pages: updatedPages } } };
    });
  };

  const handlePageNumberEdit = (bookTitle: string, pageId: string, newNumber: number) => {
    setLibrary(prev => {
      const book = prev.books[bookTitle];
      if (!book) return prev;
      
      const updatedPages = book.pages.map(p => p.id === pageId ? { ...p, pageNumber: newNumber } : p)
        .sort((a, b) => a.pageNumber - b.pageNumber);
        
      return {
        ...prev,
        books: {
          ...prev.books,
          [bookTitle]: { ...book, pages: updatedPages }
        }
      };
    });
  };

  const lastPageData = activeSession && lastProcessedPageId 
    ? library.books[activeSession.bookTitle]?.pages.find(p => p.id === lastProcessedPageId) || null
    : null;

  if (showLanding) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-4 overflow-hidden font-sans" dir="rtl">
         {/* Premium Radial Background */}
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black"></div>
         
         {/* Golden Glows */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c5a059]/5 rounded-full blur-[100px] pointer-events-none"></div>

         <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-2xl w-full">
             <div className="flex flex-col items-center justify-center mb-4">
                <div className="w-32 h-32 md:w-40 md:h-40 bg-gradient-to-br from-slate-900 to-slate-950 rounded-full border border-[#c5a059]/30 flex items-center justify-center text-[#c5a059] shadow-[0_0_50px_rgba(197,160,89,0.15)] mb-8 ring-1 ring-white/5">
                   <ScrollText size={64} strokeWidth={1} />
                </div>
                <h1 className="text-4xl md:text-6xl font-manuscript font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#c5a059] to-[#8a6d32] leading-tight drop-shadow-sm mb-4">
                   وحدة تنمية المقتنيات
                </h1>
                <p className="text-slate-400 text-lg md:text-xl font-light tracking-wide">
                   العتبة الحسينية المقدسة
                </p>
             </div>
             
             <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md shadow-2xl ring-1 ring-black/50">
                 <p className="text-slate-300 text-lg mb-8 font-manuscript border-b border-white/5 pb-4">
                   نظام الأرشفة الذكي للمخطوطات والوثائق <span className="text-[#c5a059]">v4.0</span>
                 </p>
                 <div className="flex flex-col gap-3">
                   <button 
                     onClick={() => setShowLanding(false)}
                     className="group w-full py-4 bg-gradient-to-r from-[#c5a059] to-[#9f7d3d] text-slate-900 font-bold text-xl rounded-xl shadow-[0_0_20px_rgba(197,160,89,0.2)] hover:shadow-[0_0_30px_rgba(197,160,89,0.4)] hover:scale-[1.02] transition-all duration-300 active:scale-95 flex items-center justify-center gap-3"
                   >
                     <span>نظام الأرشفة</span>
                     <ArrowRight className="group-hover:-translate-x-1 transition-transform" />
                   </button>
                   
                   <button 
                     onClick={() => { setShowLanding(false); setView('library'); }}
                     className="group w-full py-3 bg-slate-800 text-[#c5a059] font-bold text-lg rounded-xl border border-[#c5a059]/20 hover:bg-[#c5a059]/10 hover:border-[#c5a059]/50 transition-all duration-300 active:scale-95 flex items-center justify-center gap-3"
                   >
                     <span>المكتبة الرقمية</span>
                     <BookCopy size={20} />
                   </button>
                 </div>
             </div>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-[#c5a059]/30 selection:text-white" dir="rtl">
      {view !== 'full-viewer' && (
        <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/5 shadow-lg">
          <div className={`mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between transition-all duration-300 ${view === 'workspace' ? 'w-full' : 'max-w-7xl'}`}>
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => setView('setup')}
            >
              <div className="p-2 bg-gradient-to-br from-[#c5a059] to-[#8a6d32] rounded-lg text-slate-900 shadow-md">
                <ScrollText size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-tight">وحدة تنمية المقتنيات</h1>
                <p className="text-[10px] text-[#c5a059] font-medium opacity-90 tracking-wider">PLATINUM EDITION v4.0</p>
              </div>
            </div>
            
            <nav className="flex items-center gap-2">
              {installPrompt && (
                <Button size="sm" variant="secondary" onClick={handleInstallApp} className="animate-pulse">
                  <MonitorDown size={16} className="ml-2" /> تثبيت التطبيق
                </Button>
              )}

              {view === 'workspace' && activeSession && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-800 text-[#c5a059] rounded-full border border-[#c5a059]/20 ml-4 shadow-inner">
                  <BookOpen size={14} />
                  <span className="text-sm font-bold">{activeSession.bookTitle}</span>
                </div>
              )}
              {view === 'workspace' ? (
                <Button variant="ghost" size="sm" onClick={handleEndSession} className="text-slate-400 hover:text-white">
                  <LogOut size={16} className="ml-2" />إنهاء الجلسة
                </Button>
              ) : view === 'library' ? (
                <Button variant="ghost" size="sm" onClick={() => setView('setup')} className="text-slate-400 hover:text-white">
                  <ArrowRight size={16} className="ml-2" />عودة للرئيسية
                </Button>
              ) : view === 'setup' ? (
                <Button variant="ghost" size="sm" onClick={() => setView('library')} className="text-[#c5a059] hover:bg-[#c5a059]/10 border border-[#c5a059]/20">
                  <BookCopy size={16} className="ml-2" /> المكتبة الرقمية
                </Button>
              ) : null}
            </nav>
          </div>
        </header>
      )}

      <main className={`transition-all duration-300 ${view === 'full-viewer' ? '' : view === 'workspace' ? 'w-full px-4 sm:px-6 py-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'}`}>
        {view === 'setup' && (
          <SessionSetup 
            library={library} 
            onStartSession={handleStartSession} 
            onOpenLibrary={() => setView('library')} 
            onAddPublisher={handleAddPublisher}
            onAddAuthor={handleAddAuthor}
          />
        )}
        
        {view === 'workspace' && activeSession && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:h-[calc(100vh-6rem)]">
            <section className="flex flex-col gap-4 h-full order-1 lg:order-1 min-h-[500px] lg:min-h-0">
              
              {/* Batch Controls (Only Visible when PDF is loaded) */}
              {pdfDoc && batchStatus !== 'idle' && (
                 <BatchControls 
                   totalPDFPages={pdfDoc.numPages}
                   currentPDFPage={currentPdfPageIdx}
                   isProcessing={batchStatus === 'running'}
                   isPaused={batchStatus === 'paused'}
                   onPause={pauseBatch}
                   onResume={resumeBatch}
                   fileName={pdfFileName}
                 />
              )}

              <div className="bg-slate-900 p-4 rounded-2xl shadow-2xl border border-white/5 flex-1 flex flex-col relative overflow-hidden">
                <div className="flex items-center justify-between mb-3 z-10">
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">
                      {pdfDoc ? 'نظام المعالجة الآلية' : 'محطة رفع الملفات'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      الصفحة الحالية: <span className="font-bold text-[#c5a059] font-mono text-sm">{toHindi(activeSession.currentPage)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-500">ص:</span>
                    <input type="number" value={activeSession.currentPage} onChange={(e) => setActiveSession({...activeSession, currentPage: parseInt(e.target.value) || 1})} className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-center font-bold outline-none text-[#c5a059] focus:border-[#c5a059]" />
                  </div>
                </div>
                <div className="flex-1 min-h-0 z-10">
                  <ImageUploader 
                    image={currentImage} 
                    onImageSelected={handleImageSelected}
                    onPdfSelected={handlePdfSelected}
                    onClear={() => { 
                      setCurrentImage(null); 
                      setLoadingState(LoadingState.IDLE);
                      setBatchStatus('idle');
                      setPdfDoc(null);
                      batchControlRef.current.shouldStop = true;
                    }} 
                    isLoading={loadingState === LoadingState.ANALYZING} 
                    isPdfMode={!!pdfDoc}
                  />
                </div>
              </div>
            </section>
            <section className="flex flex-col h-full order-2 lg:order-2 min-h-[500px] lg:min-h-0">
               <ResultDisplay text={lastPageData?.text || null} isLoading={loadingState === LoadingState.ANALYZING} error={error} onTextChange={handleUpdatePageText} pageNumber={lastPageData?.pageNumber} bookTitle={activeSession.bookTitle} isAutoSaved={true} />
            </section>
          </div>
        )}

        {view === 'library' && (
           <LibraryView 
             library={library} 
             setLibrary={setLibrary}
             onLoadPage={(book, page) => {
               setActiveSession({ bookTitle: book, currentPage: page.pageNumber });
               setLastProcessedPageId(page.id);
               setView('workspace');
             }}
             onInsertPage={(bookTitle, afterPageNumber) => {
               setActiveSession({ bookTitle, currentPage: afterPageNumber + 1 });
               setView('workspace');
             }}
             onUpdatePageNumber={handlePageNumberEdit}
             onOpenFullViewer={(bookTitle, mode) => {
               setViewingBookTitle(bookTitle);
               setViewerMode(mode);
               setView('full-viewer');
             }}
           />
        )}

        {view === 'full-viewer' && viewingBookTitle && (
          <FullBookViewer 
            book={library.books[viewingBookTitle]} 
            initialMode={viewerMode}
            onClose={() => setView('library')} 
            onUpdatePage={handleUpdateBookPage}
          />
        )}
      </main>
    </div>
  );
};

const LibraryView: React.FC<{
  library: LibraryState;
  setLibrary: React.Dispatch<React.SetStateAction<LibraryState>>;
  onLoadPage: (bookTitle: string, page: PageData) => void;
  onInsertPage: (bookTitle: string, afterPageNumber: number) => void;
  onUpdatePageNumber: (bookTitle: string, pageId: string, newNumber: number) => void;
  onOpenFullViewer: (bookTitle: string, mode: 'read' | 'edit') => void;
}> = ({ library, setLibrary, onLoadPage, onInsertPage, onUpdatePageNumber, onOpenFullViewer }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // FIX: Cast Object.values to Book[] to prevent 'unknown' type errors
  const books = (Object.values(library.books) as Book[]).filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (book.author && book.author.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteBook = (title: string) => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`هل أنت متأكد من حذف كتاب "${title}" وكافة صفحاته؟`)) {
      setLibrary(prev => {
        const newBooks = { ...prev.books };
        delete newBooks[title];
        return { ...prev, books: newBooks };
      });
    }
  };

  const handleImportHTML = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');

      const titleEl = doc.querySelector('.book-title');
      if (!titleEl) throw new Error('الملف لا يحتوي على عنوان كتاب صحيح (class="book-title")');
      
      const title = titleEl.textContent?.trim() || "كتاب مستورد";
      
      let author = "";
      let publisher = "";
      let publicationPlace = "";
      let publicationYear = "";
      
      doc.querySelectorAll('.book-meta p').forEach(p => {
        const txt = p.textContent || "";
        if (txt.includes('تأليف:')) author = txt.split('تأليف:')[1].trim();
        if (txt.includes('إصدار:')) publisher = txt.split('إصدار:')[1].trim();
        if (txt.includes('مكان النشر:')) publicationPlace = txt.split('مكان النشر:')[1].trim();
        if (txt.includes('سنة النشر:')) publicationYear = txt.split('سنة النشر:')[1].trim();
      });

      const pageContainers = doc.querySelectorAll('.page-container');
      if (pageContainers.length === 0) throw new Error('لا توجد صفحات في الملف (class="page-container")');

      const newPages: PageData[] = [];
      pageContainers.forEach(container => {
         const pageNumEl = container.querySelector('.page-number');
         const contentEl = container.querySelector('.manuscript-content');
         
         if (pageNumEl && contentEl) {
           const pageNum = parseInt(fromHindi(pageNumEl.textContent || "0"));
           if (isNaN(pageNum)) return;
           
           let content = contentEl.innerHTML;
           content = content.replace(/\s+id="heading-[^"]*"/g, '');
           content = fromHindi(content);

           newPages.push({
             id: generateId(),
             pageNumber: pageNum,
             text: content,
             timestamp: Date.now(),
             previewUrl: '' 
           });
         }
      });

      if (newPages.length === 0) throw new Error('لم يتم استخراج أي صفحات صالحة');

      setLibrary(prev => {
        const existingBook = prev.books[title];
        let mergedPages = existingBook ? [...existingBook.pages] : [];
        
        newPages.forEach(np => {
           const idx = mergedPages.findIndex(p => p.pageNumber === np.pageNumber);
           if (idx !== -1) {
             mergedPages[idx] = { ...mergedPages[idx], text: np.text };
           } else {
             mergedPages.push(np);
           }
        });
        
        mergedPages.sort((a,b) => a.pageNumber - b.pageNumber);

        return {
          ...prev,
          books: {
            ...prev.books,
            [title]: {
              title,
              author: author || existingBook?.author,
              publisher: publisher || existingBook?.publisher,
              publicationPlace: publicationPlace || existingBook?.publicationPlace,
              publicationYear: publicationYear || existingBook?.publicationYear,
              pages: mergedPages,
              totalPages: Math.max(mergedPages.length, existingBook?.totalPages || 0),
              isSeries: existingBook?.isSeries,
              volumeNumber: existingBook?.volumeNumber
            }
          }
        };
      });
      
      alert(`تم استيراد ${newPages.length} صفحة وضمها للكتاب: ${title}`);

    } catch (err: any) {
      console.error(err);
      alert('فشل استيراد الملف: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadHTML = (book: Book) => {
    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@300;400;500;600;700&display=swap');
      body { font-family: 'Amiri', serif; direction: rtl; background: #fdfbf7; color: #1e293b; padding: 40px; max-width: 900px; margin: 0 auto; }
      .book-header { text-align: center; margin-bottom: 60px; border-bottom: 2px solid #e2e8f0; padding-bottom: 30px; }
      .book-title { font-size: 42px; font-weight: bold; color: #b45309; margin-bottom: 10px; }
      .book-meta { font-family: 'Cairo', sans-serif; color: #64748b; font-size: 14px; }
      .page-container { margin-bottom: 50px; padding-bottom: 30px; border-bottom: 1px dashed #cbd5e1; position: relative; }
      .page-number { font-family: 'Cairo', sans-serif; font-size: 12px; color: #b45309; background: #fff7ed; padding: 4px 12px; border-radius: 20px; border: 1px solid #ffedd5; display: inline-block; margin-bottom: 20px; }
      .content { font-size: 22px; line-height: 2.4; text-align: justify; }
      
      h1 { display: block; font-size: 2.2rem; font-weight: 800; color: #0f172a; margin: 1.5rem 0; border-right: 6px solid #c5a059; padding-right: 1.5rem; }
      h2 { display: block; font-size: 1.8rem; font-weight: 700; color: #334155; margin: 1.2rem 0; border-right: 4px solid #94a3b8; padding-right: 1rem; }
      h3 { display: block; font-size: 1.4rem; font-weight: 700; color: #475569; margin: 1rem 0; border-right: 2px solid #64748b; padding-right: 0.75rem; }
      .center { display: block; text-align: center; margin: 1.5rem 0; font-weight: bold; font-size: 1.4rem; color: #334155; }
      .bold { font-weight: 800; color: #000; }
      .aya { color: #059669; background: rgba(16, 185, 129, 0.05); padding: 0 4px; border-radius: 4px; border-bottom: 1px solid #10b981; }
      .hadith { color: #2563eb; background: rgba(37, 99, 235, 0.05); padding: 0 4px; border-radius: 4px; border-bottom: 1px solid #3b82f6; }
      .poetry { display: block; text-align: center; font-style: italic; margin: 2rem auto; color: #1e293b; background: #f1f5f9; padding: 20px; border-radius: 12px; border-right: 4px solid #94a3b8; border-left: 4px solid #94a3b8; width: 80%; }
      .footnote { display: block; font-size: 1.1rem; color: #64748b; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-style: italic; font-family: 'Cairo', sans-serif; }
    `;

    let htmlContent = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${book.title}</title><style>${css}</style></head><body>
        <div class="book-header">
          <h1 class="book-title">${book.title}</h1>
          <div class="book-meta">
            <span>تأليف: ${book.author || 'غير معروف'}</span> • 
            <span>الناشر: ${book.publisher || 'غير معروف'}</span> • 
            <span>${toHindi(book.pages.length)} صفحة</span>
          </div>
        </div>`;

    // Sort pages
    const sortedPages = [...book.pages].sort((a,b) => a.pageNumber - b.pageNumber);

    sortedPages.forEach(page => {
      let processedText = page.text
        .replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1')
        .replace(/\n+/g, '<br/>')
        .replace(/<(h[1-3])>(.*?)<\/\1>/g, '<$1>$2</$1>')
        .replace(/<center>(.*?)<\/center>/g, '<span class="center">$1</span>')
        .replace(/<bold>(.*?)<\/bold>/g, '<span class="bold">$1</span>')
        .replace(/<aya>(.*?)<\/aya>/g, '<span class="aya">$1</span>')
        .replace(/<hadith>(.*?)<\/hadith>/g, '<span class="hadith">$1</span>')
        .replace(/<poetry>(.*?)<\/poetry>/g, '<div class="poetry">$1</div>')
        .replace(/<footnote>(.*?)<\/footnote>/gs, '<div class="footnote">$1</div>')
        .replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`);

      htmlContent += `
        <div class="page-container">
          <span class="page-number">صفحة ${toHindi(page.pageNumber)}</span>
          <div class="content">${processedText}</div>
        </div>`;
    });

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title}_طباعة.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadMenuOpen(null);
  };

  const downloadText = (book: Book) => {
    let content = ` الكتاب: ${book.title}\n المؤلف: ${book.author || 'غير معروف'}\n الناشر: ${book.publisher || 'غير معروف'}\n\n=========================================\n\n`;
    
    const sortedPages = [...book.pages].sort((a,b) => a.pageNumber - b.pageNumber);
    
    sortedPages.forEach(page => {
      content += `--- صفحة ${toHindi(page.pageNumber)} ---\n\n`;
      let text = page.text
         .replace(/<footnote>(\d+):(.*?)<\/footnote>/gs, '\n   [$1] $2') // Format footnotes
         .replace(/<[^>]+>/g, '') // Strip other tags
         .replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`) // Hindi digits refs
         .trim();
      
      content += text + "\n\n\n";
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title}_نص.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadMenuOpen(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {/* Backdrop for menu */}
      {downloadMenuOpen && <div className="fixed inset-0 z-30" onClick={() => setDownloadMenuOpen(null)}></div>}

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900 p-6 rounded-2xl border border-white/5 shadow-xl">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookCopy size={24} className="text-[#c5a059]"/>
            المكتبة المركزية
          </h2>
          <p className="text-slate-400 text-sm mt-1">إدارة الأرشيف والمخطوطات</p>
           <input 
             type="file" 
             ref={fileInputRef} 
             accept=".html,.htm" 
             className="hidden" 
             onChange={handleImportHTML} 
           />
           <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="mt-2 border-dashed border-slate-600 text-slate-400 hover:border-[#c5a059] hover:text-[#c5a059]">
              <Upload size={16} className="ml-2" /> استيراد (HTML)
           </Button>
        </div>
        <div className="relative w-full md:w-96">
           <Search className="absolute right-3 top-3 text-slate-500" size={20} />
           <input 
             type="text" 
             placeholder="بحث عن كتاب أو مؤلف..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full pr-10 pl-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:ring-1 focus:ring-[#c5a059] text-white outline-none"
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {books.map(book => (
          <div key={book.title} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden hover:border-[#c5a059]/30 transition-all hover:shadow-2xl hover:shadow-[#c5a059]/5 flex flex-col group">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-slate-800 rounded-lg text-[#c5a059]">
                  <BookOpen size={24} />
                </div>
                <div className="flex gap-2 relative z-40">
                   <div className="relative">
                      <button 
                         onClick={() => setDownloadMenuOpen(downloadMenuOpen === book.title ? null : book.title)} 
                         className={`p-2 rounded-lg transition-colors ${downloadMenuOpen === book.title ? 'bg-[#c5a059] text-slate-900' : 'hover:bg-slate-800 text-slate-500 hover:text-white'}`} 
                         title="خيارات التنزيل"
                       >
                         <Download size={18} />
                       </button>
                       {downloadMenuOpen === book.title && (
                          <div className="absolute top-full left-0 mt-2 w-56 bg-slate-900 border border-[#c5a059]/30 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 z-50 ring-1 ring-black">
                             <button onClick={() => downloadHTML(book)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-[#c5a059] transition-colors text-right border-b border-white/5">
                                <div className="p-1.5 bg-orange-500/10 rounded text-orange-500"><FileCode size={16}/></div>
                                <div className="flex flex-col items-start">
                                   <span className="font-bold">نسخة HTML</span>
                                   <span className="text-[10px] text-slate-500">بنفس تنسيق العرض</span>
                                </div>
                             </button>
                             <button onClick={() => downloadText(book)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-[#c5a059] transition-colors text-right">
                                <div className="p-1.5 bg-blue-500/10 rounded text-blue-500"><FileText size={16}/></div>
                                <div className="flex flex-col items-start">
                                   <span className="font-bold">نسخة نصية</span>
                                   <span className="text-[10px] text-slate-500">بدون وسوم (TXT)</span>
                                </div>
                             </button>
                          </div>
                       )}
                   </div>
                   <button onClick={() => handleDeleteBook(book.title)} className="p-2 hover:bg-red-900/20 rounded-lg text-slate-500 hover:text-red-500" title="حذف">
                     <Trash2 size={18} />
                   </button>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">{toHindi(book.title)}</h3>
              
              <div className="space-y-2 text-sm text-slate-400 mb-6">
                {book.author && <div className="flex items-center gap-2"><User size={14}/> <span>{toHindi(book.author)}</span></div>}
                {book.publisher && <div className="flex items-center gap-2"><Building2 size={14}/> <span>{toHindi(book.publisher)}</span></div>}
                <div className="flex items-center gap-2"><FileText size={14}/> <span>{toHindi(book.pages.length)} صفحة مؤرشفة</span></div>
              </div>
            </div>

            <div className="bg-slate-950/50 p-4 border-t border-white/5 flex items-center justify-between gap-2">
               <div className="flex gap-2 w-full">
                 <Button size="sm" variant="secondary" onClick={() => onOpenFullViewer(book.title, 'read')} className="flex-1 text-xs">
                   <Eye size={14} className="ml-1"/> تصفح
                 </Button>
                 <Button size="sm" variant="primary" onClick={() => onInsertPage(book.title, book.pages.length > 0 ? Math.max(...book.pages.map(p=>p.pageNumber)) : 0)} className="flex-1 text-xs">
                   <PlusCircle size={14} className="ml-1"/> إضافة
                 </Button>
               </div>
            </div>
          </div>
        ))}
      </div>
      
      {books.length === 0 && (
        <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
           <BookOpen size={48} className="mx-auto text-slate-700 mb-4" />
           <p className="text-slate-500 text-lg">لا توجد كتب مطابقة للبحث</p>
        </div>
      )}
    </div>
  );
};

const FullBookViewer: React.FC<{
  book: Book, 
  initialMode: 'read' | 'edit',
  onClose: () => void, 
  onUpdatePage: (bookTitle: string, pageId: string, text: string) => void
}> = ({ book, initialMode, onClose, onUpdatePage }) => {
  const [toc, setToc] = useState<{id: string, title: string, level: number, page: number, index: number}[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode);
  
  // PAGE FLIPPING LOGIC
  const [activePageIndex, setActivePageIndex] = useState(0);
  const totalPages = book.pages.length;
  
  // Ref for scroll container to handle pagination on scroll
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'read') {
        if (e.key === 'ArrowRight') handlePrevPage();
        if (e.key === 'ArrowLeft') handleNextPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, activePageIndex]);

  useEffect(() => {
    const extractedToc: any[] = [];
    book.pages.forEach((p, idx) => {
      const matches = p.text.matchAll(/<(h[1-3])>(.*?)<\/\1>/g);
      for (const match of matches) {
        extractedToc.push({
          id: `heading-${extractedToc.length}`,
          title: match[2],
          level: parseInt(match[1].substring(1)),
          page: p.pageNumber,
          index: idx // Store index for direct navigation
        });
      }
    });
    setToc(extractedToc);
  }, [book]);

  const changePage = (index: number) => {
    if (index < 0 || index >= totalPages) return;
    
    setActivePageIndex(index);
    
    // Always reset to top when changing pages manually
    setTimeout(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, 50);
  };

  const handleNextPage = () => changePage(activePageIndex + 1);
  const handlePrevPage = () => changePage(activePageIndex - 1);

  const currentPageData = book.pages[activePageIndex];

  const renderReadMode = () => {
    if (!currentPageData) return null;
    
    let headingIdx = 0; // This is naive for paging, but keeps IDs somewhat consistent locally
    // Fix: Pull footnote references inline by collapsing preceding newlines/spaces
    let pageHtml = currentPageData.text
        .replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1') // FIX: Aggressive collapse
        .replace(/\n+/g, '<br/>')
        .replace(/<(h[1-3])>(.*?)<\/\1>/g, (match, tag, title) => {
          const id = `heading-${headingIdx++}`;
          return `<${tag} id="${id}" class="viewer-${tag}">${toHindi(title)}</${tag}>`;
        })
        .replace(/<center>(.*?)<\/center>/g, '<div class="viewer-center">$1</div>')
        .replace(/<bold>(.*?)<\/bold>/g, '<span class="viewer-bold">$1</span>')
        .replace(/<aya>(.*?)<\/aya>/g, '<span class="viewer-aya">$1</span>')
        .replace(/<hadith>(.*?)<\/hadith>/g, '<span class="viewer-hadith">$1</span>')
        .replace(/<poetry>(.*?)<\/poetry>/g, '<div class="viewer-poetry">$1</div>')
        .replace(/<footnote>(.*?)<\/footnote>/gs, (match, content) => {
           // Extract footnote number for ID
           return `<div class="viewer-footnote">${toHindi(content)}</div>`;
        })
        .replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div id={`page-${currentPageData.pageNumber}`} className="p-6 md:p-8 pb-32 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative min-h-[70vh]">
            <div 
                className="font-manuscript text-3xl leading-[2.4] text-justify text-slate-200 whitespace-pre-wrap selection:bg-[#c5a059]/30"
                dangerouslySetInnerHTML={{ __html: pageHtml }}
            />
            </div>
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden relative" dir="rtl">
      <style>{`
        .viewer-h1 { display: block; font-size: 2.5rem; font-weight: 800; color: #f1f5f9; margin: 1.5rem 0; border-right: 6px solid #c5a059; padding-right: 1.5rem; }
        .viewer-h2 { display: block; font-size: 1.8rem; font-weight: 700; color: #e2e8f0; margin: 1.2rem 0; border-right: 4px solid #94a3b8; padding-right: 1rem; }
        .viewer-h3 { display: block; font-size: 1.4rem; font-weight: 700; color: #cbd5e1; margin: 1rem 0; border-right: 2px solid #64748b; padding-right: 0.75rem; }
        .viewer-center { display: block; text-align: center; margin: 1.5rem 0; font-weight: bold; font-size: 1.4rem; color: #e2e8f0; }
        .viewer-bold { font-weight: 800; color: #fff; }
        .viewer-aya { color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0 4px; border-radius: 4px; border-bottom: 2px solid #059669; }
        .viewer-hadith { color: #60a5fa; background: rgba(96, 165, 250, 0.1); padding: 0 4px; border-radius: 4px; border-bottom: 2px solid #2563eb; }
        .viewer-poetry { display: block; text-align: center; font-style: italic; margin: 2rem auto; color: #e2e8f0; background: rgba(30, 41, 59, 0.5); padding: 20px; border-radius: 12px; border-right: 4px solid #334155; border-left: 4px solid #334155; }
        .viewer-footnote { display: block; font-size: 1.1rem; color: #94a3b8; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #334155; font-style: italic; font-family: 'Cairo', sans-serif; }
        
        /* Modern Slider Styles */
        input[type=range] {
            -webkit-appearance: none; 
            background: transparent; 
        }
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: #c5a059;
            cursor: pointer;
            margin-top: -8px;
            box-shadow: 0 0 10px rgba(197, 160, 89, 0.5);
        }
        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            cursor: pointer;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
        }
      `}</style>
      
      {!showSidebar && (
        <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
          <button onClick={() => setShowSidebar(true)} className="p-3 bg-slate-800 text-slate-300 shadow-lg rounded-full hover:bg-slate-700 hover:text-white transition-all border border-slate-700"><PanelRightOpen size={24} /></button>
          <button onClick={onClose} className="p-3 bg-slate-800 text-slate-500 shadow-lg rounded-full hover:bg-red-900/20 hover:text-red-500 transition-all border border-slate-700 mt-2"><LogOut size={24} /></button>
        </div>
      )}

      {showSidebar && (
        <aside className="w-80 bg-slate-900 border-l border-white/5 flex flex-col shadow-2xl z-40 animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#c5a059]">
              <ScrollText size={20} />
              <h2 className="font-bold text-lg">فهرست الكتاب</h2>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><PanelRightClose size={20} /></button>
              <button onClick={onClose} className="p-2 hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
            {toc.length === 0 ? <p className="text-center text-slate-600 text-sm mt-10">لم يتم رصد عناوين في المتن</p> : toc.map((item, i) => (
                <button 
                    key={i} 
                    onClick={() => changePage(item.index)}
                    className={`w-full text-right flex flex-col gap-1 p-3 rounded-xl transition-all border border-transparent group ${activePageIndex === item.index ? 'bg-[#c5a059]/20 border-[#c5a059]/30' : 'hover:bg-slate-800/50 hover:border-slate-700'} ${item.level === 1 ? 'mt-4 bg-slate-800/30' : ''}`}
                >
                  <span className={`font-bold leading-snug ${item.level === 1 ? 'text-sm text-[#c5a059]' : item.level === 2 ? 'text-[13px] pr-4 text-slate-300' : 'text-[12px] pr-8 text-slate-500'}`}>{toHindi(item.title)}</span>
                  <span className="text-[10px] text-slate-600 font-bold self-end group-hover:text-[#c5a059] transition-colors font-mono">ص {toHindi(item.page)}</span>
                </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main Content Area - Single Page View */}
      <div className="flex-1 relative flex flex-col bg-slate-950 overflow-hidden">
        
        {/* Top Info Bar */}
        <div className="bg-slate-900/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex items-center justify-between z-10">
           <div className="flex flex-col">
              <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">{toHindi(book.title)}</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                 <span>{toHindi(book.publisher)}</span>
                 <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                 <span className={activePageIndex === totalPages - 1 ? 'text-emerald-500' : ''}>Page {toHindi(currentPageData?.pageNumber)} of {toHindi(totalPages)}</span>
              </div>
           </div>
           
           <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button onClick={() => setMode('read')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'read' ? 'bg-[#c5a059] text-slate-900 shadow' : 'text-slate-500 hover:bg-slate-800'}`}>
                    <span className="flex items-center gap-2"><BookOpenCheck size={16}/> قراءة</span>
                </button>
                <button onClick={() => setMode('edit')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'edit' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:bg-slate-800'}`}>
                    <span className="flex items-center gap-2"><Pencil size={16}/> تحرير</span>
                </button>
            </div>
        </div>

        {/* Scrollable Page Content */}
        <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto scroll-smooth pb-32" // Added pb-32 for dock space
        > 
            <div className={`mx-auto py-4 px-4 transition-all duration-300 ${showSidebar ? 'max-w-4xl' : 'max-w-5xl'}`}>
                {mode === 'read' ? (
                    renderReadMode()
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                       {currentPageData && (
                        <div className="bg-slate-900 border border-slate-800 shadow-xl rounded-2xl overflow-hidden min-h-[70vh]">
                            <ResultDisplay 
                                text={currentPageData.text}
                                isLoading={false}
                                error={null}
                                pageNumber={currentPageData.pageNumber}
                                bookTitle={book.title}
                                onTextChange={(val) => onUpdatePage(book.title, currentPageData.id, val)}
                                isAutoSaved={false}
                                enableStickyHeader={true}
                            />
                        </div>
                       )}
                    </div>
                )}
            </div>
        </div>

        {/* --- LUXURY FLOATING BOTTOM DOCK --- */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 ring-1 ring-black/50">
                
                {/* Progress Slider */}
                <div className="relative group">
                    <input 
                        type="range" 
                        min="0" 
                        max={totalPages - 1} 
                        value={activePageIndex} 
                        onChange={(e) => changePage(parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none"
                    />
                    <div 
                        className="absolute top-0 right-0 h-1 bg-[#c5a059] rounded-lg pointer-events-none" 
                        style={{ width: `${((activePageIndex) / (totalPages - 1)) * 100}%` }}
                    ></div>
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-6 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs font-mono py-1 px-2 rounded border border-white/10 pointer-events-none" style={{ right: `${100 - ((activePageIndex) / (totalPages - 1)) * 100}%` }}>
                       ص {toHindi(book.pages[activePageIndex]?.pageNumber)}
                    </div>
                </div>

                {/* Controls Row - CENTERED LAYOUT */}
                <div className="flex items-center justify-between relative h-10">
                    
                    {/* LEFT: Page Jump Input */}
                    <div className="flex items-center gap-2 z-10">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Page</span>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={activePageIndex + 1}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val > 0 && val <= totalPages) {
                                        changePage(val - 1);
                                    }
                                }}
                                className="w-12 bg-slate-800 border border-slate-700 rounded-lg text-center text-white text-sm font-mono py-1 focus:ring-1 focus:ring-[#c5a059] outline-none"
                            />
                            <span className="absolute -right-3 top-1 text-slate-600 text-xs">/</span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono ml-2">{toHindi(totalPages)}</span>
                    </div>

                    {/* CENTER: Navigation Buttons (ABSOLUTE) */}
                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 z-0">
                        <button 
                            onClick={() => changePage(0)}
                            disabled={activePageIndex === 0}
                            className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                            title="البداية"
                        >
                            <SkipForward size={20} />
                        </button>
                        <button 
                            onClick={handlePrevPage}
                            disabled={activePageIndex === 0}
                            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c5a059] hover:bg-[#c5a059] hover:text-slate-900 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            <ChevronRight size={24} />
                        </button>
                        
                        <div className="h-4 w-[1px] bg-slate-700 mx-2"></div>

                        <button 
                            onClick={handleNextPage}
                            disabled={activePageIndex === totalPages - 1}
                            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c5a059] hover:bg-[#c5a059] hover:text-slate-900 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button 
                            onClick={() => changePage(totalPages - 1)}
                            disabled={activePageIndex === totalPages - 1}
                            className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
                            title="النهاية"
                        >
                            <SkipBack size={20} />
                        </button>
                    </div>

                    {/* RIGHT: Meta Info / Chapter */}
                    <div className="hidden md:block text-xs text-slate-500 font-medium truncate max-w-[150px] text-left z-10">
                        {toc.find(t => t.page === currentPageData?.pageNumber)?.title || "..."}
                    </div>

                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;
