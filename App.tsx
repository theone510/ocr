
import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { PageData, Book, LibraryState, UploadedImage, LoadingState } from './types';
import { analyzeManuscript } from './services/geminiService';
import { auth, loginWithGoogle, logoutUser, syncSingleBook, deleteSingleBook, syncMeta, loadLibraryFromFirestore, fetchPublicBooks, publishBookToPublic, unpublishBookFromPublic } from './services/firebaseService';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { loadPDF, renderPageAsImage, PDFDocumentProxy } from './services/pdfService';
import { ImageUploader } from './components/ImageUploader';
import { ResultDisplay } from './components/ResultDisplay';
import { SessionSetup } from './components/SessionSetup';
import { BatchControls } from './components/BatchControls';
import { Button } from './components/Button';
import { LibraryView } from './components/LibraryView';
import { FullBookViewer } from './components/FullBookViewer';
import { toHindi, generateId } from './utils/helpers';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmModal';
import { usePdfStartPage } from './components/PdfStartPageModal';
import {
  ScrollText,
  BookOpen,
  LogOut,
  ArrowRight,
  User,
  BookCopy,
  MonitorDown,
  Upload,
} from 'lucide-react';


const STORAGE_KEY = 'manuscript_library_v2';
const CONCURRENT_PAGES = 1; // Sequential processing - parallel causes API rate limiting

