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
  profileImage?: string;
  routineMode: string;
  targetPct: number;
  filterTitle: string;
  items: AttendanceReportItem[];
  overallAttended: number;
  overallTotal: number;
  overallPct: number;
}

// ── Shortened subject map (identical to HomeCard / CalendarPage) ──
const SHORTEN_MAP: Record<string, string> = {
  'Surgery': 'Surg.',
  'Obstetrics & Gynaecology': 'Obs & Gyn.',
  'Pediatrics': 'Peds.',
  'Orthopedics': 'Ortho.',
  'Ophthalmology': 'Ophtha.',
  'Otolaryngology': 'ENT',
  'Dermatology': 'Derm.',
  'Psychiatry': 'Psych.',
  'Physical Medicine': 'PMR',
  'Radiology': 'Radio.',
  'Radiotherapy': 'RadioT.',
  'Nuclear Medicine': 'Nuc Med.',
  'Neurosurgery': 'NeuroS.',
  'Pediatric Surgery': 'Peds Surg.',
  'Burn & Plastic Surgery': 'Plastic S.',
  'Internal Medicine': 'Medicine',
  'Phase Integrated Teaching': 'Phase Integrated',
  'Departmental Integrated Teaching': 'Dept. Integrated',
};

function shortenSubject(name: string): string {
  // (SGT) tag: shorten base, keep tag
  const sgtMatch = name.match(/^(.+?)\s*\(SGT\)$/);
  if (sgtMatch) return `${SHORTEN_MAP[sgtMatch[1]] || sgtMatch[1]} (SGT)`;
  // (Ward) tag: shorten base, strip tag
  const wardMatch = name.match(/^(.+?)\s*\(Ward\)$/);
  if (wardMatch) return SHORTEN_MAP[wardMatch[1]] || wardMatch[1];
  return SHORTEN_MAP[name] || name;
}

