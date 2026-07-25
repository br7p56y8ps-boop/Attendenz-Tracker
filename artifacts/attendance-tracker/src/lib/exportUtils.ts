import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface AttendanceReportItem {
  name: string;
  category?: string;
  attended: number;
  total: number;
  pct: number;
  neededForTarget: string; // e.g. "0 needed" or "3 classes needed"
}

export interface ExportReportOptions {
  studentName: string;
  routineMode: string;
  targetPct: number;
  filterTitle: string;
  items: AttendanceReportItem[];
  overallAttended: number;
  overallTotal: number;
  overallPct: number;
}

export function generatePDFReport(options: ExportReportOptions) {
  const {
    studentName,
    routineMode,
    targetPct,
    filterTitle,
    items,
    overallAttended,
    overallTotal,
    overallPct
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 15;
  let y = 18;

  // Header Box / Branding
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, pageWidth - margin * 2, 28, 'F');

  // Title inside box
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ATTENDANCE REPORT', pageWidth / 2, y + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 253); // sky-200
  doc.text('Attendenz Tracker • Local Device Academic Record', pageWidth / 2, y + 20, { align: 'center' });

  y += 34;

  // Metadata Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, pageWidth - margin * 2, 26, 3, 3, 'FD');

  doc.setTextColor(51, 65, 85); // slate-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Student Name: `, margin + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(studentName || 'Medical Student', margin + 35, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(`Routine Mode: `, margin + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(routineMode, margin + 35, y + 16);

  const nowStr = new Date().toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  doc.setFont('helvetica', 'bold');
  doc.text(`Generated: `, pageWidth / 2 + 10, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(nowStr, pageWidth / 2 + 35, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(`Scope: `, pageWidth / 2 + 10, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(filterTitle, pageWidth / 2 + 35, y + 16);

  y += 32;

  // Table Header
  const colX = {
    subject: margin + 4,
    present: margin + 68,
    total: margin + 92,
    needed: margin + 115,
    pct: margin + 158
  };

  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Subject / Rotation', colX.subject, y + 6);
  doc.text('Present', colX.present, y + 6);
  doc.text('Total', colX.total, y + 6);
  doc.text('Remaining / Needed', colX.needed, y + 6);
  doc.text('%', colX.pct, y + 6);

  y += 9;

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  items.forEach((item, index) => {
    // Check page height space
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 8, pageWidth - margin, y + 8);

    doc.setTextColor(15, 23, 42);
    // Truncate subject name if long
    const subName = item.name.length > 32 ? item.name.substring(0, 30) + '..' : item.name;
    doc.text(subName, colX.subject, y + 5.5);
    doc.text(String(item.attended), colX.present, y + 5.5);
    doc.text(String(item.total), colX.total, y + 5.5);
    doc.text(item.neededForTarget, colX.needed, y + 5.5);

    if (item.pct >= targetPct) {
      doc.setTextColor(16, 185, 129); // emerald-600
    } else {
      doc.setTextColor(225, 29, 72); // rose-600
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`${item.pct.toFixed(1)}%`, colX.pct, y + 5.5);
    doc.setFont('helvetica', 'normal');

    y += 8;
  });

  y += 6;

  // Summary Card
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  let remark = `On Track (Target: ${targetPct}%)`;
  if (overallPct >= 85) remark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (overallPct >= targetPct) remark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else remark = `Attention Required (Below ${targetPct}% Required Threshold)`;

  const boxHeight = 26;
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208); // emerald-200
  doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 3, 3, 'FD');

  doc.setTextColor(21, 128, 61); // emerald-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Overall Attendance: ${overallPct.toFixed(1)}%`, margin + 6, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Classes Attended: ${overallAttended} / ${overallTotal}`, margin + 6, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Academic Remark: `, margin + 6, y + 21);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(21, 128, 61);
  doc.text(remark, margin + 40, y + 21);

  y += 30;

  // Footer Line & Text
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by Attendance Tracker • 100% Local Device Privacy', pageWidth / 2, 285, { align: 'center' });

  doc.save(`Attendance_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateExcelReport(options: ExportReportOptions) {
  const {
    studentName,
    routineMode,
    filterTitle,
    items,
    overallAttended,
    overallTotal,
    overallPct,
    targetPct
  } = options;

  const dataRows = items.map(item => ({
    'Subject / Rotation': item.name,
    'Category': item.category || 'General',
    'Classes Attended': item.attended,
    'Total Classes': item.total,
    'Attendance (%)': Number(item.pct.toFixed(1)),
    'Classes Needed / Remaining': item.neededForTarget
  }));

  // Append Summary Row
  dataRows.push({
    'Subject / Rotation': 'OVERALL SUMMARY',
    'Category': filterTitle,
    'Classes Attended': overallAttended,
    'Total Classes': overallTotal,
    'Attendance (%)': Number(overallPct.toFixed(1)),
    'Classes Needed / Remaining': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed'
  });

  const worksheet = XLSX.utils.json_to_sheet(dataRows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 32 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 16 },
    { wch: 28 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Summary');

  // Metadata Sheet
  const metaSheet = XLSX.utils.json_to_sheet([
    { Property: 'Student Name', Value: studentName || 'Medical Student' },
    { Property: 'Routine Mode', Value: routineMode },
    { Property: 'Export Scope', Value: filterTitle },
    { Property: 'Minimum Target (%)', Value: `${targetPct}%` },
    { Property: 'Overall Attendance (%)', Value: `${overallPct.toFixed(1)}%` },
    { Property: 'Generated Date', Value: new Date().toLocaleString() }
  ]);
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Report Metadata');

  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal, overallPct } = options;

  const headers = ['Subject / Rotation', 'Classes Attended', 'Total Classes', 'Attendance Percentage (%)', 'Target Status'];
  const rows = items.map(i => [
    `"${i.name.replace(/"/g, '""')}"`,
    i.attended,
    i.total,
    i.pct.toFixed(1),
    `"${i.neededForTarget}"`
  ]);

  rows.push([
    '"OVERALL TOTAL"',
    overallAttended,
    overallTotal,
    overallPct.toFixed(1),
    '"Summary"'
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