const App: React.FC = () => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { promptPdfStartPage } = usePdfStartPage();

  const navigate = useNavigate();
  const location = useLocation();

  // Derive current view from URL path
  const currentPath = location.pathname;
  const isLanding = currentPath === '/';
  const isSetup = currentPath === '/setup';
  const isWorkspace = currentPath === '/workspace';
  const isLibrary = currentPath === '/library';
  const isViewer = currentPath.startsWith('/viewer/');

  // Derive view string for backward-compatible logic
  const view = isViewer ? 'full-viewer' : isLibrary ? 'library' : isWorkspace ? 'workspace' : isSetup ? 'setup' : 'landing';

  const [library, setLibrary] = useState<LibraryState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.publishers) parsed.publishers = ['دار المعارف', 'مؤسسة الأعلمي للمطبوعات'];
        if (!parsed.authors) parsed.authors = ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى'];
        return parsed;
      }
      return {
        books: {},
        publishers: ['دار المعارف', 'مؤسسة الأعلمي للمطبوعات'],
        authors: ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى']
      };
    } catch (e) {
      return { books: {}, publishers: [], authors: [] };
    }
  });

  const [activeSession, setActiveSession] = useState<{bookId: string, bookTitle: string, currentPage: number} | null>(null);
  const [currentImage, setCurrentImage] = useState<UploadedImage | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [lastProcessedPageId, setLastProcessedPageId] = useState<string | null>(null);

  // --- Firebase Auth State ---
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const firebaseUserRef = useRef<FirebaseUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // --- PDF Batch State ---
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [currentPdfPageIdx, setCurrentPdfPageIdx] = useState<number>(1); // 1-based index for PDF pages

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const isCloudLoadedRef = useRef(false);
  // Per-book debounce timers: bookId → timer ID
  const bookSyncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Books pending cloud sync (modified locally but not yet saved to Firestore)
  const pendingBooksRef = useRef<Set<string>>(new Set());
  // Flag: disable auto-sync during batch PDF processing
  const batchRunningRef = useRef(false);
  // Cloud sync status for UI
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Core: sync ONE book to Firestore after a 4-second debounce ────────────
  const scheduleBookSync = (bookId: string, bookData: Book) => {
    if (!firebaseUserRef.current || !isCloudLoadedRef.current) return;
    // Don't auto-sync while batch is running (prevents write stream exhaustion)
    if (batchRunningRef.current) {
      pendingBooksRef.current.add(bookId);
      return;
    }
    // Cancel previous timer for this book
    if (bookSyncTimers.current[bookId]) {
      clearTimeout(bookSyncTimers.current[bookId]);
    }
    pendingBooksRef.current.add(bookId);
    bookSyncTimers.current[bookId] = setTimeout(async () => {
      try {
        await syncSingleBook(firebaseUserRef.current!.uid, bookData);
        pendingBooksRef.current.delete(bookId);
        delete bookSyncTimers.current[bookId];
      } catch (e) {
        console.error(`Auto-sync failed for book "${bookData.title}":`, e);
        // Keep in pending - user can manually save
      }
    }, 4000); // 4 second debounce per book
  };

  // ── Manual save: flush all pending books ──────────────────────────────────
  const handleManualCloudSave = async () => {
    if (!firebaseUser || !isCloudLoadedRef.current) {
      toast.warning('يجب تسجيل الدخول أولاً للحفظ السحابي');
      return;
    }
    // Cancel all pending debounce timers
    Object.values(bookSyncTimers.current).forEach(clearTimeout);
    bookSyncTimers.current = {};

    const pending = [...pendingBooksRef.current];
    const allPrivateBooks = Object.entries(library.books)
      .filter(([_, b]) => !b.ownerId || b.ownerId === firebaseUser.uid)
      // Guard: skip books with no valid id — they would crash Firestore's doc()
      .filter(([_, b]) => b.id && typeof b.id === 'string' && b.id.trim() !== '');

    // If nothing pending, sync everything (full resync)
    const toSync = pending.length > 0
      ? allPrivateBooks.filter(([bookId]) => pending.includes(bookId))
      : allPrivateBooks;

    if (toSync.length === 0) {
      setCloudSyncStatus('saved');
      setTimeout(() => setCloudSyncStatus('idle'), 2000);
      return;
    }

    setCloudSyncStatus('saving');
    try {
      // Sync books ONE BY ONE — no batch, no stream exhaustion
      for (const [, book] of toSync) {
        await syncSingleBook(firebaseUser.uid, book);
      }
      // Sync metadata
      await syncMeta(firebaseUser.uid, library.publishers ?? [], library.authors ?? []);
      pendingBooksRef.current.clear();
      setCloudSyncStatus('saved');
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    } catch (e: unknown) {
      console.error('Manual save failed:', e);
      setCloudSyncStatus('error');
      setTimeout(() => setCloudSyncStatus('idle'), 5000);
    }
  };

  // ── Immediate delete from cloud ───────────────────────────────────────────
  const deleteBookFromCloud = async (bookId: string) => {
    if (!firebaseUser || !isCloudLoadedRef.current) return;
    // Cancel any pending sync for this book
    if (bookSyncTimers.current[bookId]) {
      clearTimeout(bookSyncTimers.current[bookId]);
      delete bookSyncTimers.current[bookId];
    }
    pendingBooksRef.current.delete(bookId);
    try {
      await deleteSingleBook(firebaseUser.uid, bookId);
    } catch (e) {
      console.error(`Failed to delete book (id: "${bookId}") from cloud:`, e);
    }
  };



  // Ref to handle loop control without dependency staleness
  const batchControlRef = useRef({
    shouldStop: false,
    activeBookId: '',
    failedPages: [] as {pdfPage: number, manuscriptPage: number}[],
    sessionId: 0,
  });

  useEffect(() => {
    fetchPublicBooks().then(publicBooks => {
      if (Object.keys(publicBooks).length > 0) {
        setLibrary(prev => ({
          ...prev,
          books: { ...publicBooks, ...prev.books }
        }));
      }
    }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    if (!auth) {
      setIsAuthChecking(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      firebaseUserRef.current = user;
      if (user) {
        try {
          const cloudLibrary = await loadLibraryFromFirestore(user.uid);
          if (cloudLibrary && Object.keys(cloudLibrary.books).length > 0) {
            setLibrary(prev => {
              // Cloud is source of truth: use cloud books, only keep local books that don't exist in cloud
              const mergedBooks = { ...prev.books };
              // Remove any local book that exists in cloud (cloud wins)
              for (const key of Object.keys(cloudLibrary.books)) {
                mergedBooks[key] = cloudLibrary.books[key];
              }
              // Remove local books that were deleted from cloud
              // (if cloud was loaded and a book exists locally but not in cloud, remove it)
              for (const key of Object.keys(mergedBooks)) {
                if (!cloudLibrary.books[key] && !mergedBooks[key].ownerId) {
                  // Keep books without ownerId (local-only books) unless they match a cloud key
                }
              }
              return { ...cloudLibrary, books: mergedBooks };
            });
          }
        } catch (e) {
          console.error("Failed to load cloud library", e);
        } finally {
          isCloudLoadedRef.current = true;
        }
      } else {
        isCloudLoadedRef.current = false;
      }
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // ── Watch library changes → schedule per-book sync ────────────────────────
  const prevLibraryRef = useRef<LibraryState | null>(null);
  useEffect(() => {
    // Save to localStorage always
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
      console.error('localStorage error:', e);
    }

    if (!firebaseUser || !isCloudLoadedRef.current) return;
    const prev = prevLibraryRef.current;

    // Detect which books changed and schedule individual syncs
    if (prev) {
      for (const [bookId, book] of Object.entries(library.books)) {
        if (!book.ownerId || book.ownerId === firebaseUser.uid) {
          // Book is new or changed
          if (prev.books[bookId] !== book) {
            scheduleBookSync(bookId, book);
          }
        }
      }
    }

    prevLibraryRef.current = library;
  }, [library, firebaseUser]); // eslint-disable-line

  // Handle PWA Install Prompt
  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Cleanup: clear all pending book sync timers on unmount
  useEffect(() => {
    return () => {
      Object.values(bookSyncTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleInstallApp = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult) => {
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
    // Find existing book by title (title is display name, not key)
    const existingBook = Object.values(library.books).find(b => b.title === data.bookTitle);

    if (!existingBook) {
      const newId = generateId();
      setLibrary(prev => ({
        ...prev,
        books: {
          ...prev.books,
          [newId]: {
            id: newId,
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
      setActiveSession({ bookId: newId, bookTitle: data.bookTitle, currentPage: data.startPage });
    } else {
      setActiveSession({ bookId: existingBook.id, bookTitle: existingBook.title, currentPage: data.startPage });
    }

    navigate('/workspace');
    setLastProcessedPageId(null);
    setCurrentImage(null);
    setLoadingState(LoadingState.IDLE);

    // Reset Batch State on new session
    setPdfDoc(null);
    setBatchStatus('idle');
  };

  const handleEndSession = () => {
    setActiveSession(null);
    navigate('/setup');
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
          const currentBook = prev.books[activeSession.bookId];
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
              [activeSession.bookId]: { ...currentBook, pages: updatedPages }
            }
          };
        });

        setLastProcessedPageId(pageId);
        setLoadingState(LoadingState.SUCCESS);
        setActiveSession(prev => prev ? ({ ...prev, currentPage: prev.currentPage + 1 }) : null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء استخراج النص');
      setLoadingState(LoadingState.ERROR);
    }
  };


  // --- PDF Batch Logic (Parallel Processing) ---

  const handlePdfSelected = async (file: File) => {
    if (!activeSession) return;

    setLoadingState(LoadingState.ANALYZING); // Show global loading while parsing PDF
    try {
      const doc = await loadPDF(file);
      setPdfDoc(doc);
      setPdfFileName(file.name);
      setLoadingState(LoadingState.IDLE);

      const chosenPage = await promptPdfStartPage({ totalPages: doc.numPages });

      if (chosenPage !== null) {
        const safeStartIdx = Math.max(1, Math.min(chosenPage, doc.numPages));

        setCurrentPdfPageIdx(safeStartIdx);

        batchControlRef.current = {
          shouldStop: false,
          activeBookId: activeSession.bookId,
          failedPages: [],
          sessionId: batchControlRef.current.sessionId + 1,
        };
        batchRunningRef.current = true;

        setBatchStatus('running');
        processBatchChunk(doc, safeStartIdx, activeSession.currentPage);
      } else {
        setPdfDoc(null);
        setLoadingState(LoadingState.IDLE);
      }

    } catch (err) {
      console.error(err);
      toast.error('فشل في قراءة ملف PDF. قد يكون معطوباً أو محمياً.');
      setLoadingState(LoadingState.IDLE);
    }
  };

  // Process a chunk of pages (sequential with CONCURRENT_PAGES=1, or parallel if increased)
  const processBatchChunk = async (doc: PDFDocumentProxy, startPdfPage: number, startManuscriptPage: number) => {
    const mySessionId = batchControlRef.current.sessionId;
    if (batchControlRef.current.shouldStop || batchControlRef.current.sessionId !== mySessionId) {
      setBatchStatus('paused');
      setLoadingState(LoadingState.IDLE);
      return;
    }

    if (startPdfPage > doc.numPages) {
      // All pages processed
      batchRunningRef.current = false;
      const failed = batchControlRef.current.failedPages;
      if (failed.length > 0) {
        const failedList = failed.map(f => f.pdfPage).join(', ');
        setError(`تم الانتهاء مع ${failed.length} صفحة فاشلة (PDF pages: ${failedList}). يمكنك الاستئناف لإعادة المحاولة.`);
        batchControlRef.current.shouldStop = true;
        setBatchStatus('paused');
        setLoadingState(LoadingState.ERROR);
      } else {
        setBatchStatus('completed');
        toast.success(`تم الانتهاء من معالجة الكتاب بالكامل (${doc.numPages} صفحة).`);
        setPdfDoc(null);
        setBatchStatus('idle');
        setLoadingState(LoadingState.IDLE);
        setCurrentImage(null);
      }
      return;
    }

    setLoadingState(LoadingState.ANALYZING);
    setCurrentPdfPageIdx(startPdfPage);
    setActiveSession(prev => prev ? ({ ...prev, currentPage: startManuscriptPage }) : null);

    try {
      // 1. Render page image and show preview
      const { base64, mimeType, previewUrl } = await renderPageAsImage(doc, startPdfPage);
      setCurrentImage({ base64, mimeType, previewUrl });

      // 2. Analyze (analyzeManuscript already has 3 retries with backoff)
      const text = await analyzeManuscript(base64, mimeType);

      // 3. Save the page
      const pageId = generateId();
      const newPage: PageData = {
        id: pageId,
        pageNumber: startManuscriptPage,
        text: text,
        timestamp: Date.now(),
        previewUrl: ''
      };

      setLibrary(prev => {
        const currentBook = prev.books[batchControlRef.current.activeBookId];
        if (!currentBook) return prev;

        let updatedPages = [...currentBook.pages];
        const collisionIndex = updatedPages.findIndex(p => p.pageNumber === startManuscriptPage);
        if (collisionIndex !== -1) {
          updatedPages = updatedPages.map(p => {
            if (p.pageNumber >= startManuscriptPage) {
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
            [batchControlRef.current.activeBookId]: {
              ...currentBook,
              pages: updatedPages
            }
          }
        };
      });

      setLastProcessedPageId(pageId);

    } catch (err: any) {
      console.error(`Page ${startPdfPage} failed:`, err);
      // Record failure and continue to next page
      batchControlRef.current.failedPages.push({
        pdfPage: startPdfPage,
        manuscriptPage: startManuscriptPage
      });
      setError(`خطأ في صفحة PDF رقم ${startPdfPage}: ${err.message}`);
    }

    // Move to next page after a short delay
    setTimeout(() => {
      if (!batchControlRef.current.shouldStop && batchControlRef.current.sessionId === mySessionId) {
        processBatchChunk(doc, startPdfPage + 1, startManuscriptPage + 1);
      } else if (batchControlRef.current.sessionId === mySessionId) {
        setBatchStatus('paused');
        setLoadingState(LoadingState.IDLE);
      }
    }, 300);
  };

  const pauseBatch = () => {
    batchControlRef.current.shouldStop = true;
    batchRunningRef.current = false;
    setBatchStatus('paused');
    setLoadingState(LoadingState.IDLE);
  };

  const resumeBatch = () => {
    if (!pdfDoc || !activeSession) return;
    const failed = batchControlRef.current.failedPages;
    batchControlRef.current.shouldStop = false;
    batchControlRef.current.failedPages = [];
    batchRunningRef.current = true;
    setBatchStatus('running');
    setError(null);

    if (failed.length > 0) {
      // Retry failed pages by starting from the first failed page
      const firstFailed = failed.sort((a, b) => a.pdfPage - b.pdfPage)[0];
      processBatchChunk(pdfDoc, firstFailed.pdfPage, firstFailed.manuscriptPage);
    } else {
      // Resume from current position
      processBatchChunk(pdfDoc, currentPdfPageIdx + 1, activeSession.currentPage);
    }
  };

  const handleUpdatePageText = (newText: string) => {
    if (!activeSession || !lastProcessedPageId) return;
    setLibrary(prev => {
      const book = prev.books[activeSession.bookId];
      if (!book) return prev;
      const updatedPages = book.pages.map(p => p.id === lastProcessedPageId ? { ...p, text: newText } : p);
      return { ...prev, books: { ...prev.books, [activeSession.bookId]: { ...book, pages: updatedPages } } };
    });
  };

  const handleUpdateBookPage = (bookId: string, pageId: string, newText: string) => {
    setLibrary(prev => {
      const book = prev.books[bookId];
      if (!book) return prev;
      const updatedPages = book.pages.map(p => p.id === pageId ? { ...p, text: newText } : p);
      return { ...prev, books: { ...prev.books, [bookId]: { ...book, pages: updatedPages } } };
    });
  };

  const handleToggleBookStatus = async (bookId: string) => {
    const book = library.books[bookId];
    if (!book) return;

    if (book.status !== 'published') {
      if (!firebaseUser) {
        toast.warning('يجب تسجيل الدخول لنشر الكتب في المكتبة العامة.');
        return;
      }
      try {
        await publishBookToPublic(book, firebaseUser.uid);
      } catch (err) {
        toast.error('فشل في نشر الكتاب للعامة');
        return;
      }
    } else {
      if (firebaseUser && book.ownerId === firebaseUser.uid) {
        try {
          await unpublishBookFromPublic(bookId);
        } catch (err) {
          console.error(err);
        }
      } else if (book.ownerId && (!firebaseUser || book.ownerId !== firebaseUser.uid)) {
        toast.warning('لا تملك صلاحية إلغاء نشر هذا الكتاب.');
        return;
      }
    }

    setLibrary(prev => {
      const b = prev.books[bookId];
      if (!b) return prev;
      const newStatus = b.status === 'published' ? 'draft' : 'published';
      return {
        ...prev,
        books: {
          ...prev.books,
          [bookId]: {
            ...b,
            status: newStatus as Book['status'],
            ownerId: firebaseUser ? firebaseUser.uid : b.ownerId
          }
        }
      };
    });
  };

  const handleUpdateWholeBook = (bookId: string, parsedPages: {id: string, text: string}[]) => {
    setLibrary(prev => {
      const book = prev.books[bookId];
      if (!book) return prev;

      const updatedPages = book.pages.map(p => {
        const matchingParsed = parsedPages.find(pp => pp.id === p.id);
        return matchingParsed ? { ...p, text: matchingParsed.text } : p;
      });

      return { ...prev, books: { ...prev.books, [bookId]: { ...book, pages: updatedPages } } };
    });
  };

  const handleDeletePage = async (bookId: string, pageId: string) => {
    const ok = await confirm({
      title: 'حذف الصفحة',
      message: 'هل أنت متأكد من حذف هذه الصفحة؟ لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      dangerous: true,
    });
    if (!ok) return;
    setLibrary(prev => {
      const book = prev.books[bookId];
      if (!book) return prev;
      const updatedPages = book.pages.filter(p => p.id !== pageId);
      return {
        ...prev,
        books: { ...prev.books, [bookId]: { ...book, pages: updatedPages } }
      };
    });
  };

  const handlePageNumberEdit = (bookId: string, pageId: string, newNumber: number) => {
    setLibrary(prev => {
      const book = prev.books[bookId];
      if (!book) return prev;

      const updatedPages = book.pages.map(p => p.id === pageId ? { ...p, pageNumber: newNumber } : p)
        .sort((a, b) => a.pageNumber - b.pageNumber);

      return {
        ...prev,
        books: {
          ...prev.books,
          [bookId]: { ...book, pages: updatedPages }
        }
      };
    });
  };

  const lastPageData = activeSession && lastProcessedPageId
    ? library.books[activeSession.bookId]?.pages.find(p => p.id === lastProcessedPageId) || null
    : null;

  if (isLanding) {
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
                 نظام الأرشفة الرقمي
              </h1>
           </div>

           <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md shadow-2xl ring-1 ring-black/50">
             <p className="text-slate-300 text-lg mb-8 font-manuscript border-b border-white/5 pb-4">
               نظام الأرشفة الذكي للمخطوطات والوثائق <span className="text-[#c5a059]">v4.0</span>
             </p>
             <div className="flex flex-col gap-3">
               <button
                 onClick={() => navigate('/setup')}
                 className="group w-full py-4 bg-gradient-to-r from-[#c5a059] to-[#9f7d3d] text-slate-900 font-bold text-xl rounded-xl shadow-[0_0_20px_rgba(197,160,89,0.2)] hover:shadow-[0_0_30px_rgba(197,160,89,0.4)] hover:scale-[1.02] transition-all duration-300 active:scale-95 flex items-center justify-center gap-3"
               >
                 <span>نظام الأرشفة</span>
                 <ArrowRight className="group-hover:-translate-x-1 transition-transform" />
               </button>

               <button
                 onClick={() => navigate('/library')}
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
              onClick={() => navigate('/setup')}
            >
              <div className="p-2 bg-gradient-to-br from-[#c5a059] to-[#8a6d32] rounded-lg text-slate-900 shadow-md">
                <ScrollText size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-tight">نظام الأرشفة الرقمي</h1>
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
                <Button variant="ghost" size="sm" onClick={() => navigate('/setup')} className="text-slate-400 hover:text-white">
                  <ArrowRight size={16} className="ml-2" />عودة للرئيسية
                </Button>
              ) : view === 'setup' ? (
                <Button variant="ghost" size="sm" onClick={() => navigate('/library')} className="text-[#c5a059] hover:bg-[#c5a059]/10 border border-[#c5a059]/20">
                  <BookCopy size={16} className="ml-2" /> المكتبة الرقمية
                </Button>
              ) : null}
              {/* Manual Cloud Save Button */}
              {firebaseUser && (
                <button
                  onClick={handleManualCloudSave}
                  disabled={cloudSyncStatus === 'saving'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-300 ${
                    cloudSyncStatus === 'saving'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 cursor-wait'
                      : cloudSyncStatus === 'saved'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : cloudSyncStatus === 'error'
                      ? 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'bg-slate-800 border-[#c5a059]/30 text-[#c5a059] hover:bg-[#c5a059]/10 hover:border-[#c5a059]/60'
                  }`}
                  title="حفظ المكتبة في السحابة يدوياً"
                >
                  {cloudSyncStatus === 'saving' ? (
                    <><span className="animate-spin inline-block">⟳</span> جاري الحفظ...</>
                  ) : cloudSyncStatus === 'saved' ? (
                    <>✓ تم الحفظ</>
                  ) : cloudSyncStatus === 'error' ? (
                    <>✗ فشل الحفظ</>
                  ) : (
                    <><Upload size={13} /> حفظ سحابي</>
                  )}
                </button>
              )}

              {firebaseUser ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 hidden sm:inline" title={firebaseUser.email || ''}>{firebaseUser.displayName?.split(' ')[0] || 'مستخدم'}</span>
                  <Button variant="ghost" size="sm" onClick={logoutUser} className="text-[#c5a059] hover:bg-[#c5a059]/10">
                    <LogOut size={16} className="ml-2 hidden sm:block"/> خروج
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={async () => {
                  try {
                    await loginWithGoogle();
                  } catch (err: any) {
                    toast.error('فشل تسجيل الدخول: ' + (err.message || 'خطأ غير معروف'));
                  }
                }} className="text-[#c5a059] hover:bg-[#c5a059]/10 bg-slate-800 border border-[#c5a059]/20" data-testid="google-login-btn">
                  <User size={16} className="ml-2 hidden sm:block"/> دخول سحابي
                </Button>
              )}
            </nav>
          </div>
        </header>
      )}

      <main className={`transition-all duration-300 ${view === 'full-viewer' ? '' : view === 'workspace' ? 'w-full px-4 sm:px-6 py-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12'}`}>
        <Routes>
          <Route path="/setup" element={
            <SessionSetup
              library={library}
              onStartSession={handleStartSession}
              onOpenLibrary={() => navigate('/library')}
              onAddPublisher={handleAddPublisher}
              onAddAuthor={handleAddAuthor}
            />
          } />

          <Route path="/workspace" element={
            activeSession ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:h-[calc(100vh-6rem)]">
                <section className="flex flex-col gap-4 h-full order-1 lg:order-1 min-h-[500px] lg:min-h-0">
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
            ) : null
          } />

          <Route path="/library" element={
            <LibraryView
              library={library}
              currentUserId={firebaseUser?.uid}
              setLibrary={setLibrary}
              onDeleteBookFromCloud={deleteBookFromCloud}
              onDeletePage={handleDeletePage}
              onLoadPage={(bookId, page) => {
                const bookTitle = library.books[bookId]?.title || '';
                setActiveSession({ bookId, bookTitle, currentPage: page.pageNumber });
                setLastProcessedPageId(page.id);
                navigate('/workspace');
              }}
              onInsertPage={(bookId, afterPageNumber) => {
                const bookTitle = library.books[bookId]?.title || '';
                setActiveSession({ bookId, bookTitle, currentPage: afterPageNumber + 1 });
                navigate('/workspace');
              }}
              onUpdatePageNumber={handlePageNumberEdit}
              onOpenFullViewer={(bookId, mode) => {
                navigate(`/viewer/${bookId}?mode=${mode}`);
              }}
            />
          } />

          <Route path="/viewer/:bookId" element={
            <ViewerPage
              library={library}
              firebaseUser={firebaseUser}
              onUpdatePage={handleUpdateBookPage}
              onUpdateWholeBook={handleUpdateWholeBook}
              onToggleBookStatus={handleToggleBookStatus}
              onDeletePage={handleDeletePage}
            />
          } />

          {/* Catch-all: redirect unknown paths to landing */}
          <Route path="*" element={null} />
        </Routes>
      </main>
    </div>
  );
};

// ── Viewer Page wrapper: reads bookId from URL params ──────────────────────
const ViewerPage: React.FC<{
  library: LibraryState;
  firebaseUser: FirebaseUser | null;
  onUpdatePage: (bookId: string, pageId: string, text: string) => void;
  onUpdateWholeBook: (bookId: string, parsedPages: {id: string, text: string}[]) => void;
  onToggleBookStatus: (bookId: string) => Promise<void>;
  onDeletePage: (bookId: string, pageId: string) => void;
}> = ({ library, firebaseUser, onUpdatePage, onUpdateWholeBook, onToggleBookStatus, onDeletePage }) => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!bookId || !library.books[bookId]) {
      navigate('/library', { replace: true });
    }
  }, [bookId, library.books, navigate]);

  if (!bookId || !library.books[bookId]) {
    return null;
  }

  const searchParams = new URLSearchParams(location.search);
  const viewerMode = (searchParams.get('mode') === 'edit' ? 'edit' : 'read') as 'read' | 'edit';

  return (
    <FullBookViewer
      book={library.books[bookId]}
      currentUserId={firebaseUser?.uid}
      initialMode={viewerMode}
      onClose={() => navigate('/library')}
      onUpdatePage={onUpdatePage}
      onUpdateWholeBook={onUpdateWholeBook}
      onToggleStatus={() => onToggleBookStatus(bookId)}
      onDeletePage={(pageId) => onDeletePage(bookId, pageId)}
    />
  );
};

export default App;
