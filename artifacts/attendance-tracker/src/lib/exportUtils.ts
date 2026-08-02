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

  // Separate academic and ward items
  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  // Calculate ward stats
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

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

  // Helper function to draw a table
  const drawTable = (title: string, tableItems: AttendanceReportItem[], startY: number, isWard: boolean = false) => {
    let currentY = startY;
    
    // Section Title
    if (isWard) {
      doc.setFillColor(239, 246, 255); // blue-50
      doc.setDrawColor(191, 219, 254); // blue-200
    } else {
      doc.setFillColor(240, 253, 244); // emerald-50
      doc.setDrawColor(187, 247, 208); // emerald-200
    }
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 9, 3, 3, 'FD');
    
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin + 5, currentY + 6);
    currentY += 9;

    // Table Header
    const colX = {
      subject: margin + 4,
      present: margin + 68,
      total: margin + 92,
      needed: margin + 115,
      pct: margin + 158
    };

    doc.setFillColor(isWard ? 30, 58, 138 : 30, 41, 59);
    doc.rect(margin, currentY, pageWidth - margin * 2, 9, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Subject / Rotation', colX.subject, currentY + 6);
    doc.text('Present', colX.present, currentY + 6);
    doc.text('Total', colX.total, currentY + 6);
    doc.text('Remaining / Needed', colX.needed, currentY + 6);
    doc.text('%', colX.pct, currentY + 6);

    currentY += 9;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    tableItems.forEach((item, index) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setTextColor(15, 23, 42);
      const subName = item.name.length > 32 ? item.name.substring(0, 30) + '..' : item.name;
      doc.text(subName, colX.subject, currentY + 5.5);
      doc.text(String(item.attended), colX.present, currentY + 5.5);
      doc.text(String(item.total), colX.total, currentY + 5.5);
      doc.text(item.neededForTarget, colX.needed, currentY + 5.5);

      if (item.pct >= targetPct) {
        doc.setTextColor(16, 185, 129);
      } else {
        doc.setTextColor(225, 29, 72);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.pct.toFixed(1)}%`, colX.pct, currentY + 5.5);
      doc.setFont('helvetica', 'normal');

      currentY += 8;
    });

    currentY += 2;
    return currentY;
  };

  // Draw Academic Subjects table
  if (academicItems.length > 0) {
    y = drawTable('Academic Subjects', academicItems, y, false);
    y += 6;
  }

  // Draw Ward Rotations table
  if (wardItems.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    y = drawTable('Clinical Rotations (Wards)', wardItems, y, true);
    y += 6;
  }

  // Summary Card
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  // Calculate combined summary
  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  let remark = `On Track (Target: ${targetPct}%)`;
  if (combinedPct >= 85) remark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (combinedPct >= targetPct) remark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else remark = `Attention Required (Below ${targetPct}% Required Threshold)`;

  const boxHeight = wardItems.length > 0 ? 34 : 26;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 3, 3, 'FD');

  doc.setTextColor(21, 128, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Combined Overall Attendance: ${combinedPct.toFixed(1)}%`, margin + 6, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Classes Attended: ${combinedAttended} / ${combinedTotal}`, margin + 6, y + 15);

  if (wardItems.length > 0) {
    doc.text(`Academic: ${overallAttended}/${overallTotal}  |  Ward: ${wardOverallAttended}/${wardOverallTotal}`, margin + 6, y + 22);
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Academic Remark: `, margin + 6, y + (wardItems.length > 0 ? 29 : 22));
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(21, 128, 61);
  doc.text(remark, margin + 40, y + (wardItems.length > 0 ? 29 : 22));

  y += boxHeight + 6;

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

  // Separate academic and ward items
  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  // Calculate ward stats
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const workbook = XLSX.utils.book_new();

  // Academic Subjects Sheet
  if (academicItems.length > 0) {
    const academicRows = academicItems.map(item => ({
      'Subject / Rotation': item.name,
      'Category': item.category || 'Academic',
      'Classes Attended': item.attended,
      'Total Classes': item.total,
      'Attendance (%)': Number(item.pct.toFixed(1)),
      'Classes Needed / Remaining': item.neededForTarget
    }));

    academicRows.push({
      'Subject / Rotation': 'ACADEMIC SUMMARY',
      'Category': filterTitle,
      'Classes Attended': overallAttended,
      'Total Classes': overallTotal,
      'Attendance (%)': Number(overallPct.toFixed(1)),
      'Classes Needed / Remaining': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed'
    });

    const wsAcademic = XLSX.utils.json_to_sheet(academicRows);
    wsAcademic['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 16 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsAcademic, 'Academic Subjects');
  }

  // Ward Rotations Sheet
  if (wardItems.length > 0) {
    const wardRows = wardItems.map(item => ({
      'Ward / Rotation': item.name.replace(' (Ward)', ''),
      'Category': item.category || 'Clinical Rotation',
      'Classes Attended': item.attended,
      'Total Classes': item.total,
      'Attendance (%)': Number(item.pct.toFixed(1)),
      'Classes Needed / Remaining': item.neededForTarget
    }));

    wardRows.push({
      'Ward / Rotation': 'WARD ROTATIONS SUMMARY',
      'Category': 'Clinical Rotations',
      'Classes Attended': wardOverallAttended,
      'Total Classes': wardOverallTotal,
      'Attendance (%)': Number(wardOverallPct.toFixed(1)),
      'Classes Needed / Remaining': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed'
    });

    const wsWard = XLSX.utils.json_to_sheet(wardRows);
    wsWard['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 16 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsWard, 'Ward Rotations');
  }

  // Metadata Sheet
  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  const metaRows = [
    { Property: 'Student Name', Value: studentName || 'Medical Student' },
    { Property: 'Routine Mode', Value: routineMode },
    { Property: 'Export Scope', Value: filterTitle },
    { Property: 'Minimum Target (%)', Value: `${targetPct}%` },
    { Property: 'Academic Overall Attendance (%)', Value: `${overallPct.toFixed(1)}%` }
  ];

  if (wardItems.length > 0) {
    metaRows.push({ Property: 'Ward Overall Attendance (%)', Value: `${wardOverallPct.toFixed(1)}%` });
  }

  metaRows.push(
    { Property: 'Combined Overall Attendance (%)', Value: `${combinedPct.toFixed(1)}%` },
    { Property: 'Combined Total Attended', Value: combinedAttended },
    { Property: 'Combined Total Classes', Value: combinedTotal },
    { Property: 'Generated Date', Value: new Date().toLocaleString() }
  );

  const metaSheet = XLSX.utils.json_to_sheet(metaRows);
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Report Metadata');

  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal, overallPct } = options;

  // Separate academic and ward items
  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  // Calculate ward stats
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  
  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  const headers = ['Type', 'Subject / Rotation', 'Classes Attended', 'Total Classes', 'Attendance Percentage (%)', 'Target Status'];
  
  const academicRows = academicItems.map(i => [
    'Academic',
    `"${i.name.replace(/"/g, '""')}"`,
    i.attended,
    i.total,
    i.pct.toFixed(1),
    `"${i.neededForTarget}"`
  ]);

  const wardRows = wardItems.map(i => [
    'Ward',
    `"${i.name.replace(/"/g, '""')}"`,
    i.attended,
    i.total,
    i.pct.toFixed(1),
    `"${i.neededForTarget}"`
  ]);

  const summaryRow = [
    'SUMMARY',
    '"Combined Total"',
    combinedAttended,
    combinedTotal,
    combinedPct.toFixed(1),
    '"Combined Summary"'
  ];

  const allRows = [...academicRows, ...wardRows, summaryRow];
  const csvContent = [headers.join(','), ...allRows.map(r => r.join(','))].join('\n');
  
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