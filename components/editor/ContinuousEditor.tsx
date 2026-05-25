import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { 
  AyaMark, HadithMark, CustomBoldMark, 
  PoetryNode, CenterNode, PageBreakNode, FootnoteMark 
} from './CustomExtensions';
import { deserializeToTiptap } from './EditorUtils';
import { PageData } from '../../types';

interface ContinuousEditorProps {
  pages: PageData[];
  onChange?: (html: string) => void;
  onActivePageChange?: (pageNumber: number) => void;
  readOnly?: boolean;
}

export const ContinuousEditor: React.FC<ContinuousEditorProps> = ({ 
  pages, onChange, onActivePageChange, readOnly = false 
}) => {

  // BUG #21 fix: keep a ref to the latest onChange so the useEditor closure never goes stale
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // BUG #7 fix: track which pages were last loaded into the editor
  const lastLoadedPagesRef = useRef<string>('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable conflicting default marks/nodes explicitly
        bold: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      AyaMark,
      HadithMark,
      CustomBoldMark,
      PoetryNode,
      CenterNode,
      FootnoteMark,
      PageBreakNode,
    ],
    content: '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getHTML());
    },
  });

  useEffect(() => {
    // BUG #7 fix: reload content when editor is empty OR when pages changed externally
    if (editor && pages) {
      const pagesJson = JSON.stringify(pages.map(p => ({ id: p.id, text: p.text })));
      if (editor.isEmpty || lastLoadedPagesRef.current !== pagesJson) {
        lastLoadedPagesRef.current = pagesJson;
        let concatenatedHTML = '';
        pages.forEach((page, idx) => {
           const pageHtml = deserializeToTiptap(page.text, page.pageNumber, page.id);
           concatenatedHTML += pageHtml;
           
           // Insert page divider between pages
           if (idx < pages.length - 1) {
               const nextPage = pages[idx + 1];
               concatenatedHTML += `<div class="page-break" data-page-number="${nextPage.pageNumber}" data-page-id="${nextPage.id}"></div>`;
           }
        });
        editor.commands.setContent(concatenatedHTML);
      }
    }
  }, [editor, pages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (!onActivePageChange) return;
      const container = e.currentTarget;
      const breaks = container.querySelectorAll('.page-break');
      
      let currentVisiblePage = pages[0]?.pageNumber || 1;
      
      // Find the last page break that is ABOVE the scroll top (offset by a margin)
      const offset = 200; // pixels from top to consider a new page
      breaks.forEach((b) => {
          const rect = b.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (rect.top - containerRect.top < offset) {
              const num = parseInt(b.getAttribute('data-page-number') || '1');
              if (!isNaN(num)) {
                  currentVisiblePage = num;
              }
          }
      });
      
      onActivePageChange(currentVisiblePage);
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
      {/* TOOLBAR */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-slate-900/90 backdrop-blur-md border-b border-white/5 shadow-md sticky top-0 z-40">
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-[#c5a059] text-slate-900 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                ع1
            </button>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-slate-600 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                ع2
            </button>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-slate-600 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                ع3
            </button>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('heading', { level: 4 }) ? 'bg-slate-600 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                ع4
            </button>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('heading', { level: 5 }) ? 'bg-slate-600 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                ع5
            </button>
            <div className="w-[1px] h-6 bg-slate-700 mx-2"></div>
            <button
                onClick={() => editor.chain().focus().toggleMark('customBold').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('customBold') ? 'bg-white text-slate-900 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                غامق
            </button>
            <button
                onClick={() => editor.chain().focus().toggleNode('centerNode', 'paragraph').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('centerNode') ? 'bg-slate-600 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                توسيط
            </button>
            <div className="w-[1px] h-6 bg-slate-700 mx-2"></div>
            <button
                onClick={() => editor.chain().focus().toggleMark('aya').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('aya') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-inner' : 'text-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
            >
                آية
            </button>
            <button
                onClick={() => editor.chain().focus().toggleMark('hadith').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('hadith') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-inner' : 'text-blue-500/60 hover:text-blue-400 hover:bg-blue-500/10'}`}
            >
                حديث
            </button>
            <button
                onClick={() => editor.chain().focus().toggleNode('poetry', 'paragraph').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('poetry') ? 'bg-slate-700 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
                شعر
            </button>
            <button
                onClick={() => editor.chain().focus().toggleMark('footnote').run()}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${editor.isActive('footnote') ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50 shadow-inner' : 'text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10'}`}
            >
                هامش
            </button>
        </div>
      )}

      {/* EDITOR CONTENT AREA */}
      <div 
         id="tiptap-scroll-container" 
         className="flex-1 overflow-y-auto w-full scroll-smooth scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900" 
         dir="rtl"
         onScroll={handleScroll}
      >
          <style>{`
             .ProseMirror { outline: none; min-height: 100%; font-family: 'Amiri', serif; font-size: 1.8rem; line-height: 2.2; text-align: justify; color: #e2e8f0; padding: 3rem; }
             .ProseMirror p { margin-bottom: 1rem; }
             /* Custom Mark/Node Styles */
             .editor-aya { color: #10b981; background-color: rgba(16, 185, 129, 0.1); border-bottom: 2px solid #059669; padding: 0 4px; border-radius: 4px; }
             .editor-hadith { color: #60a5fa; background-color: rgba(96, 165, 250, 0.1); border-bottom: 2px solid #2563eb; padding: 0 4px; border-radius: 4px; }
             .editor-poetry { display: block; text-align: center; font-style: italic; background-color: rgba(30, 41, 59, 0.5); border-right: 4px solid #475569; border-left: 4px solid #475569; border-radius: 12px; padding: 1rem; margin: 2rem auto; width: 85%; }
             .editor-center { display: block; text-align: center; font-weight: bold; margin: 1.5rem 0; }
             .editor-footnote { font-size: 1.2rem; color: #94a3b8; font-family: 'Cairo', sans-serif; font-style: italic; background: rgba(0,0,0,0.2); padding: 0.1rem 0.5rem; border-radius: 4px; }
             .editor-bold { font-weight: 800; color: #fff; }
             
             /* Headings */
             .ProseMirror h1 { display: block; font-size: 2.5rem; font-weight: 800; color: #f1f5f9; margin: 2rem 0 1rem; border-right: 6px solid #c5a059; padding-right: 1.5rem; }
             .ProseMirror h2 { display: block; font-size: 1.8rem; font-weight: 700; color: #e2e8f0; margin: 1.5rem 0 0.8rem; border-right: 4px solid #94a3b8; padding-right: 1rem; }
             .ProseMirror h3 { display: block; font-size: 1.4rem; font-weight: 700; color: #cbd5e1; margin: 1.2rem 0 0.5rem; border-right: 2px solid #64748b; padding-right: 0.75rem; }
             .ProseMirror h4 { display: block; font-size: 1.2rem; font-weight: 700; color: #94a3b8; margin: 1rem 0 0.5rem; border-right: 2px solid #475569; padding-right: 0.5rem; }
             .ProseMirror h5 { display: block; font-size: 1rem; font-weight: 700; color: #64748b; margin: 0.8rem 0 0.5rem; border-right: 2px solid #334155; padding-right: 0.5rem; }

             /* Selections */
             .ProseMirror ::selection { background: rgba(197, 160, 89, 0.3); color: #fff; }
          `}</style>
          
          <EditorContent editor={editor} className="max-w-4xl mx-auto min-h-full pb-64" />
      </div>
    </div>
  );
};
