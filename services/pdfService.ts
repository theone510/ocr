
import * as pdfjsLib from 'pdfjs-dist';
// Bundle the worker with the app so it always matches the library version and works offline
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Handle potential default export structure from CDN/esm.sh
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<any>;
}

export const loadPDF = async (file: File): Promise<PDFDocumentProxy> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Configure with CMaps for better Arabic text support during rendering
    const loadingTask = pdfjs.getDocument({ 
      data: arrayBuffer,
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/standard_fonts/`
    });
    
    // Await here so failures (corrupt / password-protected files) reach the catch below
    return await loadingTask.promise;
  } catch (error) {
    console.error("Error loading PDF:", error);
    throw new Error("فشل تحميل ملف PDF. تأكد من أن الملف سليم وغير محمي بكلمة مرور.");
  }
};

export const renderPageAsImage = async (pdf: PDFDocumentProxy, pageNumber: number): Promise<{ base64: string, mimeType: string, previewUrl: string }> => {
  try {
    const page = await pdf.getPage(pageNumber);
    
    // Scale 2.0 provides good balance between OCR quality and performance
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not create canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    // Convert to JPEG with 0.8 quality to reduce payload size while maintaining text clarity
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];

    return {
      base64,
      mimeType: 'image/jpeg',
      previewUrl: dataUrl
    };
  } catch (error) {
    console.error(`Error rendering page ${pageNumber}:`, error);
    throw new Error(`فشل تحويل الصفحة ${pageNumber} إلى صورة. قد تكون الصفحة تالفة.`);
  }
};
