/**
 * exportDocx.ts — Arabic OCR → Word (.docx)
 *
 * INLINE vs BLOCK tags:
 *  Block  (own paragraph): h1, h2, h3, center, poetry
 *  Inline (styled TextRun): aya, hadith, bold   ← these stay inside their paragraph
 *
 * FOOTNOTE STRATEGY (no duplicate-ID corruption):
 *  Pass 1 – collect <footnote>N: text</footnote> → globally sequential docx IDs
 *  Pass 2 – [N] in body text → FootnoteReferenceRun with the correct unique ID
 */

import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, AlignmentType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, FootnoteReferenceRun,
} from 'docx';

// ── Constants ─────────────────────────────────────────────────────────────────
const ARABIC_FONT = 'Traditional Arabic';
const LATIN_FONT  = 'Arial';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DocxOptions { bookTitle?: string; pageNumber?: number; }
interface RunOpts    { bold?: boolean; size?: number; color?: string; italics?: boolean; }

// Block-level types only (inline types are handled inside buildRuns)
type BlockType = 'h1' | 'h2' | 'h3' | 'center' | 'poetry' | 'text';
interface Block { type: BlockType; text: string; }

// ── Arabic TextRun helper ─────────────────────────────────────────────────────
function ar(text: string, o: RunOpts = {}): TextRun {
  return new TextRun({
    text, bold: o.bold, italics: o.italics,
    size: o.size ?? 24, color: o.color,
    font: ARABIC_FONT, rightToLeft: true,
  });
}

// ── Pass 1: extract footnotes, assign globally-unique sequential IDs ──────────
function extractFootnotes(raw: string): {
  footnoteMap: Record<number, { children: Paragraph[] }>;
  ocrToDocxIds: Map<number, number[]>;
  cleanedText: string;
} {
  const footnoteMap: Record<number, { children: Paragraph[] }> = {};
  const ocrToDocxIds = new Map<number, number[]>();
  let nextId = 1;

  const cleanedText = raw.replace(/<footnote>([\s\S]*?)<\/footnote>/gi, (_m, body) => {
    const colon = body.indexOf(':');
    if (colon === -1) return '';
    const ocrNum = parseInt(body.slice(0, colon).trim(), 10);
    if (isNaN(ocrNum)) return '';
    const content = body.slice(colon + 1).replace(/\n+/g, ' ').trim();

    const docxId = nextId++;
    if (!ocrToDocxIds.has(ocrNum)) ocrToDocxIds.set(ocrNum, []);
    ocrToDocxIds.get(ocrNum)!.push(docxId);

    footnoteMap[docxId] = {
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [ar(content, { size: 20 })],
      })],
    };
    return '';
  });

  return { footnoteMap, ocrToDocxIds, cleanedText };
}

// ── Pass 2: build runs — handles INLINE tags + footnote refs ─────────────────
/**
 * Splits a text string on inline tokens:
 *   <aya>…</aya>    → green TextRun  (inline Quranic verse)
 *   <hadith>…</hadith> → blue TextRun (inline hadith)
 *   <bold>…</bold>  → bold TextRun   (inline bold)
 *   [N]             → FootnoteReferenceRun with unique docx ID
 * Everything else → plain Arabic TextRun with the given opts.
 */
function buildRuns(
  text: string,
  opts: RunOpts,
  ocrToDocxIds: Map<number, number[]>,
  usedCounts: Map<number, number>,
): (TextRun | FootnoteReferenceRun)[] {
  // Capture delimiter: any inline tag or [N]
  const INLINE = /(<aya>[\s\S]*?<\/aya>|<hadith>[\s\S]*?<\/hadith>|<bold>[\s\S]*?<\/bold>|\[\d+\])/gi;

  return text.split(INLINE).flatMap((part): (TextRun | FootnoteReferenceRun)[] => {
    if (!part) return [];

    // Footnote reference [N]
    const fnRef = part.match(/^\[(\d+)\]$/);
    if (fnRef) {
      const ocrNum = parseInt(fnRef[1], 10);
      const ids = ocrToDocxIds.get(ocrNum);
      if (ids && ids.length > 0) {
        const count = usedCounts.get(ocrNum) ?? 0;
        usedCounts.set(ocrNum, count + 1);
        return [new FootnoteReferenceRun(ids[count % ids.length])];
      }
      return [ar(part, opts)]; // unknown ref → plain text
    }

    // Quranic verse — inline, green
    const ayaMatch = part.match(/^<aya>([\s\S]*?)<\/aya>$/i);
    if (ayaMatch) {
      return [ar(ayaMatch[1].replace(/\n+/g, ' '), { size: opts.size ?? 24, color: '1A6B40' })];
    }

    // Hadith — inline, blue
    const hadithMatch = part.match(/^<hadith>([\s\S]*?)<\/hadith>$/i);
    if (hadithMatch) {
      return [ar(hadithMatch[1].replace(/\n+/g, ' '), { size: opts.size ?? 24, color: '1E5A9C' })];
    }

    // Bold — inline
    const boldMatch = part.match(/^<bold>([\s\S]*?)<\/bold>$/i);
    if (boldMatch) {
      return [ar(boldMatch[1].replace(/\n+/g, ' '), { ...opts, bold: true })];
    }

    // Plain text
    return [ar(part, opts)];
  });
}

