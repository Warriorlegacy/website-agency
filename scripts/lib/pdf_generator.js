/**
 * scripts/lib/pdf_generator.js
 * Production Zero-Dependency Pure-JS PDF Document Generator
 *
 * Compiles markdown-like text, agency reports, and blueprints into beautiful,
 * standard PDF 1.4 documents with:
 *   - Dark indigo/slate branded executive header banner
 *   - Multi-page pagination (Page X of Y)
 *   - Automatic YAML frontmatter extraction (Title, Subtitle, Author, Date)
 *   - Formatted Headings (H1, H2, H3) with distinct weights & color accents
 *   - Code blocks rendered with Courier monospaced font
 *   - Markdown tables rendered cleanly and legibly
 *   - Automatic word wrapping & bullet point indentation
 *   - Dividing rules & metadata footers
 *
 * Zero external npm dependencies — runs anywhere (Windows, macOS, Linux, GitHub Actions).
 */

function escapePdfText(str = '') {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↳/g, '->')
    .replace(/•/g, '*')
    .replace(/…/g, '...')
    .replace(/[✓✔✅]/g, '[OK]')
    .replace(/[❌✖]/g, '[X]')
    .replace(/[🏆🥇]/g, '[WON]')
    .replace(/[📅🗓]/g, '[CAL]')
    .replace(/[✉📧]/g, '[EMAIL]')
    .replace(/[📞☎]/g, '[CALL]')
    .replace(/[🚀⚡🎨🔍📊💼📄💳]/g, '*')
    .replace(/[^\x20-\x7E]/g, ' '); // Map non-ASCII to safe ASCII
}

/**
 * Clean markdown syntax from display text
 */
