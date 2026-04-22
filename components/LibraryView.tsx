import React, { useState, useRef } from 'react';
import { PageData, Book, LibraryState } from '../types';
import { Button } from './Button';
import { toHindi, fromHindi, generateId } from '../utils/helpers';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import {
  BookOpen,
  Trash2,
  FileText,
  Download,
  Eye,
  User,
  Building2,
  BookCopy,
  PlusCircle,
  Upload,
  Search,
  FileCode,
} from 'lucide-react';

interface LibraryViewProps {
  library: LibraryState;
  currentUserId?: string;
  setLibrary: React.Dispatch<React.SetStateAction<LibraryState>>;
  /** Called with the book's UUID to delete it from Firestore. */
  onDeleteBookFromCloud: (bookId: string) => Promise<void>;
  onDeletePage: (bookId: string, pageId: string) => void;
  onLoadPage: (bookId: string, page: PageData) => void;
  onInsertPage: (bookId: string, afterPageNumber: number) => void;
  onUpdatePageNumber: (bookId: string, pageId: string, newNumber: number) => void;
  onOpenFullViewer: (bookId: string, mode: 'read' | 'edit') => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  library,
  currentUserId,
  setLibrary,
  onDeleteBookFromCloud,
  onDeletePage,
  onLoadPage,
  onInsertPage,
  onUpdatePageNumber,
  onOpenFullViewer,
}) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FIX: Cast Object.values to Book[] to prevent 'unknown' type errors
  const books = (Object.values(library.books) as Book[]).filter(book =>
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (book.author && book.author.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteBook = async (book: Book) => {
    const ok = await confirm({
      title: 'حذف كتاب',
      message: `هل أنت متأكد من حذف كتاب «${book.title}» وكافة صفحاته؟ لا يمكن التراجع عن هذا الإجراء.`,
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      dangerous: true,
    });
    if (!ok) return;
    // Delete from Firestore immediately (passes UUID, not title)
    onDeleteBookFromCloud(book.id);
    setLibrary(prev => {
      const newBooks = { ...prev.books };
      delete newBooks[book.id];
      return { ...prev, books: newBooks };
    });
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
        // Find existing book by title (title is display name, not Firestore key)
        const existingBook = Object.values(prev.books).find(b => b.title === title);
        const bookId = existingBook?.id ?? generateId();
        let mergedPages = existingBook ? [...existingBook.pages] : [];

        newPages.forEach(np => {
          const idx = mergedPages.findIndex(p => p.pageNumber === np.pageNumber);
          if (idx !== -1) {
            mergedPages[idx] = { ...mergedPages[idx], text: np.text };
          } else {
            mergedPages.push(np);
          }
        });

        mergedPages.sort((a, b) => a.pageNumber - b.pageNumber);

        return {
          ...prev,
          books: {
            ...prev.books,
            [bookId]: {
              id: bookId,
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

      toast.success(`تم استيراد ${newPages.length} صفحة وضمها للكتاب: ${title}`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      toast.error('فشل استيراد الملف: ' + message);
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
    const sortedPages = [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber);

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

    const sortedPages = [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber);

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
    URL.revokeObjectURL(url);
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
          <div key={book.id} className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden hover:border-[#c5a059]/30 transition-all hover:shadow-2xl hover:shadow-[#c5a059]/5 flex flex-col group">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-slate-800 rounded-lg text-[#c5a059]">
                  <BookOpen size={24} />
                </div>
                <div className="flex gap-2 relative z-40">
                   <div className="relative">
                      <button
                         onClick={() => setDownloadMenuOpen(downloadMenuOpen === book.id ? null : book.id)}
                         className={`p-2 rounded-lg transition-colors ${downloadMenuOpen === book.id ? 'bg-[#c5a059] text-slate-900' : 'hover:bg-slate-800 text-slate-500 hover:text-white'}`}
                         title="خيارات التنزيل"
                       >
                         <Download size={18} />
                       </button>
                       {downloadMenuOpen === book.id && (
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
                   {(!book.ownerId || book.ownerId === currentUserId) && (
                     <button onClick={() => handleDeleteBook(book)} className="p-2 hover:bg-red-900/20 rounded-lg text-slate-500 hover:text-red-500" title="حذف">
                       <Trash2 size={18} />
                     </button>
                   )}
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                 <h3 className="text-xl font-bold text-white line-clamp-1">{toHindi(book.title)}</h3>
                 <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${book.status === 'published' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                    {book.status === 'published' ? 'مُعتمد' : 'مسودة'}
                 </span>
              </div>

              <div className="space-y-2 text-sm text-slate-400 mb-6 font-mono">
                {book.author && <div className="flex items-center gap-2"><User size={14}/> <span>{toHindi(book.author)}</span></div>}
                {book.publisher && <div className="flex items-center gap-2"><Building2 size={14}/> <span>{toHindi(book.publisher)}</span></div>}
                <div className="flex items-center gap-2"><FileText size={14}/> <span>{toHindi(book.pages.length)} صفحة مؤرشفة</span></div>
              </div>
            </div>

            <div className="bg-slate-950/50 p-4 border-t border-white/5 flex items-center justify-between gap-2">
               <div className="flex gap-2 w-full">
                 <Button size="sm" variant="secondary" onClick={() => onOpenFullViewer(book.id, 'read')} className="flex-1 text-xs">
                   <Eye size={14} className="ml-1"/> تصفح
                 </Button>
                 {(!book.ownerId || book.ownerId === currentUserId) && (
                   <Button size="sm" variant="primary" onClick={() => onInsertPage(book.id, book.pages.length > 0 ? Math.max(...book.pages.map(p => p.pageNumber)) : 0)} className="flex-1 text-xs">
                     <PlusCircle size={14} className="ml-1"/> إضافة
                   </Button>
                 )}
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