// ── Parse body into block-level segments ──────────────────────────────────────
/**
 * Only BLOCK-level tags become separate paragraphs.
 * Inline tags (aya, hadith, bold) remain embedded in their surrounding text.
 */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Only true block-level tags
  const TAG = /<(h1|h2|h3|center|poetry)>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = TAG.exec(text)) !== null) {
    // Text (possibly containing inline tags) before this block tag
    const before = text.slice(last, m.index);
    before.split(/\n/).forEach(l => {
      const t = l.trim();
      if (t) blocks.push({ type: 'text', text: t });
    });

    const tag     = m[1].toLowerCase() as BlockType;
    const content = m[2].replace(/\n+/g, ' ').trim();
    if (content) blocks.push({ type: tag, text: content });

    last = TAG.lastIndex;
  }

  // Trailing text
  text.slice(last).split(/\n/).forEach(l => {
    const t = l.trim();
    if (t) blocks.push({ type: 'text', text: t });
  });

  return blocks;
}

// ── Block → Paragraph ─────────────────────────────────────────────────────────
function toParagraph(
  block: Block,
  ocrToDocxIds: Map<number, number[]>,
  usedCounts: Map<number, number>,
): Paragraph {
  const runs = (o: RunOpts) => buildRuns(block.text, o, ocrToDocxIds, usedCounts);

  switch (block.type) {
    case 'h1': return new Paragraph({
      heading: HeadingLevel.HEADING_1, alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 120 },
      border: { right: { style: BorderStyle.SINGLE, size: 12, color: 'B8860B', space: 8 } },
      children: runs({ bold: true, size: 40 }),
    });
    case 'h2': return new Paragraph({
      heading: HeadingLevel.HEADING_2, alignment: AlignmentType.RIGHT,
      spacing: { before: 160, after: 100 },
      border: { right: { style: BorderStyle.SINGLE, size: 8, color: '94a3b8', space: 6 } },
      children: runs({ bold: true, size: 32 }),
    });
    case 'h3': return new Paragraph({
      heading: HeadingLevel.HEADING_3, alignment: AlignmentType.RIGHT,
      spacing: { before: 120, after: 80 },
      border: { right: { style: BorderStyle.SINGLE, size: 4, color: '64748b', space: 4 } },
      children: runs({ bold: true, size: 28 }),
    });
    case 'center': return new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80, line: 360 },
      children: runs({ bold: true, size: 26 }),
    });
    case 'poetry': return new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120, line: 400 },
      border: {
        left:  { style: BorderStyle.SINGLE, size: 6, color: '708090', space: 6 },
        right: { style: BorderStyle.SINGLE, size: 6, color: '708090', space: 6 },
      },
      shading: { type: ShadingType.CLEAR, fill: 'F5F5F0', color: 'auto' },
      children: runs({ italics: true, size: 26 }),
    });
    default: return new Paragraph({  // 'text' — may contain inline aya/hadith/bold
      alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 80, line: 360 },
      children: runs({ size: 24 }),
    });
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildDocxBlob(ocrText: string, options: DocxOptions = {}): Promise<Blob> {
  const { bookTitle = 'نتيجة التعرف الضوئي', pageNumber } = options;

  // Normalise Eastern Arabic digits → Western
  const normalised = ocrText.replace(/[٠-٩]/g, d =>
    '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]
  );

  // Pass 1 — extract real Word footnotes
  const { footnoteMap, ocrToDocxIds, cleanedText } = extractFootnotes(normalised);

  // Pass 2 — parse blocks; usedCounts is shared so each [N] gets its unique ID
  const usedCounts = new Map<number, number>();
  const children   = parseBlocks(cleanedText).map(b => toParagraph(b, ocrToDocxIds, usedCounts));

  const docTitle = `${bookTitle}${pageNumber !== undefined ? ` - صفحة ${pageNumber}` : ''}`;

  const doc = new Document({
    footnotes: footnoteMap,
    styles: {
      default: {
        document: {
          run:       { font: ARABIC_FONT, size: 24, rightToLeft: true },
          paragraph: { alignment: AlignmentType.RIGHT },
        },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 40, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 200, after: 120 }, alignment: AlignmentType.RIGHT, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 160, after: 100 }, alignment: AlignmentType.RIGHT, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 120, after: 80 }, alignment: AlignmentType.RIGHT, outlineLevel: 2 } },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1800, bottom: 1440, left: 1800 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8860B', space: 4 } },
          children: [new TextRun({ text: docTitle, font: ARABIC_FONT, size: 18, color: '888888', rightToLeft: true })],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: LATIN_FONT, size: 18, color: '888888' })],
        })] }),
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}

export async function downloadAsDocx(ocrText: string, options: DocxOptions = {}): Promise<void> {
  const blob = await buildDocxBlob(ocrText, options);
  const url  = URL.createObjectURL(blob);
  const safe = (options.bookTitle ?? 'ocr').replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF_-]/g, '');
  const page = options.pageNumber !== undefined ? `_p${options.pageNumber}` : '';
  const a    = document.createElement('a');
  a.href = url; a.download = `${safe}${page}.docx`; a.click();
  URL.revokeObjectURL(url);
}