function cleanMarkdownText(str = '') {
  return String(str)
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold **text**
    .replace(/__([^_]+)__/g, '$1')     // Bold __text__
    .replace(/\*([^*]+)\*/g, '$1')     // Italic *text*
    .replace(/_([^_]+)_/g, '$1')       // Italic _text_
    .replace(/`([^`]+)`/g, '$1')       // Inline `code`
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); // [text](url) -> text (url)
}

/**
 * Wraps text into lines that do not exceed maxChars
 */
function wrapText(text, maxChars = 88) {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxChars) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Compiles text/markdown into an application/pdf Buffer
 *
 * @param {object} opts
 * @param {string} opts.title - Document title for header banner
 * @param {string} opts.subtitle - Optional subtitle/date
 * @param {string} opts.author - Agency author
 * @param {string} opts.content - Markdown or plain text report body
 * @returns {Buffer}
 */
export function buildPdfDocument(opts = {}) {
  let {
    title = 'Agency Executive Report',
    subtitle = '',
    author = 'Apex AI Web Studio',
    content = ''
  } = opts;

  // Extract YAML frontmatter if present
  let docContent = content;
  if (docContent.trim().startsWith('---')) {
    const parts = docContent.split(/^---$/m);
    if (parts.length >= 3) {
      const frontmatter = parts[1];
      docContent = parts.slice(2).join('---').trim();

      const titleMatch = frontmatter.match(/title:\s*["']?([^"'\n\r]+)["']?/i);
      const subtitleMatch = frontmatter.match(/subtitle:\s*["']?([^"'\n\r]+)["']?/i);
      const authorMatch = frontmatter.match(/author:\s*["']?([^"'\n\r]+)["']?/i);
      const dateMatch = frontmatter.match(/date:\s*["']?([^"'\n\r]+)["']?/i);

      if (titleMatch && title === 'Agency Executive Report') title = titleMatch[1];
      if (subtitleMatch && !subtitle) subtitle = subtitleMatch[1];
      if (authorMatch && author === 'Apex AI Web Studio') author = authorMatch[1];
      if (dateMatch && !subtitle) subtitle = dateMatch[1];
    }
  }

  const pageWidth = 595.28;  // A4 width (points)
  const pageHeight = 841.89; // A4 height (points)
  const margin = 45;
  const usableWidth = pageWidth - (margin * 2);

  const rawLines = docContent.split('\n');
  const processedItems = [];

  let inCodeBlock = false;
  let tableHeaders = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // Code block delimiters
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      const codeWrapped = wrapText(raw, 78);
      codeWrapped.forEach(cLine => {
        processedItems.push({ type: 'code', text: cLine });
      });
      continue;
    }

    if (!trimmed) {
      processedItems.push({ type: 'empty' });
      tableHeaders = null;
      continue;
    }

    // Markdown tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (/^\|[-:\s|]+\|$/.test(trimmed)) {
        continue;
      }
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => cleanMarkdownText(c.trim()));

      if (!tableHeaders) {
        tableHeaders = cells;
        processedItems.push({ type: 'table_header', cells });
      } else {
        processedItems.push({ type: 'table_row', headers: tableHeaders, cells });
      }
      continue;
    } else {
      tableHeaders = null;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      processedItems.push({ type: 'h1', text: cleanMarkdownText(trimmed.replace(/^#\s*/, '')) });
    } else if (trimmed.startsWith('## ')) {
      processedItems.push({ type: 'h2', text: cleanMarkdownText(trimmed.replace(/^##\s*/, '')) });
    } else if (trimmed.startsWith('### ')) {
      processedItems.push({ type: 'h3', text: cleanMarkdownText(trimmed.replace(/^###\s*/, '')) });
    } else if (trimmed.startsWith('#### ')) {
      processedItems.push({ type: 'h3', text: cleanMarkdownText(trimmed.replace(/^####\s*/, '')) });
    } else if (trimmed.startsWith('---') || trimmed.startsWith('━━━')) {
      processedItems.push({ type: 'divider' });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      const bulletText = cleanMarkdownText(trimmed.replace(/^[-*•]\s*/, ''));
      const wrapped = wrapText(bulletText, 82);
      wrapped.forEach((line, idx) => {
        processedItems.push({ type: 'bullet', text: line, isFirst: idx === 0 });
      });
    } else {
      const cleanLine = cleanMarkdownText(trimmed);
      const wrapped = wrapText(cleanLine, 88);
      wrapped.forEach(line => {
        processedItems.push({ type: 'text', text: line });
      });
    }
  }

  // Paginate items based on vertical height
  const pages = [];
  let currentPage = [];
  let currentY = pageHeight - margin - 60;
  const bottomThreshold = margin + 35;

  for (const item of processedItems) {
    let itemHeight = 13;
    if (item.type === 'h1') itemHeight = 26;
    else if (item.type === 'h2') itemHeight = 22;
    else if (item.type === 'h3') itemHeight = 18;
    else if (item.type === 'divider') itemHeight = 14;
    else if (item.type === 'empty') itemHeight = 8;
    else if (item.type === 'code') itemHeight = 12;
    else if (item.type === 'table_header') itemHeight = 18;
    else if (item.type === 'table_row') itemHeight = 16;

    if (currentY - itemHeight < bottomThreshold) {
      pages.push(currentPage);
      currentPage = [];
      currentY = pageHeight - margin - 60;
    }

    currentPage.push(item);
    currentY -= itemHeight;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (pages.length === 0) {
    pages.push([{ type: 'text', text: 'No content provided.' }]);
  }

  const totalPages = pages.length;

  // Build PDF Objects
  const objects = [];
  let objCount = 6; // Catalog, Outlines, PagesTree, FontReg, FontBold, FontCourier

  function addObj(str) {
    objCount++;
    objects.push({ id: objCount, content: str });
    return objCount;
  }

  const catalogId = 1;
  const outlinesId = 2;
  const pagesTreeId = 3;
  const fontRegId = 4;
  const fontBoldId = 5;
  const fontCourierId = 6;

  const pageObjIds = [];

  pages.forEach((pageItems, pageIdx) => {
    let stream = '';

    // 1. Header Banner Box
    stream += `0.06 0.09 0.16 rg\n`; // Slate dark #0f172a
    stream += `${margin} ${pageHeight - 55} ${usableWidth} 28 re f\n`;

    // 2. Header Text
    const truncatedTitle = title.length > 50 ? title.slice(0, 48) + '...' : title;
    stream += `BT\n/F2 11 Tf\n1 1 1 rg\n${margin + 12} ${pageHeight - 44} Td\n(${escapePdfText(truncatedTitle)}) Tj\nET\n`;

    if (subtitle) {
      const truncatedSub = subtitle.length > 40 ? subtitle.slice(0, 38) + '...' : subtitle;
      stream += `BT\n/F1 8 Tf\n0.8 0.8 0.9 rg\n${margin + usableWidth - 180} ${pageHeight - 44} Td\n(${escapePdfText(truncatedSub)}) Tj\nET\n`;
    }

    // 3. Footer
    stream += `0.85 0.88 0.92 RG\n0.5 w\n${margin} 42 m ${margin + usableWidth} 42 l S\n`;
    stream += `BT\n/F1 8 Tf\n0.45 0.45 0.5 rg\n${margin} 30 Td\n(${escapePdfText(author)}  ·  Official Agency Document) Tj\nET\n`;
    stream += `BT\n/F2 8 Tf\n0.3 0.3 0.4 rg\n${margin + usableWidth - 55} 30 Td\n(Page ${pageIdx + 1} of ${totalPages}) Tj\nET\n`;

    // 4. Content Lines
    let textY = pageHeight - margin - 45;

    for (const item of pageItems) {
      if (item.type === 'empty') {
        textY -= 8;
      } else if (item.type === 'divider') {
        textY -= 6;
        stream += `0.9 0.92 0.95 RG\n1 w\n${margin} ${textY} m ${margin + usableWidth} ${textY} l S\n`;
        textY -= 8;
      } else if (item.type === 'h1') {
        textY -= 6;
        stream += `BT\n/F2 14 Tf\n0.05 0.1 0.25 rg\n${margin} ${textY} Td\n(${escapePdfText(item.text)}) Tj\nET\n`;
        textY -= 18;
      } else if (item.type === 'h2') {
        textY -= 4;
        stream += `BT\n/F2 11 Tf\n0.18 0.32 0.58 rg\n${margin} ${textY} Td\n(${escapePdfText(item.text)}) Tj\nET\n`;
        textY -= 15;
      } else if (item.type === 'h3') {
        textY -= 2;
        stream += `BT\n/F2 10 Tf\n0.1 0.15 0.2 rg\n${margin} ${textY} Td\n(${escapePdfText(item.text)}) Tj\nET\n`;
        textY -= 13;
      } else if (item.type === 'bullet') {
        const bulletSymbol = item.isFirst ? 'o ' : '  ';
        const indent = margin + (item.isFirst ? 8 : 18);
        stream += `BT\n/F1 9 Tf\n0.15 0.15 0.2 rg\n${indent} ${textY} Td\n(${escapePdfText((item.isFirst ? bulletSymbol : '') + item.text)}) Tj\nET\n`;
        textY -= 12;
      } else if (item.type === 'code') {
        stream += `BT\n/F3 8 Tf\n0.2 0.25 0.35 rg\n${margin + 12} ${textY} Td\n(${escapePdfText(item.text)}) Tj\nET\n`;
        textY -= 11;
      } else if (item.type === 'table_header') {
        const rowText = item.cells.join('  |  ');
        stream += `BT\n/F2 9 Tf\n0.1 0.15 0.3 rg\n${margin + 6} ${textY} Td\n(${escapePdfText(rowText)}) Tj\nET\n`;
        textY -= 13;
      } else if (item.type === 'table_row') {
        let rowStr = '';
        if (item.cells.length === item.headers?.length) {
          rowStr = item.cells.map((c, idx) => `${item.headers[idx]}: ${c}`).join('  |  ');
        } else {
          rowStr = item.cells.join('  |  ');
        }
        const wrapped = wrapText(rowStr, 84);
        wrapped.forEach((wLine, wIdx) => {
          stream += `BT\n/F1 8.5 Tf\n0.2 0.2 0.25 rg\n${margin + (wIdx === 0 ? 10 : 20)} ${textY} Td\n(${escapePdfText((wIdx === 0 ? '- ' : '') + wLine)}) Tj\nET\n`;
          textY -= 11;
        });
      } else {
        stream += `BT\n/F1 9 Tf\n0.15 0.15 0.2 rg\n${margin} ${textY} Td\n(${escapePdfText(item.text)}) Tj\nET\n`;
        textY -= 12;
      }
    }

    const streamObjId = addObj(`<< /Length ${Buffer.byteLength(stream, 'utf-8')} >>\nstream\n${stream}\nendstream`);
    const pageObjId = addObj(`<<
  /Type /Page
  /Parent ${pagesTreeId} 0 R
  /MediaBox [0 0 ${pageWidth} ${pageHeight}]
  /Contents ${streamObjId} 0 R
  /Resources <<
    /Font <<
      /F1 ${fontRegId} 0 R
      /F2 ${fontBoldId} 0 R
      /F3 ${fontCourierId} 0 R
    >>
  >>
>>`);
    pageObjIds.push(pageObjId);
  });

  const fullObjects = [
    { id: catalogId, content: `<< /Type /Catalog /Pages ${pagesTreeId} 0 R >>` },
    { id: outlinesId, content: `<< /Type /Outlines /Count 0 >>` },
    { id: pagesTreeId, content: `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>` },
    { id: fontRegId, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>` },
    { id: fontBoldId, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>` },
    { id: fontCourierId, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>` },
    ...objects
  ];

  fullObjects.sort((a, b) => a.id - b.id);

  let pdf = `%PDF-1.4\n%âãÏÓ\n`;
  const xrefOffsets = [];

  for (const obj of fullObjects) {
    xrefOffsets[obj.id] = Buffer.byteLength(pdf, 'utf-8');
    pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  }

  const startxref = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${fullObjects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= fullObjects.length; i++) {
    const off = String(xrefOffsets[i] || 0).padStart(10, '0');
    pdf += `${off} 00000 n \n`;
  }

  pdf += `trailer\n<<\n  /Size ${fullObjects.length + 1}\n  /Root ${catalogId} 0 R\n  /Info << /Title (${escapePdfText(title)}) /Author (${escapePdfText(author)}) >>\n>>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, 'binary');
}
