/**
 * Reads a CSV or Excel (.xlsx) file in the browser into rows of text cells.
 * No third-party library: .xlsx files are ZIP archives of XML, unpacked with the browser's
 * DecompressionStream and read with DOMParser. Legacy .xls (binary) files are not supported.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * @param {File} file
 * @returns {Promise<{ sheets: { name: string, rows: string[][] }[], encoding: string }>}
 */
export async function readSpreadsheet(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`The file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is 10 MB.`);
  }
  const name = (file.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return { sheets: await readXlsx(buffer), encoding: 'xlsx' };
  }
  if (name.endsWith('.xls')) {
    throw new Error('Legacy .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then upload that file.');
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    const { text, encoding } = decodeText(buffer);
    return { sheets: [{ name: file.name, rows: parseCsv(text) }], encoding };
  }
  throw new Error('Unsupported file type. Upload a .csv or .xlsx file.');
}

// UTF-8 when the bytes are valid UTF-8, otherwise Windows-1252 (what Excel writes for "CSV" on Windows)
function decodeText(buffer) {
  let text;
  let encoding = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
    encoding = 'windows-1252';
  }
  return { text: text.replace(/^﻿/, ''), encoding };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CR/LF line breaks inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

async function readXlsx(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read .xlsx files. Use a current Chrome, Edge, Firefox or Safari, or upload a CSV export.');
  }
  const entries = readZipDirectory(buffer);
  const readText = async (path) => {
    const entry = entries.get(path);
    if (!entry) return null;
    const bytes = await inflateEntry(buffer, entry);
    return new TextDecoder('utf-8').decode(bytes);
  };

  const workbookXml = await readText('xl/workbook.xml');
  if (!workbookXml) throw new Error('This file is not a valid Excel workbook (xl/workbook.xml missing).');
  const relsXml = await readText('xl/_rels/workbook.xml.rels');
  const sharedXml = await readText('xl/sharedStrings.xml');

  const workbook = parseXml(workbookXml);
  const rels = relsXml ? parseXml(relsXml) : null;
  const targets = new Map();
  if (rels) {
    for (const rel of byTag(rels, 'Relationship')) {
      targets.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
  }

  const shared = [];
  if (sharedXml) {
    for (const si of byTag(parseXml(sharedXml), 'si')) {
      // Rich text is split into runs: join every <t>, skipping phonetic hints (<rPh>)
      shared.push(
        byTag(si, 't')
          .filter((t) => t.parentNode?.localName !== 'rPh')
          .map((t) => t.textContent)
          .join('')
      );
    }
  }

  const sheets = [];
  for (const sheet of byTag(workbook, 'sheet')) {
    const relId =
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
      sheet.getAttribute('r:id');
    let target = targets.get(relId) || '';
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = await readText(target.replace(/\/\.\//g, '/'));
    if (!xml) continue;
    sheets.push({ name: sheet.getAttribute('name') || target, rows: readSheetRows(parseXml(xml), shared) });
  }
  if (sheets.length === 0) throw new Error('No worksheets could be read from this workbook.');
  return sheets;
}

function readSheetRows(doc, shared) {
  const rows = [];
  for (const rowEl of byTag(doc, 'row')) {
    const rowIndex = Number(rowEl.getAttribute('r')) - 1;
    const cells = [];
    for (const c of byTag(rowEl, 'c')) {
      const ref = c.getAttribute('r') || '';
      const col = columnIndex(ref.replace(/\d+/g, ''));
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = byTag(c, 't').map((t) => t.textContent).join('');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v;
      cells[col >= 0 ? col : cells.length] = value;
    }
    const filled = Array.from(cells, (x) => (x === undefined ? '' : String(x)));
    rows[rowIndex >= 0 ? rowIndex : rows.length] = filled;
  }
  return Array.from(rows, (r) => r || []);
}

function columnIndex(letters) {
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The workbook contains XML that could not be read.');
  }
  return doc;
}

const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));

// Minimal ZIP reader: central directory + stored/deflated entries (no ZIP64, no encryption)
function readZipDirectory(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder('utf-8');

  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The workbook archive is damaged.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateEntry(buffer, entry) {
  const view = new DataView(buffer);
  const local = entry.localOffset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error('The workbook archive is damaged.');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error('The workbook uses an unsupported compression method.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
