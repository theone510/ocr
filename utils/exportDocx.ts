/**
 * exportDocx.ts
 * Converts OCR tagged text (h1/h2/h3, bold, aya, hadith, poetry, footnote, center)
 * into a fully-formatted Arabic (.docx) Word document using the `docx` library.
 *
 * Arabic / RTL support:
 *  - Page direction set to RTL at section level
 *  - Every paragraph marked with bidirectional flag
 *  - Uses "Traditional Arabic" font for proper rendering
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
} from 'docx';

// ── Types ────────────────────────────────────────────────────────────────────

interface DocxOptions {
  bookTitle?: string;
  pageNumber?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ARABIC_FONT = 'Traditional Arabic';
const FALLBACK_FONT = 'Arial';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap text in a right-to-left TextRun with Arabic font */
function arabicRun(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    italics?: boolean;
  } = {}
): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    size: opts.size ?? 24,
    color: opts.color,
    font: ARABIC_FONT,
    rightToLeft: true,
  });
}

// ── Tag-based content parser ─────────────────────────────────────────────────

type BlockType =
  | 'h1' | 'h2' | 'h3'
  | 'center' | 'bold'
  | 'aya' | 'hadith'
  | 'poetry' | 'footnote'
  | 'text';

interface ParsedBlock {
  type: BlockType;
  text: string;
}

/**
 * Parses the custom OCR tag format into an ordered list of typed blocks.
 */
function parseOcrText(raw: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const TAG_RE =
    /<(h1|h2|h3|center|bold|aya|hadith|poetry|footnote)>([\s\S]*?)<\/\1>/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim();
    if (before) {
      before.split(/\n/).forEach(line => {
        const t = line.trim();
        if (t) blocks.push({ type: 'text', text: t });
      });
    }

    const tag = match[1].toLowerCase() as BlockType;
    const content = match[2].replace(/\n+/g, ' ').trim();
    if (content) blocks.push({ type: tag, text: content });

    lastIndex = TAG_RE.lastIndex;
  }

  const trailing = raw.slice(lastIndex).trim();
  if (trailing) {
    trailing.split(/\n/).forEach(line => {
      const t = line.trim();
      if (t) blocks.push({ type: 'text', text: t });
    });
  }

  return blocks;
}

// ── Block → Paragraph converters ─────────────────────────────────────────────

function makeHeading(text: string, level: 1 | 2 | 3): Paragraph {
  const sizes: Record<number, number> = { 1: 40, 2: 32, 3: 28 };
  const levelMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: levelMap[level],
    alignment: AlignmentType.RIGHT,
    spacing: { before: 200, after: 120 },
    border: {
      right: { style: BorderStyle.SINGLE, size: 12, color: 'B8860B', space: 8 },
    },
    children: [arabicRun(text, { bold: true, size: sizes[level] })],
  });
}

function makeCenter(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80, line: 360 },
    children: [arabicRun(text, { bold: true, size: 26 })],
  });
}

function makePoetry(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120, line: 400 },
    border: {
      left:  { style: BorderStyle.SINGLE, size: 6, color: '708090', space: 6 },
      right: { style: BorderStyle.SINGLE, size: 6, color: '708090', space: 6 },
    },
    shading: { type: ShadingType.CLEAR, fill: 'F5F5F0', color: 'auto' },
    children: [arabicRun(text, { italics: true, size: 26 })],
  });
}

function makeAya(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 80, after: 80, line: 380 },
    shading: { type: ShadingType.CLEAR, fill: 'E8F8F0', color: 'auto' },
    border: {
      right: { style: BorderStyle.SINGLE, size: 8, color: '2E8B57', space: 6 },
    },
    children: [arabicRun(text, { size: 24, color: '1A6B40' })],
  });
}

function makeHadith(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 80, after: 80, line: 380 },
    shading: { type: ShadingType.CLEAR, fill: 'EEF4FB', color: 'auto' },
    border: {
      right: { style: BorderStyle.SINGLE, size: 8, color: '1E5A9C', space: 6 },
    },
    children: [arabicRun(text, { size: 24, color: '1E5A9C' })],
  });
}

function makeFootnote(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60, after: 60, line: 320 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 4 },
    },
    children: [arabicRun(text, { size: 18, color: '666666', italics: true })],
  });
}

function makeBold(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 80, after: 80, line: 360 },
    children: [arabicRun(text, { bold: true, size: 24 })],
  });
}

function makeText(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 80, after: 80, line: 360 },
    children: [arabicRun(text)],
  });
}

function blockToParagraph(block: ParsedBlock): Paragraph {
  switch (block.type) {
    case 'h1':       return makeHeading(block.text, 1);
    case 'h2':       return makeHeading(block.text, 2);
    case 'h3':       return makeHeading(block.text, 3);
    case 'center':   return makeCenter(block.text);
    case 'poetry':   return makePoetry(block.text);
    case 'aya':      return makeAya(block.text);
    case 'hadith':   return makeHadith(block.text);
    case 'footnote': return makeFootnote(block.text);
    case 'bold':     return makeBold(block.text);
    default:         return makeText(block.text);
  }
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Converts OCR tagged text to a .docx Blob.
 */
export async function buildDocxBlob(
  ocrText: string,
  options: DocxOptions = {}
): Promise<Blob> {
  const { bookTitle = 'نتيجة التعرف الضوئي', pageNumber } = options;

  // Convert Eastern Arabic digits to Western before writing
  const normalizedText = ocrText.replace(/[٠-٩]/g, d =>
    '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]
  );

  const blocks = parseOcrText(normalizedText);
  const children: Paragraph[] = blocks.map(blockToParagraph);

  const pageLabel = pageNumber !== undefined ? ` - صفحة ${pageNumber}` : '';
  const docTitle = `${bookTitle}${pageLabel}`;

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: ARABIC_FONT, size: 24, rightToLeft: true },
          paragraph: { alignment: AlignmentType.RIGHT },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 40, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 200, after: 120 }, alignment: AlignmentType.RIGHT, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 160, after: 100 }, alignment: AlignmentType.RIGHT, outlineLevel: 1 },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: ARABIC_FONT },
          paragraph: { spacing: { before: 120, after: 80 }, alignment: AlignmentType.RIGHT, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1800, bottom: 1440, left: 1800 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8860B', space: 4 },
                },
                children: [
                  new TextRun({
                    text: docTitle,
                    font: ARABIC_FONT,
                    size: 18,
                    color: '888888',
                    rightToLeft: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FALLBACK_FONT,
                    size: 18,
                    color: '888888',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Triggers a browser file download of the generated .docx.
 */
export async function downloadAsDocx(
  ocrText: string,
  options: DocxOptions = {}
): Promise<void> {
  const blob = await buildDocxBlob(ocrText, options);
  const url = URL.createObjectURL(blob);

  const safeTitle = (options.bookTitle ?? 'ocr-result')
    .replace(/\s+/g, '_')
    .replace(/[^\w\u0600-\u06FF_-]/g, '');
  const pageStr = options.pageNumber !== undefined ? `_p${options.pageNumber}` : '';
  const filename = `${safeTitle}${pageStr}.docx`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
