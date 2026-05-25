import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Book } from '../types';
import { loadPDF, renderPageAsImage, PDFDocumentProxy } from '../services/pdfService';
import { ContinuousEditor } from './editor/ContinuousEditor';
import { extractPagesFromHTML } from './editor/EditorUtils';
import { toHindi } from '../utils/helpers';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  ScrollText,
  LogOut,
  BookCopy,
  PanelRightClose,
  PanelRightOpen,
  MonitorDown,
  Upload,
  Pencil,
  BookOpenCheck,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  SkipBack,
  Trash2,
  X,
} from 'lucide-react';

interface FullBookViewerProps {
  book: Book;
  currentUserId?: string;
  initialMode: 'read' | 'edit';
  onClose: () => void;
  onUpdatePage: (bookId: string, pageId: string, text: string) => void;
  onUpdateWholeBook: (bookId: string, parsedPages: { id: string; text: string }[]) => void;
  onToggleStatus: () => void;
  onDeletePage: (pageId: string) => void;
}

export const FullBookViewer: React.FC<FullBookViewerProps> = ({
  book,
  currentUserId,
  initialMode,
  onClose,
  onUpdatePage,
  onUpdateWholeBook,
  onToggleStatus,
  onDeletePage,
}) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [toc, setToc] = useState<{ id: string; title: string; level: number; page: number; index: number }[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode);

  // SYNC VIEW STATE (Local Only)
  const [syncPdfDoc, setSyncPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [syncImageUrl, setSyncImageUrl] = useState<string | null>(null);
  const [isSyncingPdf, setIsSyncingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PAGE FLIPPING LOGIC
  const [activePageIndex, setActivePageIndex] = useState(0);

  // BUG #15 FIX: Sort pages by pageNumber so access order is always consistent
  const sortedPages = useMemo(
    () => [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber),
    [book.pages]
  );
  const totalPages = sortedPages.length;

  // Ref for scroll container to handle pagination on scroll
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // --- Navigation handlers ---
  // Using functional setState updaters means neither handler reads external state,
  // so useCallback deps are minimal and react-hooks/exhaustive-deps stays clean.

  // handlePrevPage: prev => ensures we always subtract from the LATEST index,
  // not the one captured at the time the effect ran.  Zero external deps needed.
  const handlePrevPage = useCallback(() => {
    setActivePageIndex(prev => Math.max(0, prev - 1));
  }, []);

  // handleNextPage: only needs totalPages (boundary guard) — no activePageIndex dep.
  const handleNextPage = useCallback(() => {
    setActivePageIndex(prev => Math.min(totalPages - 1, prev + 1));
  }, [totalPages]);

  // Keyboard Navigation
  // deps: [mode, handlePrevPage, handleNextPage]
  //   • handlePrevPage is stable forever ([] deps)
  //   • handleNextPage changes only when totalPages changes
  //   • activePageIndex is NOT needed here — the functional updaters handle it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // BUG #22 FIX: Don't navigate when user is typing in an input/textarea/select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (mode === 'read') {
        if (e.key === 'ArrowRight') handlePrevPage(); // RTL: right = previous page
        if (e.key === 'ArrowLeft')  handleNextPage(); // RTL: left  = next page
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handlePrevPage, handleNextPage]);

  useEffect(() => {
    const extractedToc: any[] = [];
    // BUG #15 FIX: Use sortedPages so TOC indexes match sorted page order
    sortedPages.forEach((p, idx) => {
      const matches = p.text.matchAll(/<(h[1-5])>(.*?)<\/\1>/g);
      for (const match of matches) {
        // Strip nested tags like <bold> or <center> from the heading text for the index
        const cleanTitle = match[2].replace(/<[^>]+>/g, '').trim();
        extractedToc.push({
          id: `heading-${extractedToc.length}`,
          title: cleanTitle,
          level: parseInt(match[1].substring(1)),
          page: p.pageNumber,
          index: idx // Store index for direct navigation
        });
      }
    });
    setToc(extractedToc);
  }, [sortedPages]);

  // BUG #23 FIX: Helper to escape special regex characters in heading titles
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // BUG #23 FIX: Replace only the N-th occurrence of a regex pattern in text
  const replaceNthOccurrence = (text: string, pattern: RegExp, n: number, replacement: string): string => {
    let count = 0;
    return text.replace(pattern, (match) => {
      count++;
      return count === n ? replacement : match;
    });
  };

  const changePage = (index: number, targetHeadingTitle?: string) => {
    if (index < 0 || index >= totalPages) return;

    setActivePageIndex(index);

    setTimeout(() => {
      if (mode === 'read') {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        if (targetHeadingTitle) {
          const headings = document.querySelectorAll('.viewer-h1, .viewer-h2, .viewer-h3, .viewer-h4, .viewer-h5');
          const target = Array.from(headings).find(h => h.textContent === toHindi(targetHeadingTitle));
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        // Edit mode continuous editor scroll
        const edScroll = document.getElementById('tiptap-scroll-container');
        if (edScroll) {
          if (targetHeadingTitle) {
            const headings = edScroll.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5');
            const target = Array.from(headings).find(h => h.textContent === targetHeadingTitle);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              return;
            }
          }
          // BUG #15 FIX: Use sortedPages for correct index-to-pageNumber mapping
          const targetPageNum = sortedPages[index]?.pageNumber.toString();
          if (targetPageNum) {
            const targetBreak = Array.from(edScroll.querySelectorAll('.page-break')).find(b => b.getAttribute('data-page-number') === targetPageNum);
            if (targetBreak) {
              targetBreak.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (index === 0) {
              edScroll.scrollTop = 0;
            }
          }
        }
      }
    }, 100);
  };

  const handleChangeHeadingLevel = (item: any, newLevel: number) => {
    const page = sortedPages.find(p => p.pageNumber === item.page);
    if (!page) return;

    // BUG #23 FIX: Guard against duplicate heading titles — only proceed if title is unique
    const occurrences = (page.text.match(new RegExp(`<h[1-5]>${escapeRegex(item.title)}<\/h[1-5]>`, 'g')) || []).length;
    if (occurrences > 1) {
      // Skip silently to avoid mutating the wrong heading when duplicates exist
      return;
    }

    const newText = page.text.replace(/<(h[1-5])>(.*?)<\/\1>/g, (match, tag, title) => {
      const cleanTitle = title.replace(/<[^>]+>/g, '').trim();
      if (cleanTitle === item.title) {
        return `<h${newLevel}>${title}</h${newLevel}>`;
      }
      return match;
    });
    if (newText !== page.text) {
      onUpdatePage(book.id, page.id, newText);
    }
  };

  const handleMergeWithNextHeading = (item: any) => {
    const currentIdx = toc.findIndex(t => t === item);
    if (currentIdx === -1 || currentIdx + 1 >= toc.length) return;
    const nextItem = toc[currentIdx + 1];

    if (item.page === nextItem.page) {
      const page = sortedPages.find(p => p.pageNumber === item.page);
      if (!page) return;

      // BUG #23 FIX: Guard against duplicate heading titles to avoid wrong merge
      const occurrencesItem = (page.text.match(new RegExp(`<h[1-5]>${escapeRegex(item.title)}<\/h[1-5]>`, 'g')) || []).length;
      const occurrencesNext = (page.text.match(new RegExp(`<h[1-5]>${escapeRegex(nextItem.title)}<\/h[1-5]>`, 'g')) || []).length;
      if (occurrencesItem > 1 || occurrencesNext > 1) {
        toast.info('لا يمكن الدمج: يوجد عنوان مكرر بنفس الاسم في الصفحة.');
        return;
      }

      let firstFound = false;
      let mergedTitleInner = '';
      const tempText = page.text.replace(/<(h[1-5])>(.*?)<\/\1>/g, (match, tag, title) => {
        const cleanTitle = title.replace(/<[^>]+>/g, '').trim();
        if (cleanTitle === item.title && !firstFound) {
          firstFound = true;
          mergedTitleInner = title;
          return `___MERGE_TARGET___`;
        }
        if (cleanTitle === nextItem.title && firstFound) {
          return `<${tag}>${mergedTitleInner} - ${title}</${tag}>`;
        }
        return match;
      });

      // BUG #6 FIX: Use a proper regex (with /g flag) instead of a template literal string
      const finalText = tempText.replace(/___MERGE_TARGET___\s*\n*/g, '');
      onUpdatePage(book.id, page.id, finalText);
    } else {
      toast.info('الدمج بين العناوين في صفحات مختلفة غير مدعوم من الفهرس السريع، استخدم المحرر المتصل.');
    }
  };

  const handleRemoveHeading = (item: any) => {
    const page = sortedPages.find(p => p.pageNumber === item.page);
    if (!page) return;

    // BUG #23 FIX: Guard against duplicate heading titles — only proceed if title is unique
    const occurrences = (page.text.match(new RegExp(`<h[1-5]>${escapeRegex(item.title)}<\/h[1-5]>`, 'g')) || []).length;
    if (occurrences > 1) {
      // Skip silently to avoid mutating the wrong heading when duplicates exist
      return;
    }

    const newText = page.text.replace(/<(h[1-5])>(.*?)<\/\1>/g, (match, tag, title) => {
      const cleanTitle = title.replace(/<[^>]+>/g, '').trim();
      if (cleanTitle === item.title) {
        return title; // return inner text without tags
      }
      return match;
    });
    if (newText !== page.text) {
      onUpdatePage(book.id, page.id, newText);
    }
  };



  // BUG #15 FIX: Use sortedPages for consistent index-to-page access
  const currentPageData = sortedPages[activePageIndex];

  const renderReadMode = () => {
    if (!currentPageData) return null;

    let headingIdx = 0; // This is naive for paging, but keeps IDs somewhat consistent locally
    // Fix: Pull footnote references inline by collapsing preceding newlines/spaces
    let pageHtml = currentPageData.text
      .replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1') // FIX: Aggressive collapse
      .replace(/\n+/g, '<br/>')
      .replace(/<(h[1-5])>(.*?)<\/\1>/g, (match, tag, title) => {
        const id = `heading-${headingIdx++}`;
        return `<${tag} id="${id}" class="viewer-${tag}">${toHindi(title)}</${tag}>`;
      })
      .replace(/<center>(.*?)<\/center>/g, '<div class="viewer-center">$1</div>')
      .replace(/<bold>(.*?)<\/bold>/g, '<span class="viewer-bold">$1</span>')
      .replace(/<aya>(.*?)<\/aya>/g, '<span class="viewer-aya">$1</span>')
      .replace(/<hadith>(.*?)<\/hadith>/g, '<span class="viewer-hadith">$1</span>')
      .replace(/<poetry>(.*?)<\/poetry>/g, '<div class="viewer-poetry">$1</div>')
      .replace(/<footnote>(.*?)<\/footnote>/gs, (match, content) => {
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

  const handleContinuousEditorChange = (html: string) => {
    // Split the HTML using extractPagesFromHTML
    const extractedPages = extractPagesFromHTML(html, book.pages);
    onUpdateWholeBook(book.id, extractedPages);
  };

  const handleEditorActivePageChange = (pageNum: number) => {
    const index = book.pages.findIndex(p => p.pageNumber === pageNum);
    if (index >= 0 && index !== activePageIndex) {
      setActivePageIndex(index);
    }
  };

  const handleUploadSyncPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSyncingPdf(true);
    try {
      const pdf = await loadPDF(file);
      setSyncPdfDoc(pdf);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل الـ PDF المرجعي للاستلام المؤقت.');
    }
    setIsSyncingPdf(false);
  };

  // BUG #13 FIX: Destroy syncPdfDoc when it changes or component unmounts
  useEffect(() => {
    return () => {
      syncPdfDoc?.destroy();
    };
  }, [syncPdfDoc]);

  useEffect(() => {
    if (syncPdfDoc && mode === 'edit') {
      // BUG #12 FIX: Track object URL so it can be revoked before setting a new one
      let objectUrl: string | null = null;

      const renderPdfSync = async () => {
        // BUG #15 FIX: Use sortedPages for correct index-to-pageNumber mapping
        const pageNum = sortedPages[activePageIndex]?.pageNumber || activePageIndex + 1;
        try {
          const result = await renderPageAsImage(syncPdfDoc, pageNum);
          objectUrl = result.previewUrl;
          setSyncImageUrl(result.previewUrl);
        } catch (err) {
          console.error("Failed to render sync page", err);
          // Fallback to empty if it exceeds bounds or fails
          setSyncImageUrl(null);
        }
      };
      renderPdfSync();

      // BUG #12 FIX: Revoke previous object URL on cleanup to prevent memory leak
      return () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
  }, [syncPdfDoc, activePageIndex, mode, sortedPages]);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden relative" dir="rtl">
      <style>{`
        .viewer-h1 { display: block; font-size: 2.5rem; font-weight: 800; color: #f1f5f9; margin: 1.5rem 0; border-right: 6px solid #c5a059; padding-right: 1.5rem; }
        .viewer-h2 { display: block; font-size: 1.8rem; font-weight: 700; color: #e2e8f0; margin: 1.2rem 0; border-right: 4px solid #94a3b8; padding-right: 1rem; }
        .viewer-h3 { display: block; font-size: 1.4rem; font-weight: 700; color: #cbd5e1; margin: 1rem 0; border-right: 2px solid #64748b; padding-right: 0.75rem; }
        .viewer-h4 { display: block; font-size: 1.2rem; font-weight: 700; color: #94a3b8; margin: 0.8rem 0; border-right: 2px solid #475569; padding-right: 0.5rem; }
        .viewer-h5 { display: block; font-size: 1rem; font-weight: 700; color: #64748b; margin: 0.6rem 0; border-right: 2px solid #334155; padding-right: 0.5rem; }
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
              <div key={i} className={`w-full text-right flex flex-col gap-1 p-3 rounded-xl transition-all border border-transparent group ${activePageIndex === item.index ? 'bg-[#c5a059]/20 border-[#c5a059]/30' : 'hover:bg-slate-800/50 hover:border-slate-700'} ${item.level === 1 ? 'mt-4 bg-slate-800/30' : ''}`}>
                <button
                  onClick={() => changePage(item.index, item.title)}
                  className="w-full text-right flex flex-col"
                >
                   <span className={`font-bold leading-snug ${item.level === 1 ? 'text-sm text-[#c5a059]' : item.level === 2 ? 'text-[13px] pr-4 text-slate-300' : 'text-[12px] pr-8 text-slate-500'}`}>{toHindi(item.title)}</span>
                   <span className="text-[10px] text-slate-600 font-bold self-end group-hover:text-[#c5a059] transition-colors font-mono mt-1">ص {toHindi(item.page)}</span>
                </button>

                {/* QUICK EDIT TOOLS FOR TOC */}
                {mode === 'edit' && (
                  <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                     <button onClick={(e) => { e.stopPropagation(); handleChangeHeadingLevel(item, 1) }} className="text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300 hover:bg-[#c5a059] hover:text-slate-900 font-bold transition-colors">H1</button>
                     <button onClick={(e) => { e.stopPropagation(); handleChangeHeadingLevel(item, 2) }} className="text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300 hover:bg-slate-300 hover:text-slate-900 font-bold transition-colors">H2</button>
                     <button onClick={(e) => { e.stopPropagation(); handleChangeHeadingLevel(item, 3) }} className="text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300 hover:bg-slate-400 hover:text-slate-900 font-bold transition-colors">H3</button>
                     <button onClick={(e) => { e.stopPropagation(); handleChangeHeadingLevel(item, 4) }} className="text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300 hover:bg-slate-500 hover:text-slate-900 font-bold transition-colors">H4</button>
                     <button onClick={(e) => { e.stopPropagation(); handleChangeHeadingLevel(item, 5) }} className="text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300 hover:bg-slate-600 hover:text-slate-900 font-bold transition-colors">H5</button>
                     <button onClick={(e) => { e.stopPropagation(); handleMergeWithNextHeading(item) }} className="text-[10px] bg-blue-900/50 border border-blue-500/30 px-1.5 py-0.5 rounded text-blue-300 hover:bg-blue-600 hover:text-white font-bold transition-colors ml-1" title="دمج مع العنوان التالي بالأسفل">دمج</button>
                     <button onClick={(e) => { e.stopPropagation(); handleRemoveHeading(item) }} className="text-[10px] bg-red-900/50 border border-red-500/30 px-1.5 py-0.5 rounded text-red-300 hover:bg-red-600 hover:text-white font-bold transition-colors ml-1" title="إزالة العنوان وتحويله لنص عادي">حذف</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Main Content Area - Single Page View */}
      <div className="flex-1 relative flex flex-col bg-slate-950 overflow-hidden">

        {/* Top Info Bar */}
        <div className="bg-slate-900/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex items-center justify-between z-10 transition-all">
           <div className="flex flex-col">
              <div className="flex items-center gap-3">
                 <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">{toHindi(book.title)}</h1>
                 <button
                   onClick={onToggleStatus}
                   className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-colors ${book.status === 'published' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30' : 'bg-amber-500/20 text-amber-500 border border-amber-500/50 hover:bg-amber-500/30'}`}
                   title="اضغط لتغيير حالة الاعتماد"
                 >
                    {book.status === 'published' ? 'معتمد 100%' : 'قيد التدقيق (مسودة)'}
                 </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-1">
                 <span>{toHindi(book.publisher)}</span>
                 <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                 <span className={activePageIndex === totalPages - 1 ? 'text-emerald-500' : ''}>Page {toHindi(currentPageData?.pageNumber)} of {toHindi(totalPages)}</span>
                 {mode === 'edit' && (
                   <>
                      <span className="w-1 h-1 bg-slate-600 rounded-full mx-1"></span>
                      <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleUploadSyncPdf} />
                      <button
                        onClick={() => { if (syncPdfDoc) { syncPdfDoc.destroy(); setSyncPdfDoc(null); } else { fileInputRef.current?.click(); } }}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${syncPdfDoc ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
                      >
                        {isSyncingPdf ? <span className="animate-pulse">جاري التحميل...</span> : syncPdfDoc ? <><X size={12}/> إغلاق المرفق</> : <><Upload size={12}/> إرفاق PDF للمطابقة</>}
                      </button>
                   </>
                 )}
              </div>
           </div>

           <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800 shadow-inner">
               <button onClick={() => setMode('read')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'read' ? 'bg-[#c5a059] text-slate-900 shadow' : 'text-slate-500 hover:bg-slate-800'}`}>
                 <span className="flex items-center gap-2"><BookOpenCheck size={16}/> قراءة</span>
               </button>
               {(!book.ownerId || book.ownerId === currentUserId) && (
                 <button onClick={() => setMode('edit')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'edit' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:bg-slate-800'}`}>
                   <span className="flex items-center gap-2"><Pencil size={16}/> تحرير</span>
                 </button>
               )}
           </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* OPTIONAL SPLIT VIEW FOR PDF SYNC */}
          {syncPdfDoc && mode === 'edit' && (
            <div className="hidden lg:flex flex-col w-1/2 border-l border-slate-800 bg-slate-950 p-4 overflow-y-auto animate-in fade-in slide-in-from-left duration-500">
              <div className="text-center mb-2 flex items-center justify-center gap-2 text-slate-500 text-sm font-bold bg-slate-900 py-2 rounded-lg border border-slate-800 shadow-inner">
                <MonitorDown size={16} className="text-[#c5a059]" /> النص الأصلي المرفق - صفحة {toHindi(sortedPages[activePageIndex]?.pageNumber)}
              </div>
              <div className="flex-1 flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl p-2 relative">
                {syncImageUrl ? (
                  <img src={syncImageUrl} className="max-w-full max-h-full object-contain rounded drop-shadow-lg pointer-events-none select-none" alt="Manuscript Source" />
                ) : (
                  <div className="flex flex-col items-center text-slate-600 animate-pulse">
                    <BookCopy size={32} className="mb-2 opacity-50" />
                    <span>جاري معالجة صورة الصفحة...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scrollable Page / Editor Content */}
          <div
            ref={scrollRef}
            className={`flex-1 ${mode === 'read' ? 'overflow-y-auto pb-32' : 'overflow-hidden'} scroll-smooth transition-all ${syncPdfDoc && mode === 'edit' ? 'lg:w-1/2' : 'w-full'}`}
          >
            <div className={`mx-auto transition-all duration-300 ${mode === 'edit' ? 'h-full w-full flex flex-col' : (showSidebar ? 'py-4 px-4 max-w-4xl' : 'py-4 px-4 max-w-5xl')}`}>
              {mode === 'read' ? (
                renderReadMode()
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 h-full w-full flex flex-col p-4">
                  <ContinuousEditor
                    pages={book.pages}
                    onChange={handleContinuousEditorChange}
                    onActivePageChange={handleEditorActivePageChange}
                    readOnly={false}
                  />
                </div>
              )}
            </div>
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
                max={Math.max(0, totalPages - 1)}
                value={activePageIndex}
                onChange={(e) => changePage(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none"
              />
              <div
                className="absolute top-0 right-0 h-1 bg-[#c5a059] rounded-lg pointer-events-none"
                style={{ width: `${totalPages > 1 ? Math.round((activePageIndex / (totalPages - 1)) * 100) : 0}%` }}
              ></div>
              {/* Tooltip on hover */}
              {/* BUG #4 FIX: Guard against division by zero when totalPages === 1 */}
              <div className="absolute bottom-6 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs font-mono py-1 px-2 rounded border border-white/10 pointer-events-none" style={{ right: `${100 - (totalPages > 1 ? Math.round((activePageIndex / (totalPages - 1)) * 100) : 0)}%` }}>
                {/* BUG #15 FIX: Use sortedPages for correct page number display */}
                ص {toHindi(sortedPages[activePageIndex]?.pageNumber)}
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
                    onKeyDown={(e) => { if (e.key === 'ArrowUp') changePage(Math.min(totalPages - 1, activePageIndex + 1)); else if (e.key === 'ArrowDown') changePage(Math.max(0, activePageIndex - 1)); }}
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

              {/* RIGHT: Delete Page + Meta Info */}
              <div className="flex items-center gap-2 z-10">
                {(!book.ownerId || book.ownerId === currentUserId) && currentPageData && (
                  <button
                  onClick={async () => {
                      const ok = await confirm({
                        title: 'حذف الصفحة',
                        message: `هل تريد حذف الصفحة ${currentPageData.pageNumber} نهائياً؟`,
                        confirmLabel: 'حذف',
                        cancelLabel: 'إلغاء',
                        dangerous: true,
                      });
                      if (ok) {
                         // BUG #5 FIX: Check boundary BEFORE deletion so totalPages is still the pre-deletion count
                         if (activePageIndex >= totalPages - 1) changePage(Math.max(0, activePageIndex - 1));
                         onDeletePage(currentPageData.id);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-600/40 hover:text-red-200 transition-all text-xs font-bold"
                    title="حذف هذه الصفحة نهائياً"
                  >
                    <Trash2 size={13}/> حذف صفحة
                  </button>
                )}
                <div className="hidden md:block text-xs text-slate-500 font-medium truncate max-w-[100px] text-left">
                  {toc.find(t => t.page === currentPageData?.pageNumber)?.title || "..."}
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
