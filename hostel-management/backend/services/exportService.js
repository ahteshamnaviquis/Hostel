/**
 * Renders any report ({ title, columns, rows, summary }) to Excel (exceljs) or PDF (pdfkit).
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const fmtDate = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const fmtMoney = (v) => `Rs. ${Math.round(Number(v) || 0).toLocaleString('en-PK')}`;

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
      return fmtMoney(value);
    case 'date':
      return fmtDate(value);
    case 'datetime':
      return `${fmtDate(value)} ${String(value).slice(11, 16)}`;
    case 'percent':
      return `${Number(value).toFixed(1)}%`;
    case 'number':
      return Number(value).toLocaleString('en-PK');
    default:
      return String(value).replace(/_/g, ' ');
  }
}

const subtitle = (report) =>
  [report.hostelName, report.from && report.to ? `${fmtDate(report.from)} to ${fmtDate(report.to)}` : null, `Generated ${fmtDate(new Date().toISOString())}`]
    .filter(Boolean)
    .join('  |  ');

async function toExcel(report, appName) {
  const wb = new ExcelJS.Workbook();
  wb.creator = appName;
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  const n = report.columns.length;
  ws.addRow([`${appName} - ${report.title}`]).font = { bold: true, size: 14 };
  ws.addRow([subtitle(report)]).font = { color: { argb: 'FF64748B' } };
  ws.mergeCells(1, 1, 1, Math.max(1, n));
  ws.mergeCells(2, 1, 2, Math.max(1, n));
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  });
  report.rows.forEach((row) => {
    ws.addRow(
      report.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return '';
        if (['money', 'number', 'percent'].includes(c.type)) return Number(v);
        if (c.type === 'date') return fmtDate(v);
        if (c.type === 'datetime') return formatCell(v, 'datetime');
        return typeof v === 'string' ? v.replace(/_/g, ' ') : v;
      })
    );
  });
  report.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    if (c.type === 'money') column.numFmt = '#,##0';
    if (c.type === 'percent') column.numFmt = '0.0"%"';
    const maxLen = Math.max(c.label.length, ...report.rows.slice(0, 200).map((r) => formatCell(r[c.key], c.type).length));
    column.width = Math.min(45, Math.max(10, maxLen + 2));
  });
  if (report.summary?.length) {
    ws.addRow([]);
    ws.addRow(['Summary']).font = { bold: true };
    report.summary.forEach((s) => ws.addRow([s.label, formatCell(s.value, s.type)]));
  }
  return wb.xlsx.writeBuffer();
}

function toPdf(report, appName) {
  return new Promise((resolve, reject) => {
    const landscape = report.columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 32, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(`${appName} - ${report.title}`, left);
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(subtitle(report));
    doc.moveDown(0.6);

    // Column widths proportional to content length (bounded)
    const weights = report.columns.map((c) => {
      const len = Math.max(c.label.length, ...report.rows.slice(0, 100).map((r) => formatCell(r[c.key], c.type).length));
      return Math.min(30, Math.max(5, len));
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalW) * pageWidth);
    const fontSize = report.columns.length > 10 ? 6.5 : 7.5;

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, pageWidth, 16).fill('#0f766e');
      let x = left;
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');
      report.columns.forEach((c, i) => {
        doc.text(c.label, x + 3, y + 4.5, { width: widths[i] - 6, height: 10, ellipsis: true, align: ['money', 'number', 'percent'].includes(c.type) ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + 16;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(fontSize);
    report.rows.forEach((row, idx) => {
      const cells = report.columns.map((c) => formatCell(row[c.key], c.type));
      const heights = cells.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - 6 }));
      const h = Math.min(40, Math.max(...heights)) + 6;
      if (doc.y + h > bottomLimit()) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(fontSize);
      }
      const y = doc.y;
      if (idx % 2 === 1) doc.rect(left, y, pageWidth, h).fill('#f1f5f9');
      doc.fillColor('#1e293b');
      let x = left;
      cells.forEach((t, i) => {
        const c = report.columns[i];
        doc.text(t, x + 3, y + 3, { width: widths[i] - 6, height: h - 4, ellipsis: true, align: ['money', 'number', 'percent'].includes(c.type) ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + h;
    });
    if (!report.rows.length) {
      doc.moveDown().fillColor('#64748b').text('No records found for the selected filters.', left);
    }

    if (report.summary?.length) {
      if (doc.y + 30 + report.summary.length * 12 > bottomLimit()) doc.addPage();
      doc.moveDown(1).font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('Summary', left);
      doc.font('Helvetica').fontSize(8.5);
      report.summary.forEach((s) => {
        doc.fillColor('#475569').text(`${s.label}: `, left, doc.y, { continued: true }).fillColor('#0f172a').text(formatCell(s.value, s.type));
      });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - doc.page.margins.bottom - 8, { width: pageWidth, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { toExcel, toPdf, formatCell };
