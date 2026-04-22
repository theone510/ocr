
import React, { useState, useEffect } from 'react';
import { LibraryIcon, Plus, ArrowLeft, Building2, User, Hash, BookCopy, Calendar, MapPin, FileDigit } from 'lucide-react';
import { Button } from './Button';
import { LibraryState } from '../types';
import { toHindi } from '../utils/helpers';

interface SessionSetupProps {
  library: LibraryState;
  onStartSession: (data: { 
    bookTitle: string, 
    startPage: number,
    author: string,
    publisher: string,
    publicationPlace: string,
    publicationYear: string,
    totalPages: number,
    isSeries: boolean,
    volumeNumber: string
  }) => void;
  onOpenLibrary: () => void;
  onAddPublisher: (name: string) => void;
  onAddAuthor: (name: string) => void;
}

export const SessionSetup: React.FC<SessionSetupProps> = ({ library, onStartSession, onOpenLibrary, onAddPublisher, onAddAuthor }) => {
  // Get books as objects (id + title) — keys are now UUIDs, not titles
  const bookList = Object.values(library.books);
  const hasBooks = bookList.length > 0;

  const [mode, setMode] = useState<'select' | 'create'>(hasBooks ? 'select' : 'create');
  
  // Create Mode States
  const [newBookTitle, setNewBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [publicationPlace, setPublicationPlace] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [totalPages, setTotalPages] = useState<string>('');
  const [isSeries, setIsSeries] = useState(false);
  const [volumeNumber, setVolumeNumber] = useState('');
  
  // Select Mode States — store selected book id
  const [selectedBookId, setSelectedBookId] = useState('');
  const [startPage, setStartPage] = useState<number>(1);

  // Default lists if empty
  const availablePublishers = library.publishers && library.publishers.length > 0 
    ? library.publishers 
    : ['العتبة الحسينية المقدسة', 'دار المعارف', 'مؤسسة الأعلمي للمطبوعات'];
    
  const availableAuthors = library.authors && library.authors.length > 0
    ? library.authors
    : ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى'];

  useEffect(() => {
    if (!hasBooks && mode === 'select') {
      setMode('create');
    }
  }, [hasBooks, mode]);

  const handleBookSelect = (bookId: string) => {
    setSelectedBookId(bookId);
    const book = library.books[bookId];
    if (book && book.pages.length > 0) {
      const maxPage = Math.max(...book.pages.map(p => p.pageNumber));
      setStartPage(maxPage + 1);
    } else {
      setStartPage(1);
    }
  };

  const handleAddNewPublisher = () => {
    if (newPublisher.trim()) {
      onAddPublisher(newPublisher.trim());
      setPublisher(newPublisher.trim());
      setNewPublisher('');
    }
  };

  const handleAddNewAuthor = () => {
    if (newAuthor.trim()) {
      onAddAuthor(newAuthor.trim());
      setAuthor(newAuthor.trim());
      setNewAuthor('');
    }
  };

  const handleStart = () => {
    if (mode === 'select' && hasBooks && selectedBookId) {
      // Use existing book by its UUID
      const book = library.books[selectedBookId];
      onStartSession({
        bookTitle: book.title,   // pass human-readable title
        startPage: startPage,
        author: book.author || '',
        publisher: book.publisher || '',
        publicationPlace: book.publicationPlace || '',
        publicationYear: book.publicationYear || '',
        totalPages: book.totalPages || 0,
        isSeries: book.isSeries || false,
        volumeNumber: book.volumeNumber || ''
      });
    } else if ((mode === 'create' || !hasBooks) && newBookTitle) {
      onStartSession({
        bookTitle: newBookTitle,
        startPage: startPage,
        author,
        publisher,
        publicationPlace,
        publicationYear,
        totalPages: parseInt(totalPages) || 0,
        isSeries,
        volumeNumber
      });
    }
  };

  const isCreateMode = mode === 'create' || !hasBooks;
  const isFormValid = isCreateMode 
    ? (newBookTitle && author && publisher) 
    : (selectedBookId);

  return (
    <div className="max-w-2xl mx-auto mt-6 p-8 bg-slate-900 rounded-3xl shadow-2xl border border-white/5 ring-1 ring-white/5">
      <div className="text-center mb-8">
        <div className="inline-flex p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl text-[#c5a059] mb-4 border border-[#c5a059]/30 shadow-lg shadow-[#c5a059]/5">
          <LibraryIcon size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-wide">تهيئة جلسة الأرشفة</h2>
        <p className="text-slate-400 mt-2 text-sm">أدخل البيانات بدقة لضمان فهرسة علمية متكاملة</p>
      </div>

      <div className="space-y-6">
        {hasBooks && (
          <div className="flex p-1 bg-slate-950 rounded-xl mb-6 border border-white/5">
            <button
              onClick={() => setMode('select')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'select' ? 'bg-[#c5a059] text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              استكمال كتاب
            </button>
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === 'create' ? 'bg-[#c5a059] text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              كتاب جديد
            </button>
          </div>
        )}

        {isCreateMode ? (
          <div className="space-y-4">
            
            {/* 1. Author Name (Dropdown + Add) */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">اسم المؤلف</label>
              <div className="flex gap-2">
                 <div className="relative flex-1">
                    <User className="absolute right-3 top-3 text-[#c5a059] w-5 h-5 pointer-events-none" />
                    <select
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full pr-10 pl-3 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none appearance-none"
                    >
                      <option value="">-- اختر المؤلف --</option>
                      {availableAuthors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                 </div>
                 <div className="flex-1 flex gap-2">
                    <input 
                      type="text" 
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="مؤلف جديد..."
                      className="flex-1 px-3 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-sm placeholder-slate-500"
                    />
                    <Button type="button" size="sm" onClick={handleAddNewAuthor} disabled={!newAuthor} variant="secondary">
                      <Plus size={18} />
                    </Button>
                 </div>
              </div>
            </div>

            {/* 2. Book Title */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">العنوان</label>
              <div className="relative">
                <BookCopy className="absolute right-3 top-3 text-[#c5a059] w-5 h-5" />
                <input
                  type="text"
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder="مثال: الذريعة إلى تصانيف الشيعة"
                  className="w-full pr-10 pl-3 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none placeholder-slate-500"
                />
              </div>
            </div>

            {/* 3. Publication Data Group */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 space-y-4">
                <h3 className="text-xs font-bold text-[#c5a059] mb-2 pb-2 border-b border-white/5 flex items-center gap-2">
                  <Building2 size={14} /> بيانات النشر
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Place of Publication */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">مكان النشر</label>
                        <div className="relative">
                            <MapPin className="absolute right-3 top-2.5 text-slate-600 w-4 h-4" />
                            <input
                            type="text"
                            value={publicationPlace}
                            onChange={(e) => setPublicationPlace(e.target.value)}
                            placeholder="مثال: بيروت"
                            className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-sm placeholder-slate-600"
                            />
                        </div>
                    </div>

                     {/* Publication Year */}
                     <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">سنة النشر</label>
                        <div className="relative">
                            <Calendar className="absolute right-3 top-2.5 text-slate-600 w-4 h-4" />
                            <input
                            type="text"
                            value={publicationYear}
                            onChange={(e) => setPublicationYear(e.target.value)}
                            placeholder="مثال: ١٤٤٥ هـ"
                            className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-sm placeholder-slate-600"
                            />
                        </div>
                    </div>

                    {/* Publisher Name (Dropdown + Add) - Full Width */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">اسم الناشر</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <select
                                value={publisher}
                                onChange={(e) => setPublisher(e.target.value)}
                                className="w-full pr-3 pl-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none appearance-none text-sm"
                                >
                                <option value="">-- اختر الناشر --</option>
                                {availablePublishers.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 flex gap-2">
                                <input 
                                type="text" 
                                value={newPublisher}
                                onChange={(e) => setNewPublisher(e.target.value)}
                                placeholder="ناشر جديد..."
                                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-sm placeholder-slate-600"
                                />
                                <Button type="button" size="sm" onClick={handleAddNewPublisher} disabled={!newPublisher} variant="outline" className="border-slate-600 text-slate-400">
                                <Plus size={16} />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Total Pages */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">عدد الصفحات</label>
              <div className="relative">
                <FileDigit className="absolute right-3 top-3 text-[#c5a059] w-5 h-5" />
                <input
                  type="number"
                  value={totalPages}
                  onChange={(e) => setTotalPages(e.target.value)}
                  placeholder="مثال: ٥٠٠"
                  className="w-full pr-10 pl-3 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none placeholder-slate-500"
                />
              </div>
            </div>

            {/* 5. Series / Volume */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
               <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">هل الكتاب جزء من سلسلة؟</label>
                  <input 
                    type="checkbox" 
                    checked={isSeries} 
                    onChange={(e) => setIsSeries(e.target.checked)} 
                    className="w-5 h-5 text-[#c5a059] bg-slate-900 border-slate-600 rounded focus:ring-[#c5a059]"
                  />
               </div>
               
               {isSeries && (
                 <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">رقم المجلد / الجزء</label>
                    <div className="relative">
                        <Hash className="absolute right-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input
                        type="text"
                        value={volumeNumber}
                        onChange={(e) => setVolumeNumber(e.target.value)}
                        placeholder="مثال: ١"
                        className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-sm placeholder-slate-600"
                        />
                    </div>
                 </div>
               )}
            </div>

          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">اختر الكتاب من المكتبة</label>
            <select
              value={selectedBookId}
              onChange={(e) => handleBookSelect(e.target.value)}
              className="w-full p-4 bg-slate-800 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-lg"
            >
              <option value="">-- اختر من القائمة --</option>
              {bookList.map(b => (
                <option key={b.id} value={b.id}>{toHindi(b.title)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="border-t border-white/5 pt-4">
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">بداية الترقيم (للجلسة الحالية)</label>
            <input
              type="number"
              min="1"
              value={startPage}
              onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
              className="w-32 p-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-center font-bold focus:ring-[#c5a059] focus:border-[#c5a059] outline-none text-[#c5a059] font-mono"
            />
        </div>

        <Button
          onClick={handleStart}
          disabled={!isFormValid}
          className="w-full h-12 text-lg shadow-lg mt-2 font-bold tracking-wide"
          variant="primary"
          icon={<Plus size={20} />}
        >
          {isCreateMode ? 'إنشاء وأرشفة' : 'استكمال الأرشفة'}
        </Button>

        <div className="pt-2 text-center">
           <button 
             onClick={onOpenLibrary}
             className="text-slate-500 hover:text-[#c5a059] text-sm font-medium flex items-center justify-center gap-2 w-full transition-colors"
           >
             <ArrowLeft size={16} />
             الذهاب إلى أرشيف المكتبة
           </button>
        </div>
      </div>
    </div>
  );
};
