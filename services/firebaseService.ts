import { initializeApp } from "firebase/app";
import { initializeFirestore, Firestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
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
let app;
export let db: Firestore | null = null;
export let auth: ReturnType<typeof getAuth> | null = null;
export let googleProvider: GoogleAuthProvider | null = null;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    // Optional book fields (author, publisher, ...) may be undefined; Firestore
    // rejects undefined values unless told to ignore them.
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
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
    await signInWithPopup(auth, googleProvider);
    // User object will be handled by App.tsx through onAuthStateChanged
  } catch (error) {
    console.error("Error logging in:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logging out:", error);
    throw error;
  }
};

// Firestore document IDs can't contain "/", so map it to a look-alike character.
// Titles without "/" keep their existing document IDs.
const publicBookDocId = (title: string) => title.replace(/\//g, '∕');

// Database Functions
export const syncLibraryToFirestore = async (userId: string, library: LibraryState) => {
  if (!db) {
    console.warn("DB not initialized, falling back to localStorage");
    return;
  }
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, { library }, { merge: true });
  } catch (error) {
    console.error("Error syncing library:", error);
    throw error;
  }
};

export const loadLibraryFromFirestore = async (userId: string): Promise<LibraryState | null> => {
  if (!db) {
    console.warn("DB not initialized");
    return null;
  }
  try {
    const userDocRef = doc(db, "users", userId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data().library as LibraryState;
    }
    return null;
  } catch (error) {
    console.error("Error loading library:", error);
    throw error;
  }
};

export const publishBookToPublic = async (book: Book, userId: string) => {
  if (!db) {
    console.warn("DB not initialized");
    return;
  }
  try {
    const bookWithOwner = { ...book, ownerId: userId, status: 'published' as const };
    const publicDocRef = doc(db, "public_books", publicBookDocId(book.title));
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
    const publicDocRef = doc(db, "public_books", publicBookDocId(bookTitle));
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
      const book = docSnap.data() as Book;
      books[book.title || docSnap.id] = book;
    });
    return books;
  } catch (error) {
    console.error("Error fetching public books:", error);
    return {};
  }
};
