import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface AttendanceReportItem {
  name: string;
  category?: string;
  attended: number;
  total: number;
  pct: number;
  neededForTarget: string;
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

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // Header Box / Branding
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, pageWidth - margin * 2, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ATTENDANCE REPORT', pageWidth / 2, y + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 253);
  doc.text('Attendenz Tracker • Local Device Academic Record', pageWidth / 2, y + 20, { align: 'center' });

  y += 34;

  // Metadata Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 26, 3, 3, 'FD');

  doc.setTextColor(51, 65, 85);
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
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(191, 219, 254);
    } else {
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
    }
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 9, 3, 3, 'FD');
    
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, pageWidth / 2, currentY + 6, { align: 'center' });
    currentY += 9;

    // Table Header - Column positions for center alignment
    const colWidth = (pageWidth - margin * 2) / 5;
    const colX = {
      subject: margin + colWidth / 2,
      conducted: margin + colWidth * 1.5,
      present: margin + colWidth * 2.5,
      remarks: margin + colWidth * 3.5,
      pct: margin + colWidth * 4.5
    };

    if (isWard) {
      doc.setFillColor(30, 58, 138);
    } else {
      doc.setFillColor(30, 41, 59);
    }
    doc.rect(margin, currentY, pageWidth - margin * 2, 9, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    
    // Header text - center aligned
    const headerLabel1 = isWard ? 'Rotation' : 'Subject';
    doc.text(headerLabel1, colX.subject, currentY + 6, { align: 'center' });
    doc.text('Class Conducted', colX.conducted, currentY + 6, { align: 'center' });
    doc.text('Present', colX.present, currentY + 6, { align: 'center' });
    doc.text('Remarks', colX.remarks, currentY + 6, { align: 'center' });
    doc.text('Current %', colX.pct, currentY + 6, { align: 'center' });

    currentY += 9;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    tableItems.forEach((item, index) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
        // Redraw header on new page
        if (isWard) {
          doc.setFillColor(30, 58, 138);
        } else {
          doc.setFillColor(30, 41, 59);
        }
        doc.rect(margin, currentY, pageWidth - margin * 2, 9, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const headerLabel1New = isWard ? 'Rotation' : 'Subject';
        doc.text(headerLabel1New, colX.subject, currentY + 6, { align: 'center' });
        doc.text('Class Conducted', colX.conducted, currentY + 6, { align: 'center' });
        doc.text('Present', colX.present, currentY + 6, { align: 'center' });
        doc.text('Remarks', colX.remarks, currentY + 6, { align: 'center' });
        doc.text('Current %', colX.pct, currentY + 6, { align: 'center' });
        currentY += 9;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setTextColor(15, 23, 42);
      const subName = item.name.length > 25 ? item.name.substring(0, 23) + '..' : item.name;
      
      // If total is 0, show "Yet to be Conducted" centered across columns 2-5
      if (item.total === 0) {
        const mergedText = 'Yet to be Conducted';
        // Center across columns 2-5 (conducted, present, remarks, pct)
        const startX = colX.conducted - colWidth / 2;
        const endX = colX.pct + colWidth / 2;
        const centerX = (startX + endX) / 2;
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'italic');
        doc.text(subName, colX.subject, currentY + 5.5, { align: 'center' });
        doc.text(mergedText, centerX, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else {
        // Normal row - all center aligned
        doc.text(subName, colX.subject, currentY + 5.5, { align: 'center' });
        doc.text(String(item.total), colX.conducted, currentY + 5.5, { align: 'center' });
        doc.text(String(item.attended), colX.present, currentY + 5.5, { align: 'center' });
        doc.text(item.neededForTarget, colX.remarks, currentY + 5.5, { align: 'center' });

        if (item.pct >= targetPct) {
          doc.setTextColor(16, 185, 129);
        } else {
          doc.setTextColor(225, 29, 72);
        }
        doc.setFont('helvetica', 'bold');
        doc.text(`${item.pct.toFixed(1)}%`, colX.pct, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      }

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

  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  // Calculate remarks for academic and ward separately
  let academicRemark = `On Track (Target: ${targetPct}%)`;
  if (overallPct >= 85) academicRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (overallPct >= targetPct) academicRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else academicRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;

  let wardRemark = `On Track (Target: ${targetPct}%)`;
  if (wardOverallPct >= 85) wardRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (wardOverallPct >= targetPct) wardRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else if (wardItems.length > 0 && wardOverallTotal > 0) wardRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;
  else wardRemark = 'No Ward Data Available';

  const boxHeight = wardItems.length > 0 ? 44 : 26;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(margin, y, pageWidth - margin * 2, boxHeight, 3, 3, 'FD');

  doc.setTextColor(21, 128, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Overall Percentage: ${combinedPct.toFixed(1)}%`, pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  
  let summaryY = y + 15;
  doc.text(`Academic Overall Percentage: ${overallPct.toFixed(1)}%`, pageWidth / 2, summaryY, { align: 'center' });
  summaryY += 7;
  
  if (wardItems.length > 0) {
    doc.text(`Ward/Clinical Rotation Overall Percentage: ${wardOverallPct.toFixed(1)}%`, pageWidth / 2, summaryY, { align: 'center' });
    summaryY += 7;
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Academic Remarks: `, margin + 6, summaryY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(21, 128, 61);
  doc.text(academicRemark, margin + 40, summaryY + 2);
  summaryY += 7;

  if (wardItems.length > 0) {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Ward Remarks: `, margin + 6, summaryY + 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(21, 128, 61);
    doc.text(wardRemark, margin + 35, summaryY + 2);
  }

  y += boxHeight + 6;

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

  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const workbook = XLSX.utils.book_new();

  if (academicItems.length > 0) {
    const academicRows = academicItems.map(item => ({
      'Subject': item.name,
      'Class Conducted': item.total === 0 ? 'Yet to be Conducted' : item.total,
      'Present': item.total === 0 ? '' : item.attended,
      'Remarks': item.total === 0 ? '' : item.neededForTarget,
      'Current %': item.total === 0 ? '' : Number(item.pct.toFixed(1))
    }));

    academicRows.push({
      'Subject': 'ACADEMIC SUMMARY',
      'Class Conducted': overallTotal,
      'Present': overallAttended,
      'Remarks': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(overallPct.toFixed(1))
    });

    const wsAcademic = XLSX.utils.json_to_sheet(academicRows);
    wsAcademic['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 15 },
      { wch: 28 },
      { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsAcademic, 'Academic Subjects');
  }

  if (wardItems.length > 0) {
    const wardRows = wardItems.map(item => ({
      'Rotation': item.name.replace(' (Ward)', ''),
      'Class Conducted': item.total === 0 ? 'Yet to be Conducted' : item.total,
      'Present': item.total === 0 ? '' : item.attended,
      'Remarks': item.total === 0 ? '' : item.neededForTarget,
      'Current %': item.total === 0 ? '' : Number(item.pct.toFixed(1))
    }));

    wardRows.push({
      'Rotation': 'WARD ROTATIONS SUMMARY',
      'Class Conducted': wardOverallTotal,
      'Present': wardOverallAttended,
      'Remarks': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(wardOverallPct.toFixed(1))
    });

    const wsWard = XLSX.utils.json_to_sheet(wardRows);
    wsWard['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 15 },
      { wch: 28 },
      { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsWard, 'Ward Rotations');
  }

  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  let academicRemark = `On Track (Target: ${targetPct}%)`;
  if (overallPct >= 85) academicRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (overallPct >= targetPct) academicRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else academicRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;

  let wardRemark = `On Track (Target: ${targetPct}%)`;
  if (wardOverallPct >= 85) wardRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (wardOverallPct >= targetPct) wardRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else if (wardItems.length > 0 && wardOverallTotal > 0) wardRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;
  else wardRemark = 'No Ward Data Available';

  const metaRows = [
    { Property: 'Student Name', Value: studentName || 'Medical Student' },
    { Property: 'Routine Mode', Value: routineMode },
    { Property: 'Export Scope', Value: filterTitle },
    { Property: 'Minimum Target (%)', Value: `${targetPct}%` },
    { Property: 'Overall Percentage', Value: `${combinedPct.toFixed(1)}%` },
    { Property: 'Academic Overall Percentage', Value: `${overallPct.toFixed(1)}%` },
    { Property: 'Ward Overall Percentage', Value: `${wardOverallPct.toFixed(1)}%` },
    { Property: 'Academic Remarks', Value: academicRemark },
    { Property: 'Ward Remarks', Value: wardRemark },
    { Property: 'Generated Date', Value: new Date().toLocaleString() }
  ];

  const metaSheet = XLSX.utils.json_to_sheet(metaRows);
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Report Metadata');

  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal, overallPct } = options;

  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  
  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  const headers = ['Type', 'Subject/Rotation', 'Class Conducted', 'Present', 'Remarks', 'Current %'];
  
  const academicRows = academicItems.map(i => [
    'Academic',
    `"${i.name.replace(/"/g, '""')}"`,
    i.total === 0 ? 'Yet to be Conducted' : i.total,
    i.total === 0 ? '' : i.attended,
    i.total === 0 ? '' : `"${i.neededForTarget}"`,
    i.total === 0 ? '' : i.pct.toFixed(1)
  ]);

  const wardRows = wardItems.map(i => [
    'Ward',
    `"${i.name.replace(/"/g, '""')}"`,
    i.total === 0 ? 'Yet to be Conducted' : i.total,
    i.total === 0 ? '' : i.attended,
    i.total === 0 ? '' : `"${i.neededForTarget}"`,
    i.total === 0 ? '' : i.pct.toFixed(1)
  ]);

  const summaryRow = [
    'SUMMARY',
    '"Combined Total"',
    combinedTotal,
    combinedAttended,
    '"Combined Summary"',
    combinedPct.toFixed(1)
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