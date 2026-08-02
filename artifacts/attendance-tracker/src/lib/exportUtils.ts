import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface AttendanceReportItem {
  name: string;
  category?: string;
  attended: number;
  total: number;          // conducted classes
  plannedTotal: number;   // total planned classes
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

  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));

  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // Header
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

  // Metadata
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
  const nowStr = new Date().toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Generated: `, pageWidth / 2 + 10, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(nowStr, pageWidth / 2 + 35, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Scope: `, pageWidth / 2 + 10, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(filterTitle, pageWidth / 2 + 35, y + 16);
  y += 32;

  const drawTable = (title: string, tableItems: AttendanceReportItem[], startY: number, isWard: boolean = false) => {
    let currentY = startY;
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

    const colWidth = (pageWidth - margin * 2) / 6;
    const colX = {
      subject: margin + colWidth / 2,
      conducted: margin + colWidth * 1.5,
      present: margin + colWidth * 2.5,
      remark1: margin + colWidth * 3.5,
      remark2: margin + colWidth * 4.5,
      pct: margin + colWidth * 5.5
    };

    if (isWard) doc.setFillColor(30, 58, 138);
    else doc.setFillColor(30, 41, 59);
    doc.rect(margin, currentY, pageWidth - margin * 2, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const headerLabel1 = isWard ? 'Rotation' : 'Subject';
    doc.text(headerLabel1, colX.subject, currentY + 6, { align: 'center' });
    doc.text('Class Conducted', colX.conducted, currentY + 6, { align: 'center' });
    doc.text('Present', colX.present, currentY + 6, { align: 'center' });
    doc.text('Remarks', (colX.remark1 + colX.remark2) / 2, currentY + 6, { align: 'center' });
    doc.text('Current %', colX.pct, currentY + 6, { align: 'center' });
    currentY += 9;

    doc.setFillColor(isWard ? 30 : 30, isWard ? 58 : 41, isWard ? 138 : 59);
    doc.rect(margin, currentY, pageWidth - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('', colX.subject, currentY + 4.5, { align: 'center' });
    doc.text('', colX.conducted, currentY + 4.5, { align: 'center' });
    doc.text('', colX.present, currentY + 4.5, { align: 'center' });
    doc.text('To Reach Preferred %', colX.remark1, currentY + 4.5, { align: 'center' });
    doc.text('Based on Planned Classes', colX.remark2, currentY + 4.5, { align: 'center' });
    doc.text('', colX.pct, currentY + 4.5, { align: 'center' });
    currentY += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    tableItems.forEach((item, index) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
        if (isWard) doc.setFillColor(30, 58, 138);
        else doc.setFillColor(30, 41, 59);
        doc.rect(margin, currentY, pageWidth - margin * 2, 9, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const h1 = isWard ? 'Rotation' : 'Subject';
        doc.text(h1, colX.subject, currentY + 6, { align: 'center' });
        doc.text('Class Conducted', colX.conducted, currentY + 6, { align: 'center' });
        doc.text('Present', colX.present, currentY + 6, { align: 'center' });
        doc.text('Remarks', (colX.remark1 + colX.remark2) / 2, currentY + 6, { align: 'center' });
        doc.text('Current %', colX.pct, currentY + 6, { align: 'center' });
        currentY += 9;
        doc.setFillColor(isWard ? 30 : 30, isWard ? 58 : 41, isWard ? 138 : 59);
        doc.rect(margin, currentY, pageWidth - margin * 2, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text('', colX.subject, currentY + 4.5, { align: 'center' });
        doc.text('', colX.conducted, currentY + 4.5, { align: 'center' });
        doc.text('', colX.present, currentY + 4.5, { align: 'center' });
        doc.text('To Reach Preferred %', colX.remark1, currentY + 4.5, { align: 'center' });
        doc.text('Based on Planned Classes', colX.remark2, currentY + 4.5, { align: 'center' });
        doc.text('', colX.pct, currentY + 4.5, { align: 'center' });
        currentY += 7;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setTextColor(15, 23, 42);
      const subName = item.name.length > 20 ? item.name.substring(0, 18) + '..' : item.name;

      if (item.total === 0) {
        const mergedText = 'Yet to be Conducted';
        const startX = colX.conducted - colWidth / 2;
        const endX = colX.pct + colWidth / 2;
        const centerX = (startX + endX) / 2;
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'italic');
        doc.text(subName, colX.subject, currentY + 5.5, { align: 'center' });
        doc.text(mergedText, centerX, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(subName, colX.subject, currentY + 5.5, { align: 'center' });
        doc.text(String(item.total), colX.conducted, currentY + 5.5, { align: 'center' });
        doc.text(String(item.attended), colX.present, currentY + 5.5, { align: 'center' });

        const target = targetPct;
        const conducted = item.total;
        const attended = item.attended;
        const plannedTotal = item.plannedTotal;

        let remark1 = '';
        let remark1Color = [15, 23, 42];
        if (conducted > 0) {
          const pct = (attended / conducted) * 100;
          if (pct >= target) {
            remark1 = 'Target Achieved';
            remark1Color = [16, 185, 129];
          } else {
            const needed = Math.ceil((target * conducted - 100 * attended) / (100 - target));
            if (needed > 0) {
              remark1 = `${needed} more`;
              remark1Color = [234, 179, 8];
            } else {
              remark1 = 'Target Achieved';
              remark1Color = [16, 185, 129];
            }
          }
        } else {
          remark1 = 'Yet to be Conducted';
          remark1Color = [148, 163, 184];
        }

        let remark2 = '';
        let remark2Color = [15, 23, 42];
        if (plannedTotal > 0) {
          const pct = (attended / plannedTotal) * 100;
          if (pct >= target) {
            remark2 = 'Target Achieved';
            remark2Color = [16, 185, 129];
          } else {
            const needed = Math.ceil((target * plannedTotal - 100 * attended) / (100 - target));
            const remaining = plannedTotal - conducted;
            if (needed > remaining) {
              remark2 = 'Better Luck Next Life';
              remark2Color = [239, 68, 68];
            } else if (needed > 0) {
              remark2 = `${needed} more`;
              remark2Color = [234, 179, 8];
            } else {
              remark2 = 'Target Achieved';
              remark2Color = [16, 185, 129];
            }
          }
        } else {
          remark2 = 'Yet to be Conducted';
          remark2Color = [148, 163, 184];
        }

        doc.setTextColor(remark1Color[0], remark1Color[1], remark1Color[2]);
        if (remark1 === 'Better Luck Next Life') doc.setFont('helvetica', 'bold');
        doc.text(remark1, colX.remark1, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');

        doc.setTextColor(remark2Color[0], remark2Color[1], remark2Color[2]);
        if (remark2 === 'Better Luck Next Life') doc.setFont('helvetica', 'bold');
        doc.text(remark2, colX.remark2, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');

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

  if (academicItems.length > 0) {
    y = drawTable('Academic Subjects', academicItems, y, false);
    y += 6;
  }
  if (wardItems.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    y = drawTable('Clinical Rotations (Wards)', wardItems, y, true);
    y += 6;
  }

  if (y > 235) { doc.addPage(); y = 20; }
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
  const { studentName, routineMode, filterTitle, items, overallAttended, overallTotal, overallPct, targetPct } = options;
  const academicItems = items.filter(item => !item.name.includes('(Ward)'));
  const wardItems = items.filter(item => item.name.includes('(Ward)'));
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const workbook = XLSX.utils.book_new();

  if (academicItems.length > 0) {
    const rows = academicItems.map(item => ({
      'Subject': item.name,
      'Class Conducted': item.total === 0 ? 'Yet to be Conducted' : item.total,
      'Present': item.total === 0 ? '' : item.attended,
      'To Reach Preferred %': item.total === 0 ? '' : item.neededForTarget,
      'Based on Planned Classes': (() => {
        if (item.total === 0) return 'Yet to be Conducted';
        const pct = (item.attended / item.plannedTotal) * 100;
        if (pct >= targetPct) return 'Target Achieved';
        const needed = Math.ceil((targetPct * item.plannedTotal - 100 * item.attended) / (100 - targetPct));
        const remaining = item.plannedTotal - item.total;
        if (needed > remaining) return 'Better Luck Next Life';
        if (needed > 0) return `${needed} more`;
        return 'Target Achieved';
      })(),
      'Current %': item.total === 0 ? '' : Number(item.pct.toFixed(1))
    }));
    rows.push({
      'Subject': 'ACADEMIC SUMMARY',
      'Class Conducted': overallTotal,
      'Present': overallAttended,
      'To Reach Preferred %': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Based on Planned Classes': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(overallPct.toFixed(1))
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Academic Subjects');
  }

  if (wardItems.length > 0) {
    const rows = wardItems.map(item => ({
      'Rotation': item.name.replace(' (Ward)', ''),
      'Class Conducted': item.total === 0 ? 'Yet to be Conducted' : item.total,
      'Present': item.total === 0 ? '' : item.attended,
      'To Reach Preferred %': item.total === 0 ? '' : item.neededForTarget,
      'Based on Planned Classes': (() => {
        if (item.total === 0) return 'Yet to be Conducted';
        const pct = (item.attended / item.plannedTotal) * 100;
        if (pct >= targetPct) return 'Target Achieved';
        const needed = Math.ceil((targetPct * item.plannedTotal - 100 * item.attended) / (100 - targetPct));
        const remaining = item.plannedTotal - item.total;
        if (needed > remaining) return 'Better Luck Next Life';
        if (needed > 0) return `${needed} more`;
        return 'Target Achieved';
      })(),
      'Current %': item.total === 0 ? '' : Number(item.pct.toFixed(1))
    }));
    rows.push({
      'Rotation': 'WARD ROTATIONS SUMMARY',
      'Class Conducted': wardOverallTotal,
      'Present': wardOverallAttended,
      'To Reach Preferred %': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Based on Planned Classes': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(wardOverallPct.toFixed(1))
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Ward Rotations');
  }

  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;
  const meta = [
    { Property: 'Student Name', Value: studentName || 'Medical Student' },
    { Property: 'Routine Mode', Value: routineMode },
    { Property: 'Export Scope', Value: filterTitle },
    { Property: 'Minimum Target (%)', Value: `${targetPct}%` },
    { Property: 'Overall Percentage', Value: `${combinedPct.toFixed(1)}%` },
    { Property: 'Academic Overall Percentage', Value: `${overallPct.toFixed(1)}%` },
    { Property: 'Ward Overall Percentage', Value: `${wardOverallPct.toFixed(1)}%` },
    { Property: 'Academic Remarks', Value: overallPct >= targetPct ? 'Target Achieved' : 'Action Needed' },
    { Property: 'Ward Remarks', Value: wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed' },
    { Property: 'Generated Date', Value: new Date().toLocaleString() }
  ];
  const metaSheet = XLSX.utils.json_to_sheet(meta);
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

  const headers = ['Type', 'Subject/Rotation', 'Class Conducted', 'Present', 'To Reach Preferred %', 'Based on Planned Classes', 'Current %'];
  const rows: any[] = [];
  academicItems.forEach(i => {
    rows.push([
      'Academic',
      `"${i.name.replace(/"/g, '""')}"`,
      i.total === 0 ? 'Yet to be Conducted' : i.total,
      i.total === 0 ? '' : i.attended,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : i.pct.toFixed(1)
    ]);
  });
  wardItems.forEach(i => {
    rows.push([
      'Ward',
      `"${i.name.replace(/"/g, '""')}"`,
      i.total === 0 ? 'Yet to be Conducted' : i.total,
      i.total === 0 ? '' : i.attended,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : i.pct.toFixed(1)
    ]);
  });
  rows.push([
    'SUMMARY',
    '"Combined Total"',
    combinedTotal,
    combinedAttended,
    '"Combined Summary"',
    '"Combined Summary"',
    combinedPct.toFixed(1)
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}