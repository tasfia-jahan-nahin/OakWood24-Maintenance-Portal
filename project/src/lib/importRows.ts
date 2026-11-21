export function normalizeImportCell(value: unknown): string {
  return String(value ?? '').replace(/[ \t]*[\r\n\t\u0085\u2028\u2029]+[ \t]*/g, ' ').trim();
}

export function spreadsheetRowsToText(rows: unknown[][], decodeExcelEscapes = false): string {
  return rows.map((row) => row.map((cell) => {
    const value = decodeExcelEscapes && typeof cell === 'string'
      ? cell.replace(/_x(0009|000a|000d|005f|0085|2028|2029)_/gi, (_, code: string) =>
          String.fromCharCode(parseInt(code, 16)),
        )
      : cell;
    const text = normalizeImportCell(value);
    return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join('\t')).join('\n');
}

function importDelimiter(text: string): ',' | '\t' {
  let quoted = false;
  let fieldStart = true;
  let hasContent = false;
  let hasTab = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && (quoted || fieldStart)) {
      if (quoted && text[index + 1] === '"') {
        index++;
        continue;
      }
      quoted = !quoted;
      hasContent = true;
      fieldStart = false;
    } else if (!quoted && character === '\n') {
      if (hasContent) break;
      hasTab = false;
      fieldStart = true;
    } else if (!quoted && (character === '\t' || character === ',')) {
      hasTab ||= character === '\t';
      fieldStart = true;
    } else if (character.trim()) {
      hasContent = true;
      fieldStart = false;
    }
  }
  return hasTab ? '\t' : ',';
}

export function readImportRows(raw: string): { records: { cells: string[]; rowNumber: number }[]; warning?: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const delimiter = importDelimiter(text);
  const records: { cells: string[]; rowNumber: number }[] = [];
  let cells: string[] = [];
  let value = '';
  let quoted = false;
  let line = 1;
  let rowNumber = 1;

  const addCell = () => {
    cells.push(normalizeImportCell(value));
    value = '';
  };
  const addRecord = () => {
    addCell();
    if (cells.some(Boolean)) records.push({ cells, rowNumber });
    cells = [];
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === delimiter) {
      addCell();
    } else if (character === '\n') {
      addRecord();
      rowNumber = line + 1;
    } else if (character === '"' && !value.trim()) {
      quoted = true;
    } else {
      value += character;
    }
    if (character === '\n') line++;
  }
  if (quoted) {
    return { records: [], warning: `A quoted cell starting on row ${rowNumber} is incomplete. Check the file before importing.` };
  }
  addRecord();
  return { records };
}
