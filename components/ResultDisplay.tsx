
import React, { useState, useEffect, useRef } from 'react';
import { 
  Copy, Check, FileText, Pencil, Save, X, 
  Music, MessageSquarePlus,
  Heading1, Heading2, Heading3, Heading4, Heading5, Sparkles, Quote,
  Eraser, AlignCenter, Bold
} from 'lucide-react';
import { Button } from './Button';
import { toHindi } from '../utils/helpers';

interface ResultDisplayProps {
  text: string | null;
  isLoading: boolean;
  error: string | null;
  onTextChange?: (newText: string) => void;
  pageNumber?: number;
  bookTitle?: string;
  isAutoSaved?: boolean;
  enableStickyHeader?: boolean;
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ 
  text, 
  isLoading, 
  error, 
  onTextChange,
  pageNumber,
  bookTitle,
  isAutoSaved,
  enableStickyHeader = true
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(text || '');
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text !== null) {
      // Enforce newline protocol on incoming text
      setLocalText(text.replace(/\n+/g, '\n'));
    }
  }, [text]);

  const cleanNewlines = (str: string) => str.replace(/\n+/g, '\n').trim();

  const deserializeToHtml = (raw: string) => {
    // 1. Collapse all multiple newlines to a single one
    const cleanRaw = cleanNewlines(raw);
    
    // FIX: Aggressive collapse before footnotes to keep them inline
    const processedRaw = cleanRaw.replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1');
    
    // 2. Convert tags and newlines to editor-friendly HTML
    return processedRaw
      .replace(/<h1>(.*?)<\/h1>/gs, '<h1 class="editor-h1">$1</h1>')
      .replace(/<h2>(.*?)<\/h2>/gs, '<h2 class="editor-h2">$1</h2>')
      .replace(/<h3>(.*?)<\/h3>/gs, '<h3 class="editor-h3">$1</h3>')
      .replace(/<center>(.*?)<\/center>/gs, '<div class="editor-center">$1</div>')
      .replace(/<bold>(.*?)<\/bold>/gs, '<span class="editor-bold">$1</span>')
      .replace(/<aya>(.*?)<\/aya>/gs, '<span class="editor-aya">$1</span>')
      .replace(/<hadith>(.*?)<\/hadith>/gs, '<span class="editor-hadith">$1</span>')
      .replace(/<poetry>(.*?)<\/poetry>/gs, '<div class="editor-poetry">$1</div>')
      .replace(/<footnote>(.*?)<\/footnote>/gs, (match, content) => {
          // Clean content inside the footnote as well
          const cleanContent = content.replace(/\n+/g, ' ');
          return `<div class="editor-footnote">${cleanContent}</div>`;
      })
      // Convert bracketed numbers [1] to plain text with Hindi Digits, no HTML styling
      .replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`)
      .replace(/\n/g, '<br>');
  };

  const serializeToTags = (html: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    let result = "";

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        
        if (tag === 'h1' || el.classList.contains('editor-h1')) {
          result += `<h1>${el.textContent}</h1>`;
        } else if (tag === 'h2' || el.classList.contains('editor-h2')) {
          result += `<h2>${el.textContent}</h2>`;
        } else if (tag === 'h3' || el.classList.contains('editor-h3')) {
          result += `<h3>${el.textContent}</h3>`;
        } else if (el.classList.contains('editor-center') || el.style.textAlign === 'center') {
           result += `<center>${el.textContent}</center>\n`; // Add newline for block feel
        } else if (el.classList.contains('editor-bold') || tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight) >= 700) {
           result += `<bold>${el.textContent}</bold>`;
        } else if (el.classList.contains('editor-aya')) {
          result += `<aya>${el.textContent}</aya>`;
        } else if (el.classList.contains('editor-hadith')) {
          result += `<hadith>${el.textContent}</hadith>`;
        } else if (el.classList.contains('editor-poetry')) {
          result += `<poetry>${el.textContent}</poetry>`;
        } else if (el.classList.contains('editor-footnote')) {
          // Strict: strip any internal newlines from footnote content
          const cleanFootnoteContent = el.textContent?.replace(/\n+/g, ' ') || "";
          result += `\n<footnote>${cleanFootnoteContent}</footnote>\n`;
        } else if (tag === 'sup' || el.classList.contains('editor-ref')) {
          result += el.textContent;
        } else if (tag === 'br') {
          result += "\n";
        } else if (tag === 'div' || tag === 'p') {
          Array.from(el.childNodes).forEach(processNode);
          result += "\n";
        } else {
          Array.from(el.childNodes).forEach(processNode);
        }
      }
    };

    Array.from(temp.childNodes).forEach(processNode);
    
    // FINAL GLOBAL PROTOCOL: Collapse any sequence of \n into exactly one \n
    return cleanNewlines(result);
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(cleanNewlines(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleSave = () => {
    if (editorRef.current && onTextChange) {
      const updatedText = serializeToTags(editorRef.current.innerHTML);
      onTextChange(updatedText);
    }
    setIsEditing(false);
  };

  const handleCancel = () => setIsEditing(false);

  const applyFormatting = (type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'aya' | 'hadith' | 'footnote' | 'poetry' | 'center' | 'bold') => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor) return;

    if (type === 'footnote') {
      const selectedText = selection.toString().replace(/\n+/g, ' ');
      const nextNum = editor.querySelectorAll('.editor-footnote').length + 1;
      const hindiNum = toHindi(nextNum);
      
      // Delete selection and insert plain text ref
      range.deleteContents();
      
      const refText = document.createTextNode(`[${hindiNum}]`);
      range.insertNode(refText);
      
      // Insert footnote content at the end
      const footDiv = document.createElement('div');
      footDiv.className = 'editor-footnote';
      footDiv.textContent = `${hindiNum}: ${selectedText}`;
      editor.appendChild(footDiv);
    } else {
      const content = range.extractContents();
      let wrapper: HTMLElement;
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'center', 'poetry'].includes(type)) {
        wrapper = document.createElement('div');
        if(type === 'center') {
             wrapper.className = 'editor-center';
        } else if(type === 'poetry') {
             wrapper.className = 'editor-poetry';
        } else {
             // For headings, let's try to actually create the element
             const headingTypes: Record<string, string> = { 'h1': 'h1', 'h2': 'h2', 'h3': 'h3', 'h4': 'h4', 'h5': 'h5' };
             wrapper = document.createElement(headingTypes[type]);
             wrapper.className = `editor-${type}`;
        }
      } else {
        // Inline elements
        wrapper = document.createElement('span');
        wrapper.className = `editor-${type}`;
      }
      wrapper.appendChild(content);
      range.insertNode(wrapper);
    }
    selection.removeAllRanges();
  };

  const clearFormatting = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // 1. Standard Remove Format
    document.execCommand('removeFormat');

    // 2. Reset Block Elements to DIV
    document.execCommand('formatBlock', false, 'div');

    // 3. Custom Cleanup for wrapped elements (unwrap logic)
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode!;

    // Helper to find closest styled parent inside the editor
    const element = node as HTMLElement;
    const styledParent = element.closest('.editor-h1, .editor-h2, .editor-h3, .editor-h4, .editor-h5, .editor-aya, .editor-hadith, .editor-poetry, .editor-footnote, .editor-ref, .editor-center, .editor-bold');
    
    if (styledParent && editorRef.current?.contains(styledParent)) {
        const parent = styledParent.parentNode;
        if (parent) {
            while (styledParent.firstChild) {
                parent.insertBefore(styledParent.firstChild, styledParent);
            }
            parent.removeChild(styledParent);
        }
    }
    
    // Also strip classes from the current block if formatBlock didn't remove the class attribute
    const blockParent = element.closest('div.editor-poetry, div.editor-footnote, div.editor-center');
    if (blockParent) {
         blockParent.removeAttribute('class');
    }
  };

  const renderPreview = (rawText: string) => {
    if (!rawText) return null;
    
    // Fix: Aggressive collapse before footnotes to keep them inline
    let cleanText = cleanNewlines(rawText).replace(/(?:\r\n|\r|\n)+\s*(\[\d+\])/g, ' $1');
    
    cleanText = cleanText
      .replace(/<(h1)>(.*?)<\/\1>/gs, '<span class="block text-4xl font-bold text-white mb-6 mt-4 border-r-4 border-[#c5a059] pr-4 italic">$2</span>')
      .replace(/<(h2)>(.*?)<\/\1>/gs, '<span class="block text-2xl font-bold text-slate-200 mb-4 mt-3 border-r-4 border-slate-500 pr-3">$2</span>')
      .replace(/<(h3)>(.*?)<\/\1>/gs, '<span class="block text-xl font-bold text-slate-300 mb-3 mt-2 border-r-2 border-slate-600 pr-2">$2</span>')
      .replace(/<(h4)>(.*?)<\/\1>/gs, '<span class="block text-lg font-bold text-slate-400 mb-2 mt-2 border-r-2 border-slate-700 pr-2">$2</span>')
      .replace(/<(h5)>(.*?)<\/\1>/gs, '<span class="block text-base font-bold text-slate-500 mb-2 mt-1 border-r-2 border-slate-800 pr-2">$2</span>')
      .replace(/<center>(.*?)<\/center>/gs, '<div class="text-center font-bold text-slate-200 my-4 py-2">$1</div>')
      .replace(/<bold>(.*?)<\/bold>/gs, '<span class="font-extrabold text-white">$1</span>')
      .replace(/<aya>(.*?)<\/aya>/gs, '<span class="text-[#10b981] bg-[#10b981]/10 px-1 rounded border-b border-[#10b981]/30">$1</span>')
      .replace(/<hadith>(.*?)<\/hadith>/gs, '<span class="text-blue-400 bg-blue-500/10 px-1 rounded border-b border-blue-500/30">$1</span>')
      .replace(/<poetry>(.*?)<\/poetry>/gs, '<div class="text-center italic text-slate-300 my-4 py-2 border-x-2 border-slate-700 bg-slate-800/50 rounded-lg">$1</div>')
      .replace(/<footnote>(.*?)<\/footnote>/gs, (match, content) => {
          const numMatch = content.match(/^(\d+):/);
          const id = numMatch ? `id="fn-preview-${numMatch[1]}"` : '';
          return `<span ${id} class="block text-lg text-slate-500 mt-4 pt-2 border-t border-slate-700 font-sans italic scroll-mt-24 transition-colors duration-500">${content}</span>`;
      });
      
    // Handle inline text with footnote references [1], [2], etc.
    // Replace bracket numbering with Hindi digits
    cleanText = cleanText.replace(/\[(\d+)\]/g, (match, d) => `[${toHindi(d)}]`);

    return <div dangerouslySetInnerHTML={{ __html: cleanText }} />;
  };

  if (isLoading) return (
    <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-2xl border border-white/5">
      <div className="w-12 h-12 border-4 border-[#c5a059]/10 border-t-[#c5a059] rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(197,160,89,0.3)]"></div>
      <p className="font-bold text-[#c5a059] animate-pulse">جاري الاستخلاص...</p>
    </div>
  );

  if (text === null) return (
    <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-800 rounded-2xl text-slate-600">
      <FileText size={48} className="mb-4 opacity-20" />
      <p>بانتظار تحليل المخطوط</p>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 rounded-2xl shadow-2xl border border-white/5 relative isolate overflow-hidden">
      <style>{`
        .editor-container h1, .editor-h1 { display: block; font-size: 2.25rem; font-weight: 700; color: #f1f5f9; margin: 0.5rem 0; border-right: 4px solid #c5a059; padding-right: 1rem; text-align: right; }
        .editor-container h2, .editor-h2 { display: block; font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin: 0.4rem 0; border-right: 4px solid #94a3b8; padding-right: 0.75rem; text-align: right; }
        .editor-container h3, .editor-h3 { display: block; font-size: 1.25rem; font-weight: 700; color: #cbd5e1; margin: 0.3rem 0; border-right: 2px solid #64748b; padding-right: 0.5rem; text-align: right; }
        .editor-container h4, .editor-h4 { display: block; font-size: 1.125rem; font-weight: 700; color: #94a3b8; margin: 0.3rem 0; border-right: 2px solid #475569; padding-right: 0.5rem; text-align: right; }
        .editor-container h5, .editor-h5 { display: block; font-size: 1rem; font-weight: 700; color: #64748b; margin: 0.3rem 0; border-right: 2px solid #334155; padding-right: 0.5rem; text-align: right; }
        .editor-center { display: block; text-align: center; margin: 1rem 0; font-weight: bold; color: #e2e8f0; }
        .editor-bold { font-weight: bold; color: #fff; }
        .editor-aya { color: #10b981; background-color: rgba(16, 185, 129, 0.1); border-bottom: 1px solid rgba(16, 185, 129, 0.3); padding: 0 4px; border-radius: 4px; }
        .editor-hadith { color: #60a5fa; background-color: rgba(96, 165, 250, 0.1); border-bottom: 1px solid rgba(96, 165, 250, 0.3); padding: 0 4px; border-radius: 4px; }
        .editor-poetry { display: block; text-align: center; font-style: italic; color: #e2e8f0; margin: 0.5rem 0; padding: 0.5rem; background-color: rgba(30, 41, 59, 0.5); border-radius: 8px; border-right: 2px solid #475569; border-left: 2px solid #475569; }
        .editor-footnote { display: block; font-size: 1.125rem; color: #94a3b8; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #334155; font-style: italic; text-align: justify; }
        .editor-ref { vertical-align: super; font-size: 0.75rem; color: #c5a059; font-weight: bold; margin: 0 2px; }
        .editor-container:focus { outline: none; }
        .toolbar-btn { display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.6rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 700; transition: all 0.2s; border: 1px solid transparent; color: #94a3b8; }
        .toolbar-btn:hover { background-color: rgba(255,255,255,0.05); color: #fff; }
      `}</style>

      {/* Compact Header & Toolbar */}
      <div className="sticky top-0 z-50 flex flex-col md:flex-row md:items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900/95 backdrop-blur shadow-md gap-3">
        <div className="flex items-center gap-1 md:gap-3 flex-wrap">
          {isEditing ? (
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-white/5 flex-wrap">
              <button onClick={() => applyFormatting('h1')} className="toolbar-btn text-white" title="عنوان 1">
                <Heading1 size={16} /> <span>ع{toHindi(1)}</span>
              </button>
              <button onClick={() => applyFormatting('h2')} className="toolbar-btn" title="عنوان 2">
                <Heading2 size={16} /> <span>ع{toHindi(2)}</span>
              </button>
              <button onClick={() => applyFormatting('h3')} className="toolbar-btn" title="عنوان 3">
                <Heading3 size={16} /> <span>ع{toHindi(3)}</span>
              </button>
              <button onClick={() => applyFormatting('h4')} className="toolbar-btn text-slate-400" title="عنوان 4">
                <Heading4 size={14} /> <span>ع{toHindi(4)}</span>
              </button>
              <button onClick={() => applyFormatting('h5')} className="toolbar-btn text-slate-500" title="عنوان 5">
                <Heading5 size={14} /> <span>ع{toHindi(5)}</span>
              </button>
              <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
              <button onClick={() => applyFormatting('center')} className="toolbar-btn" title="توسيط">
                <AlignCenter size={16} />
              </button>
              <button onClick={() => applyFormatting('bold')} className="toolbar-btn font-bold text-white" title="غامق">
                <Bold size={16} />
              </button>
              <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
              <button onClick={() => applyFormatting('aya')} className="toolbar-btn text-[#10b981] hover:text-[#10b981]" title="آية">
                <Sparkles size={16} /> <span>آية</span>
              </button>
              <button onClick={() => applyFormatting('hadith')} className="toolbar-btn text-blue-400 hover:text-blue-400" title="حديث">
                <Quote size={16} /> <span>حديث</span>
              </button>
              <button onClick={() => applyFormatting('poetry')} className="toolbar-btn" title="شعر">
                <Music size={16} /> <span>شعر</span>
              </button>
              <button onClick={() => applyFormatting('footnote')} className="toolbar-btn text-amber-500 hover:text-amber-500" title="هامش">
                <MessageSquarePlus size={16} /> <span>هامش</span>
              </button>
              <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
              <button onClick={clearFormatting} className="toolbar-btn text-red-500 hover:bg-red-900/20" title="إزالة التنسيق">
                <Eraser size={16} /> <span>مسح</span>
              </button>
            </div>
          ) : (
             <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-200">{bookTitle ? toHindi(bookTitle) : 'المتن المستخرج'}</span>
                <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Page: {toHindi(pageNumber)}</span>
             </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel} className="text-slate-400 hover:text-white"><X size={16} /></Button>
              <Button variant="primary" size="sm" onClick={handleSave} className="px-5 font-bold"><Save className="w-4 h-4 ml-2" /> حفظ</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="font-bold text-[#c5a059] hover:bg-[#c5a059]/10"><Pencil className="w-4 h-4 ml-2" /> تعديل</Button>
              <Button variant="outline" size="sm" onClick={handleCopy} className="border-slate-700 text-slate-400 hover:text-white hover:border-white">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700" dir="rtl">
        {isEditing ? (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="editor-container w-full h-full min-h-[500px] font-manuscript text-2xl leading-[2.2] text-slate-200 text-justify"
            dangerouslySetInnerHTML={{ __html: deserializeToHtml(localText) }}
          />
        ) : (
          <div className="font-manuscript text-2xl leading-[2.2] whitespace-pre-wrap text-slate-200 text-justify">
            {renderPreview(localText)}
          </div>
        )}
      </div>
    </div>
  );
};
