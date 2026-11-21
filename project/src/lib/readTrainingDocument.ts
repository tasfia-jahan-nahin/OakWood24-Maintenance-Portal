export async function readTrainingDocument(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a document smaller than 25 MB.');
  if (extension === 'txt') return file.text();
  if (extension === 'docx') {
    const { unzipSync, strFromU8 } = await import('fflate');
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: ({ name, originalSize }) => name === 'word/document.xml' && originalSize < 10 * 1024 * 1024,
    });
    if (!archive['word/document.xml']) throw new Error('Could not read this Word document.');
    const xml = new DOMParser().parseFromString(strFromU8(archive['word/document.xml']), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Could not read this Word document.');
    const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
    return paragraphs.map((paragraph) => {
      const text = Array.from(paragraph.getElementsByTagNameNS('*', 't')).map((element) => element.textContent).join('');
      const listItem = paragraph.getElementsByTagNameNS('*', 'numPr').length > 0;
      return text.trim() && listItem ? `• ${text}` : text;
    }).join('\n');
  }
  if (extension === 'pdf') {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const document = await task.promise;
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        let line = '';
        let y: number | undefined;
        const lines: string[] = [];
        for (const item of content.items) {
          if (!('str' in item)) continue;
          if (y !== undefined && Math.abs(y - item.transform[5]) > 2 && line.trim()) {
            lines.push(line.trim());
            line = '';
          }
          line += item.str + ' ';
          y = item.transform[5];
          if (item.hasEOL && line.trim()) {
            lines.push(line.trim());
            line = '';
          }
        }
        if (line.trim()) lines.push(line.trim());
        pages.push(lines.join('\n'));
      }
      return pages.join('\n');
    } finally {
      await task.destroy();
    }
  }
  throw new Error('Choose a PDF, Word (.docx), or text file. Save older .doc files as .docx first.');
}
