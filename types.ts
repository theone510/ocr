
export interface PageData {
  id: string;
  pageNumber: number;
  text: string;
  timestamp: number;
  previewUrl: string;
}

export interface Book {
  id: string;                // Stable UUID — used as Firestore doc ID
  title: string;             // Human-visible name (mutable)
  author?: string;
  publisher?: string;
  publicationPlace?: string; // New
  publicationYear?: string;  // New
  totalPages?: number;       // New
  isSeries?: boolean; // true = دورية/سلسلة, false = كتاب مفرد
  volumeNumber?: string;
  status?: 'draft' | 'published'; // New
  ownerId?: string;
  pages: PageData[];
}

export interface LibraryState {
  books: Record<string, Book>;
  publishers: string[]; // List of available publishers
  authors: string[];    // List of available authors
}

export enum LoadingState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface UploadedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}
