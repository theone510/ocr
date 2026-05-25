import { toHindi, fromHindi } from '../../utils/helpers';

/**
 * Transforms the RAW database text (with custom pseudo-tags) 
 * into Tiptap-compatible HTML.
 */
export const deserializeToTiptap = (rawText: string, pageNumber: number, pageId: string) => {
    if (!rawText) return '';
    
    // Collapse spacing around footnotes
    let html = rawText.replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1');
    
    // Line breaks to <br> for Tiptap paragraphs
    html = html.replace(/\n/g, '<br/>');
    
    // Tags Replacement
    html = html
      .replace(/<(h[1-5])>(.*?)<\/\1>/g, '<$1>$2</$1>') // Standard H1-H5 are fine for Tiptap Heading extension
      .replace(/<center>(.*?)<\/center>/g, '<center>$1</center>') // Handled by CenterNode
      .replace(/<bold>(.*?)<\/bold>/g, '<bold>$1</bold>') // Handled by CustomBoldMark
      .replace(/<aya>(.*?)<\/aya>/g, '<aya>$1</aya>') // Handled by AyaMark
      .replace(/<hadith>(.*?)<\/hadith>/g, '<hadith>$1</hadith>') // Handled by HadithMark
      .replace(/<poetry>(.*?)<\/poetry>/g, '<poetry>$1</poetry>') // Handled by PoetryNode
      .replace(/<footnote>(.*?)<\/footnote>/gs, '<footnote>$1</footnote>');
      
    // Replace numbering 
    html = html.replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`);

    // Wrap in paragraph if it's not already wrapped
    // HTML returned here is injected into Tiptap's content
    return `<p>${html}</p>`;
};

/**
 * Transforms Tiptap's output HTML back to the RAW custom format.
 * e.g., <span class="viewer-aya editor-aya">...</span> becomes <aya>...</aya>
 */
export const serializeFromTiptap = (html: string) => {
    // We create a temporary DOM element to traverse it easily
    const temp = document.createElement('div');
    temp.innerHTML = html;
    let result = "";

    const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            
            // Helper: recursively extract inline content preserving marks
            const extractInlineContent = (el: HTMLElement) => {
                const before = result;
                result = '';
                Array.from(el.childNodes).forEach(processNode);
                const inner = result;
                result = before;
                return inner;
            };

            // Marks & Nodes mapped strictly by classes or tags
            if (tag === 'h1' || el.classList.contains('editor-h1')) {
                const inner = extractInlineContent(el);
                result += `<h1>${inner || el.textContent}</h1>\n`;
            } else if (tag === 'h2' || el.classList.contains('editor-h2')) {
                const inner = extractInlineContent(el);
                result += `<h2>${inner || el.textContent}</h2>\n`;
            } else if (tag === 'h3' || el.classList.contains('editor-h3')) {
                const inner = extractInlineContent(el);
                result += `<h3>${inner || el.textContent}</h3>\n`;
            } else if (tag === 'h4' || el.classList.contains('editor-h4')) {
                const inner = extractInlineContent(el);
                result += `<h4>${inner || el.textContent}</h4>\n`;
            } else if (tag === 'h5' || el.classList.contains('editor-h5')) {
                const inner = extractInlineContent(el);
                result += `<h5>${inner || el.textContent}</h5>\n`;
            } else if (el.classList.contains('editor-center') || tag === 'center') {
                result += `\n<center>${el.textContent}</center>\n`;
            }
            else if (el.classList.contains('editor-poetry') || tag === 'poetry') {
                result += `\n<poetry>${el.textContent}</poetry>\n`;
            }
            else if (el.classList.contains('editor-footnote') || tag === 'footnote') {
                result += `\n<footnote>${el.textContent}</footnote>\n`;
            }
            else if (el.classList.contains('editor-bold') || tag === 'bold' || tag === 'strong' || tag === 'b') {
                result += `<bold>${el.textContent}</bold>`;
            }
            else if (el.classList.contains('editor-aya') || tag === 'aya') {
                result += `<aya>${el.textContent}</aya>`;
            }
            else if (el.classList.contains('editor-hadith') || tag === 'hadith') {
                result += `<hadith>${el.textContent}</hadith>`;
            }
            else if (tag === 'br') {
                result += "\n";
            }
            else if (tag === 'p' || tag === 'div') {
                // Ignore page-break entirely for specific page saving
                if (el.classList.contains('page-break')) return;

                Array.from(el.childNodes).forEach(processNode);
                result += "\n"; // Block elements produce newline
            }
            else {
                Array.from(el.childNodes).forEach(processNode);
            }
        }
    };

    Array.from(temp.childNodes).forEach(processNode);
    
    // Global protocol: Collapse multiple newlines safely
    return result.replace(/\n+/g, '\n').trim();
};

/**
 * Splits the massive concatenated Tiptap HTML string back into individual page texts.
 * Relies on the <div class="page-break" data-page-id="..."> markers.
 */
export const extractPagesFromHTML = (html: string, originalPages: import('../../types').PageData[]) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    const pagesToSave: { id: string, text: string }[] = [];
    let currentPageId = originalPages[0]?.id; // Default to first page ID if missing
    let currentPageHTML = '';
    
    // Safety fallback index
    let pageIndex = 0;

    // Traverse root children
    Array.from(temp.childNodes).forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('page-break')) {
                // Save accumulated HTML for the CURRENT page
                if (currentPageId) {
                    pagesToSave.push({
                        id: currentPageId,
                        text: serializeFromTiptap(currentPageHTML)
                    });
                }
                
                // Start a NEW page based on the marker's NEXT page info
                currentPageId = el.getAttribute('data-page-id') || originalPages[pageIndex + 1]?.id;
                currentPageHTML = '';
                pageIndex++;
            } else {
                currentPageHTML += el.outerHTML;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            currentPageHTML += node.textContent || '';
        }
    });
    
    // Save the last trailing page
    if (currentPageId && currentPageHTML.trim() !== '') {
        pagesToSave.push({
            id: currentPageId,
            text: serializeFromTiptap(currentPageHTML)
        });
    }

    return pagesToSave;
};
