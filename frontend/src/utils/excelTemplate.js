// Shared styling for downloadable import templates
// (KelolaAkun siswa/guru templates, KonfigurasiIPC detail template).
// Header emphasis + grid borders + frozen top row for readability.
// Border-only cells carry no values, so the named-field import parsers
// (XLSX sheet_to_json) keep skipping empty rows exactly as before.
//
// Also restricts editing to the data table: the header row stays locked
// while data cells are unlocked, then the sheet is protected (no password,
// so it guards against accidental edits rather than acting as security).
// Users can still select cells, insert/delete rows; formatting and
// structural changes outside the data area stay disabled.

const HEADER_FILL = 'FF1E88E5';
const EVEN_ROW_FILL = 'FFF2F2F2';
const THIN = { style: 'thin', color: { argb: 'FFB4B4B4' } };
const CELL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export async function styleImportTemplateSheet(worksheet, { dataRowCount = 1000 } = {}) {
  const colCount = worksheet.columns?.length || 0;

  // NOTE: header font/fill/alignment are set per-cell (not row-level),
  // so the blue header only paints the table columns, never the whole row.
  const header = worksheet.getRow(1);
  header.height = 22;

  for (let r = 1; r <= dataRowCount; r += 1) {
    for (let c = 1; c <= colCount; c += 1) {
      const cell = worksheet.getCell(r, c);
      cell.border = CELL_BORDER;
      // Header locked, data area editable once the sheet is protected.
      cell.protection = { locked: r === 1 };
      if (r === 1) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
      // Zebra striping for readability (header keeps its blue fill).
      if (r > 1 && r % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EVEN_ROW_FILL } };
      }
    }
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  await worksheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    insertRows: true,
    deleteRows: true,
  });
}
