import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';

interface DocumentData {
  title: string;
  content: string;
}

// Black color for all text
const BLACK_COLOR = '000000';

// Generate DOCX file from document content
export async function generateDocx(doc: DocumentData): Promise<Blob> {
  // Parse content and create paragraphs
  const paragraphs = parseContentToParagraphs(doc.content);
  
  const document = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          children: [new TextRun({ text: doc.title, bold: true, size: 32, color: BLACK_COLOR })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        // Content paragraphs
        ...paragraphs,
      ],
    }],
  });

  return await Packer.toBlob(document);
}

function parseContentToParagraphs(content: string): Paragraph[] {
  if (!content) {
    return [new Paragraph({ children: [new TextRun({ text: 'Содержимое документа', color: BLACK_COLOR })] })];
  }

  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      // Empty line - add spacing
      paragraphs.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      continue;
    }

    // Check for headers
    if (trimmedLine.match(/^#+\s/)) {
      const level = trimmedLine.match(/^#+/)?.[0].length || 1;
      const text = trimmedLine.replace(/^#+\s/, '');
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text, bold: true, color: BLACK_COLOR, size: level === 1 ? 28 : level === 2 ? 24 : 22 })],
        spacing: { before: 200, after: 100 },
      }));
      continue;
    }

    // Check for list items
    if (trimmedLine.match(/^[-*]\s/) || trimmedLine.match(/^\d+\.\s/)) {
      const text = trimmedLine.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: '• ' + text, color: BLACK_COLOR })],
        spacing: { after: 100 },
        indent: { left: 720 }, // 0.5 inch
      }));
      continue;
    }

    // Regular paragraph
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: trimmedLine, color: BLACK_COLOR })],
      spacing: { after: 200 },
    }));
  }

  return paragraphs;
}

// Generate legal document with proper formatting
export async function generateLegalDocument(
  title: string,
  sections: { heading?: string; content: string }[]
): Promise<Blob> {
  const children: Paragraph[] = [
    // Title
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32, color: BLACK_COLOR })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];

  for (const section of sections) {
    if (section.heading) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.heading, bold: true, size: 24, color: BLACK_COLOR })],
        spacing: { before: 300, after: 200 },
      }));
    }

    const lines = section.content.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.trim(), color: BLACK_COLOR })],
          spacing: { after: 150 },
        }));
      }
    }
  }

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBlob(document);
}

// Download blob as file
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

