import { Mark, Node, mergeAttributes, RawCommands } from '@tiptap/core';

// --- MARKS (Inline Elements) ---

export const AyaMark = Mark.create({
  name: 'aya',
  parseHTML() {
    return [{ tag: 'span.viewer-aya' }, { tag: 'aya' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'viewer-aya editor-aya' }), 0];
  },
});

export const HadithMark = Mark.create({
  name: 'hadith',
  parseHTML() {
    return [{ tag: 'span.viewer-hadith' }, { tag: 'hadith' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'viewer-hadith editor-hadith' }), 0];
  },
});

export const CustomBoldMark = Mark.create({
  name: 'customBold',
  parseHTML() {
    return [{ tag: 'span.viewer-bold' }, { tag: 'bold' }, { tag: 'b' }, { tag: 'strong' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'viewer-bold editor-bold font-bold' }), 0];
  },
});

export const FootnoteMark = Mark.create({
  name: 'footnote',
  parseHTML() {
    return [{ tag: 'span.viewer-footnote' }, { tag: 'footnote' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'viewer-footnote editor-footnote text-[#c5a059]' }), 0];
  },
});


// --- NODES (Block Elements) ---

export const PoetryNode = Node.create({
  name: 'poetry',
  group: 'block',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'div.viewer-poetry' }, { tag: 'poetry' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'viewer-poetry editor-poetry text-center italic bg-slate-800/50 p-4 rounded-lg border-x-4 border-slate-600 my-4' }), 0];
  },
  addCommands() {
    return {
      setPoetry: () => ({ commands }: { commands: RawCommands }) => commands.setNode('poetry'),
      togglePoetry: () => ({ commands }: { commands: RawCommands }) => commands.toggleNode('poetry', 'paragraph'),
    } as unknown as Partial<RawCommands>;
  },
});

export const CenterNode = Node.create({
  name: 'centerNode',
  group: 'block',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'div.viewer-center' }, { tag: 'center' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'viewer-center editor-center text-center font-bold my-4' }), 0];
  },
  addCommands() {
    return {
      setCenterNode: () => ({ commands }: { commands: RawCommands }) => commands.setNode('centerNode'),
      toggleCenterNode: () => ({ commands }: { commands: RawCommands }) => commands.toggleNode('centerNode', 'paragraph'),
    } as unknown as Partial<RawCommands>;
  },
});

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false, // Prevents easy deletion by selecting
  draggable: false,

  addAttributes() {
    return {
      pageNumber: { default: null },
      pageId: { default: null },
      pageTitle: { default: null }, // Optional for TOC
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.page-break',
        getAttrs: (node) => {
          if (typeof node === 'string') return {};
          return {
            pageNumber: node.getAttribute('data-page-number'),
            pageId: node.getAttribute('data-page-id'),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div', 
      mergeAttributes(HTMLAttributes, { 
        class: 'page-break my-8 select-none',
        'data-page-number': HTMLAttributes.pageNumber,
        'data-page-id': HTMLAttributes.pageId,
        contenteditable: 'false' 
      }),
      ['div', { class: 'relative flex items-center py-5' },
        ['div', { class: 'flex-grow border-t-2 border-dashed border-[#c5a059]/40' }],
        ['span', { class: 'flex-shrink-0 mx-4 text-[#c5a059] font-mono font-bold bg-slate-900 px-4 rounded-full border border-[#c5a059]/30 shadow-[0_0_15px_rgba(197,160,89,0.1)]' }, `صفحة ${HTMLAttributes.pageNumber}`],
        ['div', { class: 'flex-grow border-t-2 border-dashed border-[#c5a059]/40' }]
      ]
    ];
  },
});
