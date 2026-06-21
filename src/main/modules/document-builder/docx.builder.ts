import {
  Document,
  Paragraph,
  HeadingLevel,
  TextRun,
  Packer,
  AlignmentType,
} from 'docx';
import type { DocumentDraft } from '../../../shared/types/document.types';

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const bullet = line.match(/^[-*]\s+(.+)/);
    const numbered = line.match(/^\d+\.\s+(.+)/);

    if (h1) {
      paragraphs.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 }));
    } else if (h2) {
      paragraphs.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 }));
    } else if (h3) {
      paragraphs.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 }));
    } else if (bullet) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun(bullet[1])], bullet: { level: 0 } })
      );
    } else if (numbered) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun(numbered[1])], numbering: { reference: 'default-numbering', level: 0 } })
      );
    } else if (line.trim() === '') {
      paragraphs.push(new Paragraph({ text: '' }));
    } else {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun(line)],
        })
      );
    }
  }
  return paragraphs;
}

export async function buildDocx(draft: DocumentDraft): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: draft.title, heading: HeadingLevel.TITLE }),
          ...markdownToDocxParagraphs(draft.content),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
