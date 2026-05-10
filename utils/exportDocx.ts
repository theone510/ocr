/**
 * exportDocx.ts — Arabic OCR → Word (.docx)
 *
 * FOOTNOTE STRATEGY (fixes duplicate-ID corruption):
 *  Pass 1 – scan for ALL <footnote>N: text</footnote> tags in order of
 *            appearance, assign each a globally unique sequential docx ID
 *            (1, 2, 3 …), strip them from the body text.
 *  Pass 2 – scan body text for [N] refs; each occurrence of [N] gets the
 *            NEXT unused docx ID that was mapped to OCR number N.
 *            This means two pages both having [1] produce two distinct
 *            footnote IDs (never the same), which Word accepts.
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
interface RunOpts { bold?: boolean; size?: number; color?: string; italics?: boolean; }
type BlockType = 'h1'|'h2'|'h3'|'center'|'bold'|'aya'|'hadith'|'poetry'|'text';
interface Block { type: BlockType; text: string; }

// ── Helper: Arabic TextRun ────────────────────────────────────────────────────
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
  ocrToDocxIds: Map<number, number[]>; // ocrNum → [docxId, docxId, …]
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

// ── Pass 2: build runs, mapping each [N] occurrence to its unique docxId ──────
function buildRuns(
  text: string,
  opts: RunOpts,
  ocrToDocxIds: Map<number, number[]>,
  usedCounts: Map<number, number>,        // mutated: tracks how many [N] we've seen
): (TextRun | FootnoteReferenceRun)[] {
  return text.split(/(\[\d+\])/g).flatMap((part): (TextRun | FootnoteReferenceRun)[] => {
    if (!part) return [];
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const ocrNum = parseInt(m[1], 10);
      const ids = ocrToDocxIds.get(ocrNum);
      if (ids && ids.length > 0) {
        const count = usedCounts.get(ocrNum) ?? 0;
        const docxId = ids[count % ids.length]; // cycle safely
        usedCounts.set(ocrNum, count + 1);
        return [new FootnoteReferenceRun(docxId)];
      }
    }
    return [ar(part, opts)];
  });
}

// ── Parse body blocks ─────────────────────────────────────────────────────────
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const TAG = /<(h1|h2|h3|center|bold|aya|hadith|poetry)>([\s\S]*?)<\/\1>/gi;
  let last = 0, m: RegExpExecArray | null;

  while ((m = TAG.exec(text)) !== null) {
    text.slice(last, m.index).trim().split(/\n/).forEach(l => {
      const t = l.trim(); if (t) blocks.push({ type: 'text', text: t });
    });
    const content = m[2].replace(/\n+/g, ' ').trim();
    if (content) blocks.push({ type: m[1].toLowerCase() as BlockType, text: content });
    last = TAG.lastIndex;
  }
  text.slice(last).trim().split(/\n/).forEach(l => {
    const t = l.trim(); if (t) blocks.push({ type: 'text', text: t });
  });
  return blocks;
}

// ── Block → Paragraph ─────────────────────────────────────────────────────────
function toParagraph(
  block: Block,
  ocrToDocxIds: Map<number, number[]>,
  usedCounts: Map<number, number>,
): Paragraph {
  const runs = (opts: RunOpts) => buildRuns(block.text, opts, ocrToDocxIds, usedCounts);

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
    case 'aya': return new Paragraph({
      alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 80, line: 380 },
      shading: { type: ShadingType.CLEAR, fill: 'E8F8F0', color: 'auto' },
      border: { right: { style: BorderStyle.SINGLE, size: 8, color: '2E8B57', space: 6 } },
      children: runs({ size: 24, color: '1A6B40' }),
    });
    case 'hadith': return new Paragraph({
      alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 80, line: 380 },
      shading: { type: ShadingType.CLEAR, fill: 'EEF4FB', color: 'auto' },
      border: { right: { style: BorderStyle.SINGLE, size: 8, color: '1E5A9C', space: 6 } },
      children: runs({ size: 24, color: '1E5A9C' }),
    });
    case 'bold': return new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 80, line: 360 },
      children: runs({ bold: true, size: 24 }),
    });
    default: return new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 80, line: 360 },
      children: runs({ size: 24 }),
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function buildDocxBlob(ocrText: string, options: DocxOptions = {}): Promise<Blob> {
  const { bookTitle = 'نتيجة التعرف الضوئي', pageNumber } = options;

  // Normalise Eastern Arabic digits → Western
  const normalised = ocrText.replace(/[٠-٩]/g, d =>
    '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]
  );

  // Pass 1 — extract footnotes
  const { footnoteMap, ocrToDocxIds, cleanedText } = extractFootnotes(normalised);

  // Pass 2 — parse blocks; usedCounts is shared across all blocks
  const usedCounts = new Map<number, number>();
  const children = parseBlocks(cleanedText).map(b => toParagraph(b, ocrToDocxIds, usedCounts));

  const docTitle = `${bookTitle}${pageNumber !== undefined ? ` - صفحة ${pageNumber}` : ''}`;

  const doc = new Document({
    footnotes: footnoteMap,
    styles: {
      default: {
        document: { run: { font: ARABIC_FONT, size: 24, rightToLeft: true }, paragraph: { alignment: AlignmentType.RIGHT } },
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
  const a = document.createElement('a');
  a.href = url; a.download = `${safe}${page}.docx`; a.click();
  URL.revokeObjectURL(url);
}