// ── Helper: load image as base64 ──
async function loadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Helper: get image dimensions ──
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function generatePDFReport(options: ExportReportOptions) {
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

  // FIX: SGT goes to Clinical, NOT Academic
  const academicItems = items.filter(item => !item.name.includes('(Ward)') && !item.name.includes('(SGT)'));
  const clinicalItems = items.filter(item => item.name.includes('(Ward)') || item.name.includes('(SGT)'));

  // Strip "(Ward)" but KEEP "(SGT)" so it differentiates
  const displayClinicalItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const clinicalOverallAttended = clinicalItems.reduce((acc, curr) => acc + curr.attended, 0);
  const clinicalOverallTotal = clinicalItems.reduce((acc, curr) => acc + curr.total, 0);
  const clinicalOverallPct = clinicalOverallTotal > 0 ? (clinicalOverallAttended / clinicalOverallTotal) * 100 : 0;

  // ── Load logo ──
  let logoBase64 = '';
  let logoDimensions = { width: 1, height: 1 };
  try {
    logoBase64 = await loadImageAsBase64('/Logo.jpeg');
    logoDimensions = await getImageDimensions(logoBase64);
  } catch {
    logoBase64 = '';
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // ── 1. LOGO ──
  if (logoBase64) {
    const logoHeight = 26;
    const aspectRatio = logoDimensions.width / logoDimensions.height;
    const logoWidth = logoHeight * aspectRatio;
    const logoX = (pageWidth - logoWidth) / 2;
    const logoY = y;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(logoX - 1, logoY - 1, logoWidth + 2, logoHeight + 2, 'S');
    doc.addImage(logoBase64, 'JPEG', logoX, logoY, logoWidth, logoHeight);
    y += logoHeight + 12;
  } else {
    y += 12;
  }

  // ── 2. TITLE ──
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ATTENDANCE REPORT', pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Attendenz Tracker • Local Device Academic Record', pageWidth / 2, y, { align: 'center' });
  y += 12;

  function getOrdinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  // ── 3. METADATA CARD ──
  const pad = 4;
  const rowH = 8;
  const photoW = 32;
  const gapPV = 5;
  const gapLV = 4;
  const now = new Date();
  const day = now.getDate();
  const suf = getOrdinalSuffix(day);
  const timeStr = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  const rows: Array<[string, string]> = [
    ['Name:', studentName || 'Medical Student'],
    ['Routine Mode:', routineMode],
    ['Exported:', `${day}${suf} ${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()} at ${timeStr}`],
    ['Scope:', filterTitle],
  ];
  const maxPageW = pageWidth - 30;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  let labelW = 0;
  rows.forEach(([l]) => { labelW = Math.max(labelW, doc.getTextWidth(l)); });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  let valueW = 0;
  rows.forEach(([, v]) => { valueW = Math.max(valueW, doc.getTextWidth(v)); });
  const fixedW = 3 + photoW + gapPV + labelW + gapLV;
  const availForValue = maxPageW - fixedW - pad;
  let usedValueW = valueW;
  let extraLines = 0;
  if (valueW > availForValue) {
    usedValueW = availForValue;
    rows.forEach(([, v]) => { extraLines += doc.splitTextToSize(v, availForValue).length - 1; });
  }
  const cardH = Math.max(photoW + 6, (4 + extraLines) * rowH + pad * 2);
  const cardW = Math.min(maxPageW, fixedW + usedValueW + pad);
  const cardX = (pageWidth - cardW) / 2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(cardX, y, cardW, cardH, 3, 3, 'FD');
  let photoBase64 = '';
  try {
    const src = options.profileImage;
    if (src) photoBase64 = src.startsWith('data:') ? src : await loadImageAsBase64(src);
  } catch { photoBase64 = ''; }
  const py = y + (cardH - photoW) / 2;
  if (photoBase64) {
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cardX + 3, py, photoW, photoW, 2, 2, 'S');
    doc.addImage(photoBase64, 'JPEG', cardX + 3, py, photoW, photoW);
  }
  const labelX = cardX + 3 + photoW + gapPV;
  const valueX = labelX + labelW + gapLV;
  let ry = y + pad + 5;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(51, 65, 85);
    doc.text(label, labelX, ry);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    const lines = usedValueW < valueW ? doc.splitTextToSize(value, usedValueW) : [value];
    doc.text(lines, valueX, ry);
    ry += rowH * lines.length;
  });
  y += cardH + 6;

  // ── Table Drawing Helper (with bottom legend) ──
  const drawTable = (
    title: string,
    tableItems: AttendanceReportItem[],
    startY: number,
    isClinical: boolean = false,
    applySorting: boolean = false
  ): number => {
    let currentY = startY;
    const legendMap = new Map<string, string>();
    const trackLegend = (fullName: string) => {
      const baseName = fullName.replace(/\s*\((SGT|Ward)\)$/, '');
      const shortBase = SHORTEN_MAP[baseName] || baseName;
      if (shortBase !== baseName && !legendMap.has(shortBase)) legendMap.set(shortBase, baseName);
    };

    let sortedItems = tableItems;
    if (applySorting) {
      const computeMergeStatus = (item: AttendanceReportItem): 'split' | 'merged' | 'zero' => {
        const conducted = item.total;
        if (conducted === 0) return 'zero';
        const plannedTotal = item.plannedTotal;
        const attended = item.attended;
        const target = targetPct;
        if (plannedTotal <= 0) return 'split';
        const totalNeeded = Math.ceil((target * plannedTotal) / 100);
        if (attended >= totalNeeded) {
          const conductedPct = conducted > 0 ? (attended / conducted) * 100 : 0;
          let remark1IsTarget = false;
          if (conducted > 0 && conductedPct >= target) remark1IsTarget = true;
          else {
            const needed1 = Math.ceil((target * conducted) / 100) - attended;
            remark1IsTarget = needed1 <= 0;
          }
          return remark1IsTarget ? 'merged' : 'split';
        } else {
          const remaining = plannedTotal - conducted;
          const neededFromRemaining = totalNeeded - attended;
          const canMiss = remaining - neededFromRemaining;
          if (canMiss > 0) return 'split';
          else return 'merged';
        }
      };
      const splitGroup: AttendanceReportItem[] = [];
      const mergedGroup: AttendanceReportItem[] = [];
      const zeroGroup: AttendanceReportItem[] = [];
      for (const item of tableItems) {
        const status = computeMergeStatus(item);
        if (status === 'zero') zeroGroup.push(item);
        else if (status === 'split') splitGroup.push(item);
        else mergedGroup.push(item);
      }
      splitGroup.sort((a, b) => b.pct - a.pct);
      mergedGroup.sort((a, b) => b.pct - a.pct);
      sortedItems = [...splitGroup, ...mergedGroup, ...zeroGroup];
    }

    // ── Section title ──
    if (isClinical) {
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(191, 219, 254);
    } else {
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
    }
    doc.roundedRect(15, currentY, pageWidth - 30, 9, 3, 3, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, pageWidth / 2, currentY + 6, { align: 'center' });
    currentY += 9;

    const colWidth = (pageWidth - 30) / 6;
    const colX = [15, 15 + colWidth, 15 + colWidth * 2, 15 + colWidth * 3, 15 + colWidth * 4, 15 + colWidth * 5, 15 + colWidth * 6];
    const headerRowHeight = 9;
    const subHeaderRowHeight = 7;
    const totalHeaderHeight = headerRowHeight + subHeaderRowHeight;

    // ── Draw header ──
    doc.setFillColor(isClinical ? 30 : 30, isClinical ? 58 : 41, isClinical ? 138 : 59);
    doc.rect(15, currentY, pageWidth - 30, totalHeaderHeight, 'F');
    const headerBlockCenterY = currentY + totalHeaderHeight / 2;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const headerLabel1 = isClinical ? 'Rotation / SGT' : 'Subject';
    doc.text(headerLabel1, (colX[0] + colX[1]) / 2, headerBlockCenterY, { align: 'center' });
    doc.text('Class Conducted', (colX[1] + colX[2]) / 2, headerBlockCenterY, { align: 'center' });
    doc.text('Present', (colX[2] + colX[3]) / 2, headerBlockCenterY, { align: 'center' });
    doc.text('Current %', (colX[5] + colX[6]) / 2, headerBlockCenterY, { align: 'center' });
    const topRowCenterY = currentY + headerRowHeight / 2;
    doc.text('Remarks', (colX[3] + colX[5]) / 2, topRowCenterY, { align: 'center' });
    const subRowCenterY = currentY + headerRowHeight + subHeaderRowHeight / 2;
    doc.setFontSize(6.5);
    doc.text('To Reach Preferred %', (colX[3] + colX[4]) / 2, subRowCenterY, { align: 'center' });
    doc.text('Based on Planned Classes', (colX[4] + colX[5]) / 2, subRowCenterY, { align: 'center' });

    // ── Borders ─
    doc.setDrawColor(85, 85, 85);
    doc.setLineWidth(0.4);
    doc.line(15, currentY, pageWidth - 15, currentY);
    doc.line(15, currentY + totalHeaderHeight, pageWidth - 15, currentY + totalHeaderHeight);
    doc.line(colX[3], currentY + headerRowHeight, colX[5], currentY + headerRowHeight);
    for (let i = 0; i <= 6; i++) {
      if (i === 4) continue;
      doc.line(colX[i], currentY, colX[i], currentY + totalHeaderHeight);
    }
    doc.line(colX[4], currentY + headerRowHeight, colX[4], currentY + totalHeaderHeight);
    currentY += totalHeaderHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setLineWidth(0.2);

    // ── Rows ──
    for (let idx = 0; idx < sortedItems.length; idx++) {
      const item = sortedItems[idx];
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
        doc.setFillColor(isClinical ? 30 : 30, isClinical ? 58 : 41, isClinical ? 138 : 59);
        doc.rect(15, currentY, pageWidth - 30, totalHeaderHeight, 'F');
        const hbCenter = currentY + totalHeaderHeight / 2;
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const h1 = isClinical ? 'Rotation / SGT' : 'Subject';
        doc.text(h1, (colX[0] + colX[1]) / 2, hbCenter, { align: 'center' });
        doc.text('Class Conducted', (colX[1] + colX[2]) / 2, hbCenter, { align: 'center' });
        doc.text('Present', (colX[2] + colX[3]) / 2, hbCenter, { align: 'center' });
        doc.text('Current %', (colX[5] + colX[6]) / 2, hbCenter, { align: 'center' });
        const topCenter = currentY + headerRowHeight / 2;
        doc.text('Remarks', (colX[3] + colX[5]) / 2, topCenter, { align: 'center' });
        doc.setFontSize(6.5);
        const subCenter = currentY + headerRowHeight + subHeaderRowHeight / 2;
        doc.text('To Reach Preferred %', (colX[3] + colX[4]) / 2, subCenter, { align: 'center' });
        doc.text('Based on Planned Classes', (colX[4] + colX[5]) / 2, subCenter, { align: 'center' });
        doc.setDrawColor(85, 85, 85);
        doc.setLineWidth(0.4);
        doc.line(15, currentY, pageWidth - 15, currentY);
        doc.line(15, currentY + totalHeaderHeight, pageWidth - 15, currentY + totalHeaderHeight);
        doc.line(colX[3], currentY + headerRowHeight, colX[5], currentY + headerRowHeight);
        for (let i = 0; i <= 6; i++) {
          if (i === 4) continue;
          doc.line(colX[i], currentY, colX[i], currentY + totalHeaderHeight);
        }
        doc.line(colX[4], currentY + headerRowHeight, colX[4], currentY + totalHeaderHeight);
        currentY += totalHeaderHeight;
        doc.setLineWidth(0.2);
      }

      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.setFillColor(241, 245, 249);
        doc.rect(15, currentY, pageWidth - 30, 8, 'F');
      }

      // FIX: shorten long names + track for legend
      const displayName = item.name;
      trackLegend(displayName);
      let subName = shortenSubject(displayName);
      if (subName.length > 20) subName = subName.substring(0, 18) + '..';

      const target = targetPct;
      const conducted = item.total;
      const attended = item.attended;
      const plannedTotal = item.plannedTotal;

      // ── Compute Remarks ──
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
            remark1Color = [255, 165, 0];
          } else {
            remark1Text = 'Target Achieved';
            remark1Color = [16, 185, 129];
          }
        }
      }

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
          if (remark1Text === 'Target Achieved') mergeRemarks = true;
        } else {
          const remaining = plannedTotal - conducted;
          const neededFromRemaining = totalNeeded - attended;
          const canMiss = remaining - neededFromRemaining;
          if (canMiss > 0) {
            remark2Text = `Can miss ${canMiss}`;
            remark2Color = [255, 165, 0];
            mergeRemarks = false;
          } else if (canMiss === 0) {
            const classText = remaining === 1 ? 'Class' : 'Classes';
            remark2Text = `Must Attend remaining ${remaining} ${classText}`;
            remark2Color = [139, 0, 0];
            mergeRemarks = true;
          } else {
            remark2Text = 'Better Luck Next Life';
            remark2Color = [128, 0, 128];
            mergeRemarks = true;
          }
        }
      } else {
        remark2Text = 'No Planned Classes';
        remark2Color = [148, 163, 184];
        mergeRemarks = false;
      }

      const isYetToBeConducted = conducted === 0;

      // ── Borders ─
      doc.setDrawColor(85, 85, 85);
      doc.setLineWidth(0.3);
      doc.line(15, currentY, pageWidth - 15, currentY);
      doc.line(15, currentY + 8, pageWidth - 15, currentY + 8);

      if (isYetToBeConducted) {
        doc.line(colX[0], currentY, colX[0], currentY + 8);
        doc.line(colX[1], currentY, colX[1], currentY + 8);
        doc.line(colX[6], currentY, colX[6], currentY + 8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(subName, (colX[0] + colX[1]) / 2, currentY + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        const mergedText = 'Yet to be Conducted';
        const centerX = (colX[1] + colX[6]) / 2;
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'italic');
        doc.text(mergedText, centerX, currentY + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        currentY += 8;
        continue;
      }

      // ── Normal row ──
      for (let i = 0; i <= 6; i++) {
        if (mergeRemarks && i >= 3 && i <= 5) continue;
        doc.line(colX[i], currentY, colX[i], currentY + 8);
      }
      if (mergeRemarks) {
        doc.line(colX[3], currentY, colX[3], currentY + 8);
        doc.line(colX[5], currentY, colX[5], currentY + 8);
      }

      const cellCenterY = currentY + 4;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(subName, (colX[0] + colX[1]) / 2, cellCenterY, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      doc.text(String(conducted), (colX[1] + colX[2]) / 2, cellCenterY, { align: 'center' });
      doc.text(String(attended), (colX[2] + colX[3]) / 2, cellCenterY, { align: 'center' });

      if (mergeRemarks) {
        const startX = colX[3];
        const endX = colX[5];
        const centerX = (startX + endX) / 2;
        const displayText = remark2Text;
        doc.setTextColor(remark2Color[0], remark2Color[1], remark2Color[2]);
        if (displayText === 'Better Luck Next Life' || displayText.includes('Must Attend')) {
          doc.setFont('helvetica', 'bold');
        }
        doc.text(displayText, centerX, cellCenterY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setTextColor(remark1Color[0], remark1Color[1], remark1Color[2]);
        if (remark1Text.includes('Attend')) {
          doc.setFont('helvetica', 'bold');
        }
        doc.text(remark1Text, (colX[3] + colX[4]) / 2, cellCenterY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(remark2Color[0], remark2Color[1], remark2Color[2]);
        if (remark2Text.includes('Can miss') || remark2Text === 'Target Achieved') {
          doc.setFont('helvetica', 'bold');
        }
        doc.text(remark2Text, (colX[4] + colX[5]) / 2, cellCenterY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      }

      if (item.pct >= targetPct) {
        doc.setTextColor(16, 185, 129);
      } else {
        doc.setTextColor(225, 29, 72);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.pct.toFixed(1)}%`, (colX[5] + colX[6]) / 2, cellCenterY, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      currentY += 8;
    }

    currentY += 2;

    // ── Legend anchored at the BOTTOM of this section ──
    if (legendMap.size > 0) {
      currentY += 4;
      if (currentY > 270) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Abbreviations used:', 17, currentY);
      currentY += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      legendMap.forEach((full, short) => {
        if (currentY > 275) { doc.addPage(); currentY = 20; }
        doc.setTextColor(71, 85, 105);
        doc.text(`${short} = ${full}`, 17, currentY);
        currentY += 3.2;
      });
    }

    currentY += 2;
    return currentY;
  };

  // ── ACADEMIC SECTION ──
  if (academicItems.length > 0) {
    y = drawTable('Academic Subjects', academicItems, y, false, true);
    y += 12;
  }

  // ── CLINICAL SECTION (Wards + SGT) ──
  if (displayClinicalItems.length > 0) {
    if (y > 235) {
      doc.addPage();
      y = 20;
    }
    y = drawTable('Clinical Rotations & SGT', displayClinicalItems, y, true, false);
    y += 8;
  }

  // ── SUMMARY CARD ──
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  const combinedAttended = overallAttended + clinicalOverallAttended;
  const combinedTotal = overallTotal + clinicalOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  let academicRemark = `On Track (Target: ${targetPct}%)`;
  if (overallPct >= 85) academicRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (overallPct >= targetPct) academicRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else academicRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;

  let clinicalRemark = `On Track (Target: ${targetPct}%)`;
  if (clinicalOverallPct >= 85) clinicalRemark = `Excellent Performance (Above ${targetPct}% Target)`;
  else if (clinicalOverallPct >= targetPct) clinicalRemark = `Satisfactory Attendance (Meets ${targetPct}% Target)`;
  else if (clinicalItems.length > 0 && clinicalOverallTotal > 0)
    clinicalRemark = `Attention Required (Below ${targetPct}% Required Threshold)`;
  else clinicalRemark = 'No Clinical Data Available';

  const boxHeight = clinicalItems.length > 0 ? 44 : 26;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(15, y, pageWidth - 30, boxHeight, 3, 3, 'FD');
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
  if (clinicalItems.length > 0) {
    doc.text(`Clinical Overall Percentage: ${clinicalOverallPct.toFixed(1)}%`, pageWidth / 2, summaryY, { align: 'center' });
    summaryY += 7;
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Academic Remarks: `, 21, summaryY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(21, 128, 61);
  doc.text(academicRemark, 55, summaryY + 2);
  summaryY += 7;
  if (clinicalItems.length > 0) {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Clinical Remarks: `, 21, summaryY + 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(21, 128, 61);
    doc.text(clinicalRemark, 50, summaryY + 2);
  }
  y += boxHeight + 6;

  // ── FOOTER ──
  doc.setDrawColor(203, 213, 225);
  doc.line(15, 280, pageWidth - 15, 280);
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

  const academicItems = items.filter(item => !item.name.includes('(Ward)') && !item.name.includes('(SGT)'));
  const clinicalItems = items.filter(item => item.name.includes('(Ward)') || item.name.includes('(SGT)'));
  const displayClinicalItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const clinicalOverallAttended = clinicalItems.reduce((acc, curr) => acc + curr.attended, 0);
  const clinicalOverallTotal = clinicalItems.reduce((acc, curr) => acc + curr.total, 0);
  const clinicalOverallPct = clinicalOverallTotal > 0 ? (clinicalOverallAttended / clinicalOverallTotal) * 100 : 0;

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
        if (pct >= target) remark1 = 'Target Achieved';
        else {
          const needed = Math.ceil((target * conducted) / 100) - attended;
          remark1 = needed > 0 ? `Attend next ${needed} ${needed === 1 ? 'Class' : 'Classes'}` : 'Target Achieved';
        }
        if (plannedTotal > 0) {
          const totalNeeded = Math.ceil((target * plannedTotal) / 100);
          if (attended >= totalNeeded) remark2 = 'Target Achieved';
          else {
            const remaining = plannedTotal - conducted;
            const neededFromRemaining = totalNeeded - attended;
            const canMiss = remaining - neededFromRemaining;
            if (canMiss > 0) remark2 = `Can miss ${canMiss}`;
            else if (canMiss === 0) {
              const classText = remaining === 1 ? 'Class' : 'Classes';
              remark2 = `Must Attend remaining ${remaining} ${classText}`;
            } else remark2 = 'Better Luck Next Life';
          }
        } else remark2 = 'No Planned Classes';
        if (remark1 === remark2) remark2 = '';
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
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Academic Subjects');
  }

  if (displayClinicalItems.length > 0) {
    const rows = displayClinicalItems.map(item => {
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
        if (pct >= target) remark1 = 'Target Achieved';
        else {
          const needed = Math.ceil((target * conducted) / 100) - attended;
          remark1 = needed > 0 ? `Attend next ${needed} ${needed === 1 ? 'Class' : 'Classes'}` : 'Target Achieved';
        }
        if (plannedTotal > 0) {
          const totalNeeded = Math.ceil((target * plannedTotal) / 100);
          if (attended >= totalNeeded) remark2 = 'Target Achieved';
          else {
            const remaining = plannedTotal - conducted;
            const neededFromRemaining = totalNeeded - attended;
            const canMiss = remaining - neededFromRemaining;
            if (canMiss > 0) remark2 = `Can miss ${canMiss}`;
            else if (canMiss === 0) {
              const classText = remaining === 1 ? 'Class' : 'Classes';
              remark2 = `Must Attend remaining ${remaining} ${classText}`;
            } else remark2 = 'Better Luck Next Life';
          }
        } else remark2 = 'No Planned Classes';
        if (remark1 === remark2) remark2 = '';
      }
      return {
        'Rotation / SGT': item.name,
        'Class Conducted': conducted === 0 ? 'Yet to be Conducted' : conducted,
        Present: conducted === 0 ? '' : attended,
        'To Reach Preferred %': remark1,
        'Based on Planned Classes': remark2,
        'Current %': conducted === 0 ? '' : Number(item.pct.toFixed(1)),
      };
    });
    rows.push({
      'Rotation / SGT': 'CLINICAL SUMMARY',
      'Class Conducted': clinicalOverallTotal,
      Present: clinicalOverallAttended,
      'To Reach Preferred %': clinicalOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Based on Planned Classes': clinicalOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed',
      'Current %': Number(clinicalOverallPct.toFixed(1)),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Clinical Rotations');
  }

  const combinedAttended = overallAttended + clinicalOverallAttended;
  const combinedTotal = overallTotal + clinicalOverallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;
  const meta = [
    { Property: 'Student Name', Value: studentName || 'Medical Student' },
    { Property: 'Routine Mode', Value: routineMode },
    { Property: 'Export Scope', Value: filterTitle },
    { Property: 'Minimum Target (%)', Value: `${targetPct}%` },
    { Property: 'Overall Percentage', Value: `${combinedPct.toFixed(1)}%` },
    { Property: 'Academic Overall Percentage', Value: `${overallPct.toFixed(1)}%` },
    { Property: 'Clinical Overall Percentage', Value: `${clinicalOverallPct.toFixed(1)}%` },
    { Property: 'Academic Remarks', Value: overallPct >= targetPct ? 'Target Achieved' : 'Action Needed' },
    { Property: 'Clinical Remarks', Value: clinicalOverallPct >= targetPct ? 'Target Achieved' : 'Action Needed' },
    { Property: 'Generated Date', Value: new Date().toLocaleString() },
  ];
  const metaSheet = XLSX.utils.json_to_sheet(meta);
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Report Metadata');
  XLSX.writeFile(workbook, `Attendance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── CSV Export ──
export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal } = options;

  const academicItems = items.filter(item => !item.name.includes('(Ward)') && !item.name.includes('(SGT)'));
  const clinicalItems = items.filter(item => item.name.includes('(Ward)') || item.name.includes('(SGT)'));
  const displayClinicalItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const clinicalOverallAttended = clinicalItems.reduce((acc, curr) => acc + curr.attended, 0);
  const clinicalOverallTotal = clinicalItems.reduce((acc, curr) => acc + curr.total, 0);
  const combinedAttended = overallAttended + clinicalOverallAttended;
  const combinedTotal = overallTotal + clinicalOverallTotal;
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
      i.total === 0 ? '' : i.pct.toFixed(1),
    ]);
  });

  displayClinicalItems.forEach(i => {
    rows.push([
      'Clinical',
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
