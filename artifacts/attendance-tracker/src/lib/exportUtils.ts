import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface AttendanceReportItem {
  name: string;
  category?: string;
  attended: number;
  total: number;
  plannedTotal: number;
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
    overallPct,
  } = options;

  // Remove "(Ward)" from ward item names for display
  const processedItems = items.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const academicItems = processedItems.filter(item => !item.name.includes('(Ward)'));
  const wardItems = processedItems.filter(item => item.name.includes('(Ward)'));

  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // ── Header ──
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

  // ── Metadata ──
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
    minute: '2-digit',
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

  // ── Table Drawing Helper ──
  const drawTable = (title: string, tableItems: AttendanceReportItem[], startY: number, isWard: boolean = false) => {
    let currentY = startY;

    // Section title
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
    const colX = [
      margin,
      margin + colWidth,
      margin + colWidth * 2,
      margin + colWidth * 3,
      margin + colWidth * 4,
      margin + colWidth * 5,
      margin + colWidth * 6,
    ];

    const headerRowHeight = 9;
    const subHeaderRowHeight = 7;
    const totalHeaderHeight = headerRowHeight + subHeaderRowHeight;

    // ── Main Header Row (background) ──
    doc.setFillColor(isWard ? 30 : 30, isWard ? 58 : 41, isWard ? 138 : 59);
    doc.rect(margin, currentY, pageWidth - margin * 2, headerRowHeight, 'F');
    // Sub-header row (background)
    doc.rect(margin, currentY + headerRowHeight, pageWidth - margin * 2, subHeaderRowHeight, 'F');

    // ── Draw header text (vertically centered across both rows for non-remark columns) ──
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    const headerLabel1 = isWard ? 'Rotation' : 'Subject';
    const centerY = currentY + totalHeaderHeight / 2 + 1; // +1 to fine-tune

    // Columns 0,1,2,5,6 – vertically centered across both rows
    doc.text(headerLabel1, (colX[0] + colX[1]) / 2, centerY, { align: 'center' });
    doc.text('Class Conducted', (colX[1] + colX[2]) / 2, centerY, { align: 'center' });
    doc.text('Present', (colX[2] + colX[3]) / 2, centerY, { align: 'center' });
    doc.text('Current %', (colX[5] + colX[6]) / 2, centerY, { align: 'center' });

    // "Remarks" centered over both remark columns, also vertically centered
    doc.text('Remarks', (colX[3] + colX[5]) / 2, centerY, { align: 'center' });

    // ── Sub-header text (only for remark sub-columns) ──
    doc.setFontSize(6.5);
    const subY = currentY + headerRowHeight + subHeaderRowHeight / 2 + 1;
    doc.text('To Reach Preferred %', (colX[3] + colX[4]) / 2, subY, { align: 'center' });
    doc.text('Based on Planned Classes', (colX[4] + colX[5]) / 2, subY, { align: 'center' });

    // ── Draw header borders ──
    doc.setDrawColor(226, 232, 240);
    // Top border of header
    doc.line(margin, currentY, pageWidth - margin, currentY);
    // Bottom border of sub-header
    doc.line(margin, currentY + totalHeaderHeight, pageWidth - margin, currentY + totalHeaderHeight);
    // Horizontal line between main and sub header rows
    doc.line(margin, currentY + headerRowHeight, pageWidth - margin, currentY + headerRowHeight);
    // Vertical lines for all columns across both rows
    for (let i = 0; i <= 6; i++) {
      doc.line(colX[i], currentY, colX[i], currentY + totalHeaderHeight);
    }

    currentY += totalHeaderHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    // ── Rows ──
    tableItems.forEach((item, index) => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
        // Redraw headers on new page (repeat header logic)
        doc.setFillColor(isWard ? 30 : 30, isWard ? 58 : 41, isWard ? 138 : 59);
        doc.rect(margin, currentY, pageWidth - margin * 2, headerRowHeight, 'F');
        doc.rect(margin, currentY + headerRowHeight, pageWidth - margin * 2, subHeaderRowHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const h1 = isWard ? 'Rotation' : 'Subject';
        const cy = currentY + totalHeaderHeight / 2 + 1;
        doc.text(h1, (colX[0] + colX[1]) / 2, cy, { align: 'center' });
        doc.text('Class Conducted', (colX[1] + colX[2]) / 2, cy, { align: 'center' });
        doc.text('Present', (colX[2] + colX[3]) / 2, cy, { align: 'center' });
        doc.text('Current %', (colX[5] + colX[6]) / 2, cy, { align: 'center' });
        doc.text('Remarks', (colX[3] + colX[5]) / 2, cy, { align: 'center' });
        doc.setFontSize(6.5);
        const sy = currentY + headerRowHeight + subHeaderRowHeight / 2 + 1;
        doc.text('To Reach Preferred %', (colX[3] + colX[4]) / 2, sy, { align: 'center' });
        doc.text('Based on Planned Classes', (colX[4] + colX[5]) / 2, sy, { align: 'center' });
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        doc.line(margin, currentY + totalHeaderHeight, pageWidth - margin, currentY + totalHeaderHeight);
        doc.line(margin, currentY + headerRowHeight, pageWidth - margin, currentY + headerRowHeight);
        for (let i = 0; i <= 6; i++) {
          doc.line(colX[i], currentY, colX[i], currentY + totalHeaderHeight);
        }
        currentY += totalHeaderHeight;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
      }

      const subName = item.name.length > 20 ? item.name.substring(0, 18) + '..' : item.name;
      const target = targetPct;
      const conducted = item.total;
      const attended = item.attended;
      const plannedTotal = item.plannedTotal;

      // ── Compute Remark 1 (based on conducted classes) ──
      let remark1Text = '';
      let remark1Color = [15, 23, 42];
      if (conducted === 0) {
        remark1Text = 'Yet to be Conducted';
        remark1Color = [148, 163, 184];
      } else {
        const pct = (attended / conducted) * 100;
        if (pct >= target) {
          remark1Text = 'Target Achieved';
          remark1Color = [16, 185, 129];
        } else {
          const needed = Math.ceil((target * conducted) / 100) - attended;
          if (needed > 0) {
            const classText = needed === 1 ? 'Class' : 'Classes';
            remark1Text = `Attend next ${needed} ${classText}`;
            remark1Color = [234, 179, 8];
          } else {
            remark1Text = 'Target Achieved';
            remark1Color = [16, 185, 129];
          }
        }
      }

      // ── Compute Remark 2 (based on total planned classes) ──
      let remark2Text = '';
      let remark2Color = [15, 23, 42];
      let mergeRemarks = false;

      if (conducted === 0) {
        remark2Text = 'Yet to be Conducted';
        remark2Color = [148, 163, 184];
      } else if (plannedTotal > 0) {
        const totalNeeded = Math.ceil((target * plannedTotal) / 100);
        if (attended >= totalNeeded) {
          remark2Text = 'Target Achieved';
          remark2Color = [16, 185, 129];
          if (remark1Text === 'Target Achieved') {
            mergeRemarks = true;
          }
        } else {
          const remaining = plannedTotal - conducted;
          const neededFromRemaining = totalNeeded - attended;
          const canMiss = remaining - neededFromRemaining;

          if (canMiss > 0) {
            remark2Text = `Can miss ${canMiss}`;
            remark2Color = [234, 179, 8];
            mergeRemarks = false;
          } else if (canMiss === 0) {
            const classText = remaining === 1 ? 'Class' : 'Classes';
            remark2Text = `Must Attend remaining ${remaining} ${classText}`;
            remark2Color = [239, 68, 68];
            mergeRemarks = true;
          } else {
            remark2Text = 'Better Luck Next Life';
            remark2Color = [239, 68, 68];
            mergeRemarks = true;
          }
        }
      } else {
        remark2Text = 'No Planned Classes';
        remark2Color = [148, 163, 184];
        mergeRemarks = false;
      }

      const isYetToBeConducted = conducted === 0;

      // ── Draw borders for this row ──
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY, pageWidth - margin, currentY); // top
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8); // bottom

      if (isYetToBeConducted) {
        // Merge columns 2-6 with "Yet to be Conducted"
        doc.line(colX[0], currentY, colX[0], currentY + 8); // left of subject col
        doc.line(colX[1], currentY, colX[1], currentY + 8); // right of subject col (left of merged)
        doc.line(colX[6], currentY, colX[6], currentY + 8); // right edge

        doc.setTextColor(15, 23, 42);
        doc.text(subName, (colX[0] + colX[1]) / 2, currentY + 5.5, { align: 'center' });

        const mergedText = 'Yet to be Conducted';
        const startX = colX[1];
        const endX = colX[6];
        const centerX = (startX + endX) / 2;
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'italic');
        doc.text(mergedText, centerX, currentY + 5.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        currentY += 8;
        return;
      }

      // Normal row
      // Vertical borders: skip internal lines inside merged remark area
      for (let i = 0; i <= 6; i++) {
        if (mergeRemarks && i >= 3 && i <= 5) continue;
        doc.line(colX[i], currentY, colX[i], currentY + 8);
      }
      if (mergeRemarks) {
        doc.line(colX[3], currentY, colX[3], currentY + 8);
        doc.line(colX[5], currentY, colX[5], currentY + 8);
      }

      // ── Render cell content ──
      doc.setTextColor(15, 23, 42);
      doc.text(subName, (colX[0] + colX[1]) / 2, currentY + 5.5, { align: 'center' });
      doc.text(String(conducted), (colX[1] + colX[2]) / 2, currentY + 5.5, { align: 'center' });
      doc.text(String(attended), (colX[2] + colX[3]) / 2, currentY + 5.5, { align: 'center' });

      if (mergeRemarks) {
        const startX = colX[3];
        const endX = colX[5];
        const centerX = (startX + endX) / 2;
        const maxWidth = colX[5] - colX[3] - 2;
        doc.setTextColor(remark2Color[0], remark2Color[1], remark2Color[2]);
        if (remark2Text === 'Better Luck Next Life' || remark2Text.includes('Must Attend')) {
          doc.setFont('helvetica', 'bold');
        }
        const lines = doc.splitTextToSize(remark2Text, maxWidth);
        const lineHeight = 4;
        const totalHeight = lines.length * lineHeight;
        const startY = currentY + 4 - (totalHeight / 2);
        lines.forEach((line: string, idx: number) => {
          doc.text(line, centerX, startY + idx * lineHeight + 1.5, { align: 'center' });
        });
        doc.setFont('helvetica', 'normal');
      } else {
        // Split remarks
        const maxWidth1 = colX[4] - colX[3] - 2;
        doc.setTextColor(remark1Color[0], remark1Color[1], remark1Color[2]);
        if (remark1Text.includes('Attend')) {
          doc.setFont('helvetica', 'bold');
        }
        const lines1 = doc.splitTextToSize(remark1Text, maxWidth1);
        const lineHeight1 = 4;
        const totalHeight1 = lines1.length * lineHeight1;
        const startY1 = currentY + 4 - (totalHeight1 / 2);
        lines1.forEach((line: string, idx: number) => {
          doc.text(line, (colX[3] + colX[4]) / 2, startY1 + idx * lineHeight1 + 1.5, { align: 'center' });
        });
        doc.setFont('helvetica', 'normal');

        const maxWidth2 = colX[5] - colX[4] - 2;
        doc.setTextColor(remark2Color[0], remark2Color[1], remark2Color[2]);
        if (remark2Text.includes('Can miss') || remark2Text === 'Target Achieved') {
          doc.setFont('helvetica', 'bold');
        }
        const lines2 = doc.splitTextToSize(remark2Text, maxWidth2);
        const lineHeight2 = 4;
        const totalHeight2 = lines2.length * lineHeight2;
        const startY2 = currentY + 4 - (totalHeight2 / 2);
        lines2.forEach((line: string, idx: number) => {
          doc.text(line, (colX[4] + colX[5]) / 2, startY2 + idx * lineHeight2 + 1.5, { align: 'center' });
        });
        doc.setFont('helvetica', 'normal');
      }

      // ── Current % ──
      if (item.pct >= targetPct) {
        doc.setTextColor(16, 185, 129);
      } else {
        doc.setTextColor(225, 29, 72);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.pct.toFixed(1)}%`, (colX[5] + colX[6]) / 2, currentY + 5.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      currentY += 8;
    });

    currentY += 2;
    return currentY;
  };

  // ── Draw tables ──
  if (academicItems.length > 0) {
    y = drawTable('Academic Subjects', academicItems, y, false);
    y += 6;
  }
  if (wardItems.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    y = drawTable('Clinical Rotations (Wards)', wardItems, y, true);
    y += 6;
  }

  // ── Summary ──
  if (y > 235) {
    doc.addPage();
    y = 20;
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
  else if (wardItems.length > 0 && wardOverallTotal > 0)
    wardRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;
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

// ── Excel Export ──
export function generateExcelReport(options: ExportReportOptions) {
  const {
    studentName,
    routineMode,
    filterTitle,
    items,
    overallAttended,
    overallTotal,
    overallPct,
    targetPct,
  } = options;

  const processedItems = items.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const academicItems = processedItems.filter(item => !item.name.includes('(Ward)'));
  const wardItems = processedItems.filter(item => item.name.includes('(Ward)'));
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const wardOverallPct = wardOverallTotal > 0 ? (wardOverallAttended / wardOverallTotal) * 100 : 0;

  const workbook = XLSX.utils.book_new();

  if (academicItems.length > 0) {
    const rows = academicItems.map(item => {
      const conducted = item.total;
      const attended = item.attended;
      const plannedTotal = item.plannedTotal;
      const target = targetPct;

      let remark1 = '';
      let remark2 = '';
      if (conducted === 0) {
        remark1 = 'Yet to be Conducted';
        remark2 = 'Yet to be Conducted';
      } else {
        const pct = (attended / conducted) * 100;
        if (pct >= target) {
          remark1 = 'Target Achieved';
        } else {
          const needed = Math.ceil((target * conducted) / 100) - attended;
          remark1 = needed > 0 ? `Attend next ${needed} ${needed === 1 ? 'Class' : 'Classes'}` : 'Target Achieved';
        }

        if (plannedTotal > 0) {
          const totalNeeded = Math.ceil((target * plannedTotal) / 100);
          if (attended >= totalNeeded) {
            remark2 = 'Target Achieved';
          } else {
            const remaining = plannedTotal - conducted;
            const neededFromRemaining = totalNeeded - attended;
            const canMiss = remaining - neededFromRemaining;
            if (canMiss > 0) {
              remark2 = `Can miss ${canMiss}`;
            } else if (canMiss === 0) {
              const classText = remaining === 1 ? 'Class' : 'Classes';
              remark2 = `Must Attend remaining ${remaining} ${classText}`;
            } else {
              remark2 = 'Better Luck Next Life';
            }
          }
        } else {
          remark2 = 'No Planned Classes';
        }

        if (remark1 === 'Target Achieved' && remark2 === 'Target Achieved') {
          remark1 = 'Target Achieved';
          remark2 = '';
        }
      }

      return {
        Subject: item.name,
        'Class Conducted': conducted === 0 ? 'Yet to be Conducted' : conducted,
        Present: conducted === 0 ? '' : attended,
        'To Reach Preferred %': remark1,
        'Based on Planned Classes': remark2,
        'Current %': conducted === 0 ? '' : Number(item.pct.toFixed(1)),
      };
    });

    rows.push({
      Subject: 'ACADEMIC SUMMARY',
      'Class Conducted': overallTotal,
      Present: overallAttended,
      'To Reach Preferred %': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Based on Planned Classes': overallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(overallPct.toFixed(1)),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 28 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(workbook, ws, 'Academic Subjects');
  }

  if (wardItems.length > 0) {
    const rows = wardItems.map(item => {
      const conducted = item.total;
      const attended = item.attended;
      const plannedTotal = item.plannedTotal;
      const target = targetPct;

      let remark1 = '';
      let remark2 = '';
      if (conducted === 0) {
        remark1 = 'Yet to be Conducted';
        remark2 = 'Yet to be Conducted';
      } else {
        const pct = (attended / conducted) * 100;
        if (pct >= target) {
          remark1 = 'Target Achieved';
        } else {
          const needed = Math.ceil((target * conducted) / 100) - attended;
          remark1 = needed > 0 ? `Attend next ${needed} ${needed === 1 ? 'Class' : 'Classes'}` : 'Target Achieved';
        }

        if (plannedTotal > 0) {
          const totalNeeded = Math.ceil((target * plannedTotal) / 100);
          if (attended >= totalNeeded) {
            remark2 = 'Target Achieved';
          } else {
            const remaining = plannedTotal - conducted;
            const neededFromRemaining = totalNeeded - attended;
            const canMiss = remaining - neededFromRemaining;
            if (canMiss > 0) {
              remark2 = `Can miss ${canMiss}`;
            } else if (canMiss === 0) {
              const classText = remaining === 1 ? 'Class' : 'Classes';
              remark2 = `Must Attend remaining ${remaining} ${classText}`;
            } else {
              remark2 = 'Better Luck Next Life';
            }
          }
        } else {
          remark2 = 'No Planned Classes';
        }

        if (remark1 === 'Target Achieved' && remark2 === 'Target Achieved') {
          remark1 = 'Target Achieved';
          remark2 = '';
        }
      }

      return {
        Rotation: item.name,
        'Class Conducted': conducted === 0 ? 'Yet to be Conducted' : conducted,
        Present: conducted === 0 ? '' : attended,
        'To Reach Preferred %': remark1,
        'Based on Planned Classes': remark2,
        'Current %': conducted === 0 ? '' : Number(item.pct.toFixed(1)),
      };
    });

    rows.push({
      Rotation: 'WARD ROTATIONS SUMMARY',
      'Class Conducted': wardOverallTotal,
      Present: wardOverallAttended,
      'To Reach Preferred %': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Based on Planned Classes': wardOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(wardOverallPct.toFixed(1)),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 32 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 28 },
      { wch: 16 },
    ];
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
    { Property: 'Generated Date', Value: new Date().toLocaleString() },
  ];
  const metaSheet = XLSX.utils.json_to_sheet(meta);
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Report Metadata');
  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── CSV Export ──
export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal, overallPct } = options;

  const processedItems = items.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const academicItems = processedItems.filter(item => !item.name.includes('(Ward)'));
  const wardItems = processedItems.filter(item => item.name.includes('(Ward)'));
  const wardOverallAttended = wardItems.reduce((acc, curr) => acc + curr.attended, 0);
  const wardOverallTotal = wardItems.reduce((acc, curr) => acc + curr.total, 0);
  const combinedAttended = overallAttended + wardOverallAttended;
  const combinedTotal = overallTotal + wardOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  const headers = [
    'Type',
    'Subject/Rotation',
    'Class Conducted',
    'Present',
    'To Reach Preferred %',
    'Based on Planned Classes',
    'Current %',
  ];
  const rows: any[] = [];
  academicItems.forEach(i => {
    rows.push([
      'Academic',
      `"${i.name.replace(/"/g, '""')}"`,
      i.total === 0 ? 'Yet to be Conducted' : i.total,
      i.total === 0 ? '' : i.attended,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : `"${i.neededForTarget}"`,
      i.total === 0 ? '' : i.pct.toFixed(1),
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
      i.total === 0 ? '' : i.pct.toFixed(1),
    ]);
  });
  rows.push([
    'SUMMARY',
    '"Combined Total"',
    combinedTotal,
    combinedAttended,
    '"Combined Summary"',
    '"Combined Summary"',
    combinedPct.toFixed(1),
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