/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { LibraryState, Book } from "../types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase safely
let app: any;
export let db: ReturnType<typeof getFirestore> | null = null;
export let auth: ReturnType<typeof getAuth> | null = null;
export let googleProvider: GoogleAuthProvider | null = null;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } else {
    console.warn("Firebase API Key is missing. Please add it to .env.local.");
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export const loginWithGoogle = async () => {
  if (!auth || !googleProvider) throw new Error("Firebase auth is not initialized");
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (popupError: any) {
    if (
      popupError.code === 'auth/popup-blocked' ||
      popupError.code === 'auth/popup-closed-by-user' ||
      popupError.message?.includes('Cross-Origin')
    ) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      throw popupError;
    }
  }
};

export const logoutUser = async () => {
  await signOut(auth!);
};

// ─────────────────────────────────────────────────────────────────────────────
// SUSTAINABLE SYNC ARCHITECTURE
//
// Design principles:
//   1. ONE book = ONE Firestore document (no 1MB limit issue)
//   2. Writes are per-book atomic operations, NOT batch writes of the whole library
//   3. No “read before write” — we just write what we have
//   4. Deletions are immediate and direct
//   5. No WebSocket write stream abuse — each write is independent
//
// Firestore structure:
//   users/{userId}/books/{book.id}   ← UUID, NOT the Arabic title (production-safe)
//   users/{userId}/meta/info         ← publishers & authors
//
// MIGRATION NOTE:
//   Legacy documents that used book.title as the doc ID are kept as-is.
//   On the next read, loadLibraryFromFirestore stamps id = docSnap.id if missing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a SINGLE book document to Firestore.
 * Uses book.id (UUID) as the document key — never the mutable title.
 */
export const syncSingleBook = async (userId: string, book: Book): Promise<void> => {
  if (!db) throw new Error("Firestore not initialized");
  const bookRef = doc(db, "users", userId, "books", book.id);
  await setDoc(bookRef, book);
};

/**
 * Delete a SINGLE book document from Firestore immediately.
 * Accepts the stable book UUID (book.id), not the title.
 */
export const deleteSingleBook = async (userId: string, bookId: string): Promise<void> => {
  if (!db) throw new Error("Firestore not initialized");
  await deleteDoc(doc(db, "users", userId, "books", bookId));
};

/**
 * Save metadata (publishers & authors list) to Firestore.
 */
export const syncMeta = async (userId: string, publishers: string[], authors: string[]): Promise<void> => {
  if (!db) throw new Error("Firestore not initialized");
  const metaRef = doc(db, "users", userId, "meta", "info");
  await setDoc(metaRef, { publishers, authors });
};

/**
 * Load the full library from Firestore subcollections.
 * Falls back to legacy single-document format for backward compatibility.
 */
export const loadLibraryFromFirestore = async (userId: string): Promise<LibraryState | null> => {
  if (!db) return null;

  // Load metadata and books in parallel for speed
  const metaRef = doc(db, "users", userId, "meta", "info");
  const booksCol = collection(db, "users", userId, "books");

  const [metaSnap, booksSnap] = await Promise.all([
    getDoc(metaRef),
    getDocs(booksCol),
  ]);

  // No subcollection data → try legacy single-document format
  if (!metaSnap.exists() && booksSnap.empty) {
    const legacyRef = doc(db, "users", userId);
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists() && legacySnap.data().library) {
      console.log("Loaded from legacy format. Will migrate on next save.");
      return legacySnap.data().library as LibraryState;
    }
    return null;
  }

  const books: Record<string, Book> = {};
  booksSnap.forEach(docSnap => {
    // MIGRATION: legacy docs used the Arabic title as the doc ID and had no `id` field.
    // Stamp id = docSnap.id so every Book always has a stable id going forward.
    const raw = docSnap.data() as Omit<Book, 'id'> & { id?: string };
    const book: Book = { ...raw, id: raw.id ?? docSnap.id };
    books[book.id] = book;
  });

  const meta = metaSnap.exists() ? metaSnap.data() : {};
  return {
    books,
    publishers: meta.publishers ?? ['العتبة الحسينية المقدسة', 'دار المعارف', 'مؤسسة الأعلمي للمطبوعات'],
    authors: meta.authors ?? ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى'],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public Books
// ─────────────────────────────────────────────────────────────────────────────

export const publishBookToPublic = async (book: Book, userId: string): Promise<void> => {
  if (!db) throw new Error("Firestore not initialized");
  const bookWithOwner = { ...book, ownerId: userId, status: 'published' as const };
  // Use book.id (UUID) as the public_books document ID — same pattern as private books.
  await setDoc(doc(db, "public_books", book.id), bookWithOwner);
};

export const unpublishBookFromPublic = async (bookId: string): Promise<void> => {
  if (!db) throw new Error("Firestore not initialized");
  await deleteDoc(doc(db, "public_books", bookId));
};

export const fetchPublicBooks = async (): Promise<Record<string, Book>> => {
  if (!db) return {};
  try {
    const snap = await getDocs(collection(db, "public_books"));
    const books: Record<string, Book> = {};
    snap.forEach(d => {
      const raw = d.data() as Omit<Book, 'id'> & { id?: string };
      const book: Book = { ...raw, id: raw.id ?? d.id };
      books[book.id] = book;
    });
    return books;
  } catch {
    return {};
  }
};
