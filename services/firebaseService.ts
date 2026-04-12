/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
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

// Auth Functions
export const loginWithGoogle = async () => {
  try {
    if (!auth || !googleProvider) {
      throw new Error("Firebase auth is not initialized");
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (popupError: any) {
      if (
        popupError.code === 'auth/popup-blocked' ||
        popupError.code === 'auth/popup-closed-by-user' ||
        popupError.message?.includes('Cross-Origin')
      ) {
        console.log("Popup blocked, falling back to redirect...");
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw popupError;
      }
    }
  } catch (error) {
    console.error("Error logging in:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth!);
  } catch (error) {
    console.error("Error logging out:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW SUBCOLLECTION APPROACH
// Structure:
//   users/{userId}/books/{bookTitle}   ← one doc per book (no 1 MB limit issue)
//   users/{userId}/meta/info           ← publishers & authors lists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync the full library using subcollections.
 * Each book is stored as its own Firestore document so we never hit the 1 MB limit.
 * Deleted books are removed from Firestore via a batch delete.
 */
export const syncLibraryToFirestore = async (userId: string, library: LibraryState) => {
  if (!db) {
    console.warn("DB not initialized, falling back to localStorage");
    return;
  }
  try {
    // 1. Save metadata (publishers & authors)
    const metaRef = doc(db, "users", userId, "meta", "info");
    await setDoc(metaRef, {
      publishers: library.publishers ?? [],
      authors: library.authors ?? [],
    });

    // 2. Get existing book IDs from Firestore
    const booksCol = collection(db, "users", userId, "books");
    const existingSnap = await getDocs(booksCol);
    const existingIds = new Set(existingSnap.docs.map(d => d.id));

    // 3. Write/update each book document (Firestore limit: 500 ops per batch)
    const bookEntries = Object.entries(library.books);
    const BATCH_SIZE = 400;

    for (let i = 0; i < bookEntries.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = bookEntries.slice(i, i + BATCH_SIZE);
      for (const [title, book] of chunk) {
        const bookRef = doc(db, "users", userId, "books", title);
        batch.set(bookRef, book);
      }
      await batch.commit();
    }

    // 4. Delete books that were removed locally but still exist in Firestore
    const currentIds = new Set(Object.keys(library.books));
    const idsToDelete = [...existingIds].filter(id => !currentIds.has(id));

    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      idsToDelete.slice(i, i + BATCH_SIZE).forEach(id => {
        batch.delete(doc(db!, "users", userId, "books", id));
      });
      await batch.commit();
    }
  } catch (error) {
    console.error("Error syncing library:", error);
    throw error;
  }
};

/**
 * Load the full library from Firestore subcollections.
 */
export const loadLibraryFromFirestore = async (userId: string): Promise<LibraryState | null> => {
  if (!db) {
    console.warn("DB not initialized");
    return null;
  }
  try {
    // Load metadata
    const metaRef = doc(db, "users", userId, "meta", "info");
    const metaSnap = await getDoc(metaRef);

    // Load all books
    const booksCol = collection(db, "users", userId, "books");
    const booksSnap = await getDocs(booksCol);

    if (!metaSnap.exists() && booksSnap.empty) {
      // Try legacy format (old single-document approach) for backward compatibility
      const legacyRef = doc(db, "users", userId);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists() && legacySnap.data().library) {
        console.log("Loaded from legacy single-document format. Will migrate on next sync.");
        return legacySnap.data().library as LibraryState;
      }
      return null;
    }

    const books: Record<string, Book> = {};
    booksSnap.forEach(docSnap => {
      books[docSnap.id] = docSnap.data() as Book;
    });

    const meta = metaSnap.exists() ? metaSnap.data() : {};

    return {
      books,
      publishers: meta.publishers ?? ['العتبة الحسينية المقدسة', 'دار المعارف', 'مؤسسة الأعلمي للمطبوعات'],
      authors: meta.authors ?? ['آقا بزرگ الطهراني', 'الشيخ المفيد', 'الشريف المرتضى'],
    };
  } catch (error) {
    console.error("Error loading library:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public Books
// ─────────────────────────────────────────────────────────────────────────────

export const publishBookToPublic = async (book: Book, userId: string) => {
  if (!db) {
    console.warn("DB not initialized");
    return;
  }
  try {
    const bookWithOwner = { ...book, ownerId: userId, status: 'published' as const };
    const publicDocRef = doc(db, "public_books", book.title);
    await setDoc(publicDocRef, bookWithOwner);
  } catch (error) {
    console.error("Error publishing book:", error);
    throw error;
  }
};

export const unpublishBookFromPublic = async (bookTitle: string) => {
  if (!db) {
    console.warn("DB not initialized");
    return;
  }
  try {
    const publicDocRef = doc(db, "public_books", bookTitle);
    await deleteDoc(publicDocRef);
  } catch (error) {
    console.error("Error unpublishing book:", error);
    throw error;
  }
};

export const fetchPublicBooks = async (): Promise<Record<string, Book>> => {
  if (!db) {
    console.warn("DB not initialized");
    return {};
  }
  try {
    const publicBooksCol = collection(db, "public_books");
    const bookSnapshot = await getDocs(publicBooksCol);
    const books: Record<string, Book> = {};
    bookSnapshot.forEach((docSnap) => {
      books[docSnap.id] = docSnap.data() as Book;
    });
    return books;
  } catch (error) {
    console.error("Error fetching public books:", error);
    return {};
  }
};
