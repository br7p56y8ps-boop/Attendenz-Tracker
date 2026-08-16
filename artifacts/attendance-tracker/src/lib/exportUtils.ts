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
  const sgtMatch = name.match(/^(.+?)\s*\(SGT\)$/);
  if (sgtMatch) return `${SHORTEN_MAP[sgtMatch[1]] || sgtMatch[1]} (SGT)`;
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

  const academicItems = items.filter(item => !item.name.includes('(Ward)') && !item.name.includes('(SGT)'));
  const clinicalItems = items.filter(item => item.name.includes('(Ward)') || item.name.includes('(SGT)'));
  const displayClinicalItems = || item.name.includes('(SGT)'));
  const displayClinicalItems = clinicalItems.map(item clinicalItems.map(item => ({
    => ({
    ...item,
 ...item,
    name: item    name: item.name.replace(/ \(.name.replace(/ \(Ward\)$Ward\)$/, '')
  }));

 /, '')
  }));

  const clinicalOverallAtt const clinicalOverallAttended = clinicalItemsended = clinicalItems.reduce((acc,.reduce((acc, curr) => acc curr) => acc + curr.attended + curr.attended, 0);, 0);
  const clinical
  const clinicalOverallTotal = clinicalOverallTotal = clinicalItems.reduce((accItems.reduce((acc, curr) =>, curr) => acc + curr.total acc + curr.total, 0);, 0);
  const clinical
  const clinicalOverallPct =OverallPct = clinicalOverallTotal > clinicalOverallTotal > 0 ? ( 0 ? (clinicalOverallAttendedclinicalOverallAttended / clinicalOverallTotal / clinicalOverallTotal) * 1) * 100 : 00 : 0;

 0;

  let logoBase6 let logoBase64 = '';
4 = '';
  let logoDimensions  let logoDimensions = { width: = { width: 1, height 1, height: 1 };: 1 };
  try {
  try {
    logoBase
    logoBase64 = await64 = await loadImageAsBase6 loadImageAsBase64('/Logo.jpeg4('/Logo.jpeg');
    logo');
    logoDimensions = await getImageDimensions = await getImageDimensions(logoBaseDimensions(logoBase64);
64);
  } catch {  } catch {
    logoBase
    logoBase64 = '';64 = '';
  }


  }

  const doc =  const doc = new jsPDF({ new jsPDF({ orientation: 'portrait orientation: 'portrait', unit: '', unit: 'mm', format:mm', format: 'a4' 'a4' });
  const });
  const pageWidth = doc pageWidth = doc.internal.pageSize.getWidth();.internal.pageSize.getWidth();
  let y
  let y = 18 = 18;

  if;

  if (logoBase6 (logoBase64) {
4) {
    const logoHeight    const logoHeight = 26 = 26;
    const;
    const aspectRatio = logo aspectRatio = logoDimensions.width / logoDimensions.height;
Dimensions.width / logoDimensions.height;
    const logoWidth = logoHeight *    const logoWidth = logoHeight * aspectRatio;
 aspectRatio;
    const logoX    const logoX = (pageWidth = (pageWidth - logoWidth) - logoWidth) / 2; / 2;
    const logo
    const logoY = y;Y = y;
    doc.set
    doc.setDrawColor(0DrawColor(0, 0,, 0, 0);
 0);
    doc.setLineWidth    doc.setLineWidth(0.5(0.5);
    doc);
    doc.rect(logoX.rect(logoX - 1, - 1, logoY -  logoY - 1, logoWidth1, logoWidth + 2, + 2, logoHeight +  logoHeight + 2, 'S');
    doc2, 'S');
    doc.addImage(logo.addImage(logoBase64,Base64, 'JPEG', logo 'JPEG', logoX, logoYX, logoY, logoWidth,, logoWidth, logoHeight);
 logoHeight);
    y += logo    y += logoHeight + 1Height + 12;
 2;
  } else {
 } else {
    y +=     y += 12;
12;
  }

   }

  doc.setTextColor(1 doc.setTextColor(15, 25, 23, 43, 42);
  doc.setFont('hel2);
  doc.setFont('helvetica', 'boldvetica', 'bold');
  doc');
  doc.setFontSize(2.setFontSize(22);
 2);
  doc.text('ATT doc.text('ATTENDANCE REPORT',ENDANCE REPORT', pageWidth /  pageWidth / 2, y,2, y, { align: ' { align: 'center' });
center' });
  y +=   y += 6;
 6;
  doc.setFont('hel doc.setFont('helvetica', 'normalvetica', 'normal');
  doc');
  doc.setFontSize(1.setFontSize(10);
 0);
  doc.setTextColor(1 doc.setTextColor(100, 00, 100,100, 100 100);
  doc);
  doc.text('Attendenz Tracker • Local Device.text('Attendenz Tracker • Local Device Academic Record', page Academic Record', pageWidth / 2Width / 2, y, {, y, { align: 'center align: 'center' });
  y += 1' });
  y += 12;

 2;

  function getOrdinalSuffix function getOrdinalSuffix(day: number):(day: number): string {
    string {
    if (day >= if (day >= 11 && 11 && day <= 1 day <= 13) return '3) return 'th';
   th';
    switch (day % switch (day % 10) 10) {
      case {
      case 1: return 1: return 'st';
 'st';
      case 2      case 2: return 'nd: return 'nd';
      case 3: return';
      case 3: return 'rd';
 'rd';
      default: return      default: return 'th';
 'th';
    }
     }
  }

  const pad = 4 }

  const pad = 4;
  const;
  const rowH =  rowH = 8;
 8;
  const photoW = const photoW = 32; 32;
  const gap
  const gapPV = 5PV = 5;
  const;
  const gapLV =  gapLV = 4;
 4;
  const now = new Date();
  const now = new Date();
  const day = now const day = now.getDate();
 .getDate();
  const suf = get const suf = getOrdinalSuffix(day);OrdinalSuffix(day);
  const time
  const timeStr = now.toLocaleStr = now.toLocaleString('en-US', { hour:String('en-US', { hour: '2-digit', minute: '2 '2-digit', minute: '2-digit', hour1-digit', hour12: true }).2: true }).toLowerCase();
 toLowerCase();
  const rows: Array const rows: Array<[string, string<[string, string]> = [
]> = [
    ['Name:',    ['Name:', studentName || ' studentName || 'Medical Student'],
    ['Routine ModeMedical Student'],
    ['Routine Mode:', routineMode],
    ['Export:', routineMode],
    ['Exported:', `${day}${suf}ed:', `${day}${suf} ${now.toLocaleString ${now.toLocaleString('en-US',('en-US', { month: ' { month: 'short' })}short' })} ${now.getFullYear()} ${now.getFullYear()} at ${timeStr at ${timeStr}`],
   }`],
    ['Scope:', filter ['Scope:', filterTitle],
 Title],
  ];
  const ];
  const maxPageW = maxPageW = pageWidth -  pageWidth - 30;
30;
  doc.setFont('  doc.setFont('helvetica', 'helvetica', 'bold'); doc.setFontbold'); doc.setFontSize(9);Size(9);
  let label
  let labelW = 0W = 0;
  rows;
  rows.forEach(([l]).forEach(([l]) => { labelW => { labelW = Math.max(labelW, doc.getText = Math.max(labelW, doc.getTextWidth(l)); });Width(l)); });
  doc.setFont
  doc.setFont('helvetica',('helvetica', 'normal'); doc 'normal'); doc.setFontSize(8.5);
.setFontSize(8.5);
  let valueW  let valueW = 0; = 0;
  rows.forEach
  rows.forEach(([, v])(([, v]) => { valueW => { valueW = Math.max(value = Math.max(valueW, doc.getTextW, doc.getTextWidth(v)); });Width(v)); });
  const fixed
  const fixedW = 3W = 3 + photoW + + photoW + gapPV + label gapPV + labelW + gapLVW + gapLV;
  const;
  const availForValue = availForValue = maxPageW - maxPageW - fixedW - pad fixedW - pad;
  let;
  let usedValueW = usedValueW = valueW;
 valueW;
  let extraLines  let extraLines = 0; = 0;
  if (
  if (valueW > availvalueW > availForValue) {ForValue) {
    usedValue
    usedValueW = availForW = availForValue;
   Value;
    rows.forEach(([, rows.forEach(([, v]) => { v]) => { extraLines += doc extraLines += doc.splitTextToSize.splitTextToSize(v, availFor(v, availForValue).length -Value).length - 1; }); 1; });
  }

  }
  const cardH  const cardH = Math.max(photo = Math.max(photoW + 6W + 6, (4 +, (4 + extraLines) * extraLines) * rowH + pad rowH + pad * 2); * 2);
  const card
  const cardW = Math.minW = Math.min(maxPageW,(maxPageW, fixedW + used fixedW + usedValueW + padValueW + pad);
  const);
  const cardX = ( cardX = (pageWidth - cardpageWidth - cardW) / W) / 2;
 2;
  doc.setFillColor( doc.setFillColor(248,248, 250 250, 25, 252);
 2);
  doc.setDrawColor doc.setDrawColor(226(226, 23, 232, 22, 240);
  doc.rounded40);
  doc.roundedRect(cardX,Rect(cardX, y, cardW y, cardW, cardH, 3, , cardH, 3, 3, 'FD3, 'FD');
  let');
  let photoBase64 photoBase64 = '';
  = '';
  try {
    try {
    const src = options const src = options.profileImage;
.profileImage;
    if (src    if (src) photoBase6) photoBase64 = src.startsWith4 = src.startsWith('data:') ?('data:') ? src : await loadImage src : await loadImageAsBase64AsBase64(src);
 (src);
  } catch { photo } catch { photoBase64 =Base64 = ''; }
  ''; }
  const py = y const py = y + (cardH - photoW) + (cardH - photoW) / 2; / 2;
  if (
  if (photoBase64) {
   photoBase64) {
    doc.setDrawColor doc.setDrawColor(203(203, 21, 213, 23, 225);
25);
    doc.rounded    doc.roundedRect(cardX +Rect(cardX + 3, py 3, py, photoW, photoW, , photoW, photoW, 2, 22, 2, 'S');, 'S');
    doc.add
    doc.addImage(photoBase6Image(photoBase64, 'JPEG', cardX +4, 'JPEG', cardX + 3, py 3, py, photoW,, photoW, photoW);
 photoW);
  }
   }
  const labelX = const labelX = cardX +  cardX + 3 + photoW3 + photoW + gapPV; + gapPV;
  const value
  const valueX = labelXX = labelX + labelW + + labelW + gapLV;
 gapLV;
  let ry =  let ry = y + pad + y + pad + 5;
 5;
  rows.forEach(([  rows.forEach(([label, value])label, value]) => {
    => {
    doc.setFont('hel doc.setFont('helvetica', 'boldvetica', 'bold'); doc.setFontSize'); doc.setFontSize(9); doc(9); doc.setTextColor(51.setTextColor(51, 65, 65, 85, 85);
    doc);
    doc.text(label, label.text(label, labelX, ry);X, ry);
    doc.setFont
    doc.setFont('helvetica',('helvetica', 'normal'); doc 'normal'); doc.setFontSize(8.setFontSize(8.5); doc.5); doc.setTextColor(71.setTextColor(71, 85, 85, 10, 105);
   5);
    const lines = used const lines = usedValueW < valueValueW < valueW ? doc.splitW ? doc.splitTextToSize(valueTextToSize(value, usedValueW, usedValueW) : [value) : [value];
    doc];
    doc.text(lines, value.text(lines, valueX, ry);X, ry);
    ry +=
    ry += rowH * lines rowH * lines.length;
 .length;
  });
  y });
  y += cardH + += cardH + 6;

 6;

  const drawTable  const drawTable = (
    = (
    title: string,
    tableItems title: string,
    tableItems: AttendanceReportItem: AttendanceReportItem[],
    startY[],
    startY: number,
: number,
    isClinical:    isClinical: boolean = false, boolean = false,
    applySorting
    applySorting: boolean = false: boolean = false
  ): number
  ): number => {
    => {
    let currentY = let currentY = startY;
    startY;
    const legendMap = const legendMap = new Map<string, new Map<string, string>();
    string>();
    const trackLegend = const trackLegend = (fullName: string (fullName: string) => {
) => {
      const baseName      const baseName = fullName.replace(/\s*\((SG = fullName.replace(/\s*\((SGT|WardT|Ward)\)$/, '');)\)$/, '');
      const short
      const shortBase = SHORTENBase = SHORTEN_MAP[baseName_MAP[baseName] || baseName] || baseName;
      if;
      if (shortBase !== (shortBase !== baseName && ! baseName && !legendMap.has(shortlegendMap.has(shortBase)) legendMap.set(shortBase,Base)) legendMap.set(shortBase, baseName);
 baseName);
    };

       };

    let sortedItems = let sortedItems = tableItems;
 tableItems;
    if (apply    if (applySorting) {
Sorting) {
      const computeMerge      const computeMergeStatus = (itemStatus = (item: AttendanceReportItem: AttendanceReportItem): 'split'): 'split' | 'merged' | 'merged' | 'zero' | 'zero' => {
        => {
        const conducted = item const conducted = item.total;
        if (conducted.total;
        if (conducted === 0) return 'zero'; === 0) return 'zero';
        const planned
        const plannedTotal = item.plTotal = item.plannedTotal;
annedTotal;
        const attended =        const attended = item.attended; item.attended;
        const target
        const target = targetPct = targetPct;
        if;
        if (plannedTotal (plannedTotal <= 0) <= 0) return 'split'; return 'split';
        const total
        const totalNeeded = Math.ceilNeeded = Math.ceil((target * planned((target * plannedTotal) / 100);Total) / 100);
        if (
        if (attended >= totalNeededattended >= totalNeeded) {
         ) {
          const conductedPct const conductedPct = conducted >  = conducted > 0 ? (attended0 ? (attended / conducted) * / conducted) * 100 100 : 0; : 0;
          let remark
          let remark1IsTarget =1IsTarget = false;
          false;
          if (conducted if (conducted > 0 && > 0 && conductedPct >= conductedPct >= target) remark1 target) remark1IsTarget = trueIsTarget = true;
          else;
          else {
            const {
            const needed1 = Math needed1 = Math.ceil((target *.ceil((target * conducted) /  conducted) / 100)100) - attended;
 - attended;
            remark1IsTarget = needed1            remark1IsTarget = needed1 <= 0; <= 0;
          }

          }
          return remark1          return remark1IsTarget ? 'IsTarget ? 'merged' : 'merged' : 'split';
       split';
        } else {
 } else {
          const remaining =          const remaining = plannedTotal - conducted;
          const plannedTotal - conducted;
          const neededFromRemaining = totalNeeded - attended neededFromRemaining = totalNeeded - attended;
          const;
          const canMiss = remaining canMiss = remaining - neededFromRemaining;
          if - neededFromRemaining;
          if (canMiss > 0) return (canMiss > 0) return 'split';
 'split';
          else return '          else return 'merged';
       merged';
        }
      }; }
      };
      const split
      const splitGroup: AttendanceReportGroup: AttendanceReportItem[] = [];Item[] = [];
      const merged
      const mergedGroup: AttendanceReportGroup: AttendanceReportItem[] = [];Item[] = [];
      const zero
      const zeroGroup: AttendanceReportGroup: AttendanceReportItem[] = [];Item[] = [];
      for (
      for (const item of tableconst item of tableItems) {
Items) {
        const status =        const status = computeMergeStatus(item computeMergeStatus(item);
        if);
        if (status === ' (status === 'zero') zeroGroupzero') zeroGroup.push(item);
.push(item);
        else if (        else if (status === 'splitstatus === 'split') splitGroup.push') splitGroup.push(item);
       (item);
        else mergedGroup.push else mergedGroup.push(item);
     (item);
      }
      split }
      splitGroup.sort((aGroup.sort((a, b) =>, b) => b.pct - b.pct - a.pct); a.pct);
      mergedGroup
      mergedGroup.sort((a,.sort((a, b) => b b) => b.pct - a.pct - a.pct);
.pct);
      sortedItems = [...splitGroup,      sortedItems = [...splitGroup, ...mergedGroup, ...mergedGroup, ...zeroGroup]; ...zeroGroup];
    }


    }

    if (is    if (isClinical) {
Clinical) {
      doc.setFillColor      doc.setFillColor(239(239, 24, 246, 26, 255);
55);
      doc.setDraw      doc.setDrawColor(19Color(191, 21, 219, 19, 254);254);
    } else
    } else {
      doc {
      doc.setFillColor(2.setFillColor(240, 40, 253,253, 244 244);
      doc);
      doc.setDrawColor(.setDrawColor(187,187, 247 247, 20, 208);
   8);
    }
    doc }
    doc.roundedRect(.roundedRect(15, current15, currentY, pageWidthY, pageWidth - 30 - 30, 9,, 9, 3,  3, 3, 'FD3, 'FD');
    doc');
    doc.setTextColor(15.setTextColor(15, 23, 23, 42, 42);
    doc);
    doc.setFont('helvetica.setFont('helvetica', 'bold');', 'bold');
    doc.setFont
    doc.setFontSize(11Size(11);
    doc);
    doc.text(title, page.text(title, pageWidth / 2Width / 2, currentY +, currentY + 6, { 6, { align: 'center align: 'center' });
   ' });
    currentY +=  currentY += 9;

   9;

    const colWidth = const colWidth = (pageWidth - 30) (pageWidth - 30) / 6; / 6;
    const col
    const colX = [1X = [15, 15, 15 + colWidth5 + colWidth, 15, 15 + colWidth * + colWidth * 2,  2, 15 + col15 + colWidth * 3Width * 3, 15, 15 + colWidth * + colWidth * 4,  4, 15 + col15 + colWidth * 5Width * 5, 15, 15 + colWidth * + colWidth * 6];
 6];
    const headerRow    const headerRowHeight = 9Height = 9;
    const;
    const subHeaderRowHeight subHeaderRowHeight = 7; = 7;
    const total
    const totalHeaderHeight = headerHeaderHeight = headerRowHeight + subRowHeight + subHeaderRowHeight;HeaderRowHeight;

    doc.set

    doc.setFillColor(isClinical ?FillColor(isClinical ? 30 : 30 : 30, 30, isClinical ?  isClinical ? 58 : 58 : 41, is41, isClinical ? 1Clinical ? 138 : 38 : 59);
59);
    doc.rect(    doc.rect(15, current15, currentY, pageWidthY, pageWidth - 30 - 30, totalHeaderHeight, totalHeaderHeight, 'F');, 'F');
    const header
    const headerBlockCenterY =BlockCenterY = currentY + total currentY + totalHeaderHeight / HeaderHeight / 2;
   2;
    doc.setTextColor(2 doc.setTextColor(255, 55, 255,255, 255 255);
    doc);
    doc.setFont('helvetica.setFont('helvetica', 'bold');', 'bold');
    doc.setFont
    doc.setFontSize(7.Size(7.5);
   5);
    const headerLabel1 const headerLabel1 = isClinical ? = isClinical ? 'Rotation / S 'Rotation / SGT' : 'GT' : 'Subject';
   Subject';
    doc.text(headerLabel doc.text(headerLabel1, (colX[0]1, (colX[0] + colX[ + colX[1]) / 1]) / 2, headerBlock2, headerBlockCenterY, {CenterY, { align: 'center align: 'center' });
   ' });
    doc.text('Class Conducted', ( doc.text('Class Conducted', (colX[1] + colXcolX[1] + colX[2]) /[2]) / 2, header 2, headerBlockCenterY,BlockCenterY, { align: ' { align: 'center' });
center' });
    doc.text('    doc.text('Present', (colPresent', (colX[2]X[2] + colX[3]) /  + colX[3]) / 2, headerBlock2, headerBlockCenterY, {CenterY, { align: 'center align: 'center' });
   ' });
    doc.text('Current doc.text('Current %', (col %', (colX[5]X[5] + colX[ + colX[6]) / 6]) / 2, headerBlock2, headerBlockCenterY, {CenterY, { align: 'center align: 'center' });
   ' });
    const topRowCenter const topRowCenterY = currentYY = currentY + headerRowHeight + headerRowHeight / 2; / 2;
    doc.text
    doc.text('Remarks', (('Remarks', (colX[3colX[3] + colX] + colX[5]) /[5]) / 2, top 2, topRowCenterY,RowCenterY, { align: ' { align: 'center' });
center' });
    const subRow    const subRowCenterY = currentCenterY = currentY + headerRowY + headerRowHeight + subHeaderHeight + subHeaderRowHeight / RowHeight / 2;
   2;
    doc.setFontSize( doc.setFontSize(6.5);6.5);
    doc.text('To Reach Preferred
    doc.text('To Reach Preferred %', (col %', (colX[3]X[3] + colX[ + colX[4]) / 4]) / 2, subRowCenterY, {2, subRowCenterY, { align: 'center align: 'center' });
   ' });
    doc.text('Based doc.text('Based on Planned Classes', on Planned Classes', (colX[ (colX[4] + col4] + colX[5])X[5]) / 2, / 2, subRowCenterY subRowCenterY, { align:, { align: 'center' }); 'center' });

    doc.set

    doc.setDrawColor(8DrawColor(85, 85, 85, 85, 85);
   5);
    doc.setLineWidth(0.4); doc.setLineWidth(0.4);
    doc.line
    doc.line(15,(15, currentY, page currentY, pageWidth - 1Width - 15, currentY5, currentY);
    doc);
    doc.line(15.line(15, currentY +, currentY + totalHeaderHeight, totalHeaderHeight, pageWidth -  pageWidth - 15, current15, currentY + totalHeaderY + totalHeaderHeight);
   Height);
    doc.line(colX doc.line(colX[3], current[3], currentY + headerRowY + headerRowHeight, colX[5], currentHeight, colX[5], currentY + headerRowY + headerRowHeight);
   Height);
    for (let i for (let i = 0; = 0; i <= 6 i <= 6; i++) {; i++) {
      if (
      if (i === 4i === 4) continue;
) continue;
      doc.line(col      doc.line(colX[i], currentX[i], currentY, colXY, colX[i], currentY + totalHeaderHeight[i], currentY + totalHeaderHeight);
    });
    }
    doc.line
    doc.line(colX[4(colX[4], currentY +], currentY + headerRowHeight, headerRowHeight, colX[4 colX[4], currentY +], currentY + totalHeaderHeight); totalHeaderHeight);
    currentY += totalHeaderHeight
    currentY += totalHeaderHeight;

    doc;

    doc.setFont('helvetica.setFont('helvetica', 'normal');
    doc.setFont', 'normal');
    doc.setFontSize(8.Size(8.5);
   5);
    doc.setLineWidth( doc.setLineWidth(0.2);0.2);

    for (

    for (let idx = let idx = 0; idx 0; idx < sortedItems.length;< sortedItems.length; idx++) {
 idx++) {
      const item =      const item = sortedItems[idx]; sortedItems[idx];
      if (
      if (currentY > currentY > 260)260) {
        doc {
        doc.addPage();
.addPage();
        currentY =        currentY = 20; 20;
        doc.set
        doc.setFillColor(isClinical ?FillColor(isClinical ? 30 : 30 : 30, 30, isClinical ?  isClinical ? 58 : 58 : 41, is41, isClinical ? 1Clinical ? 138 : 38 : 59);
59);
        doc.rect(15, current        doc.rect(15, currentY, pageWidthY, pageWidth - 30 - 30, totalHeaderHeight, totalHeaderHeight, 'F');, 'F');
        const hb
        const hbCenter = currentYCenter = currentY + totalHeaderHeight + totalHeaderHeight / 2; / 2;
        doc.setTextColor
        doc.setTextColor(255(255, 25, 255, 25, 255);
55);
        doc.setFont('        doc.setFont('helvetica', 'helvetica', 'bold');
       bold');
        doc.setFontSize(7.5); doc.setFontSize(7.5);
        const h
        const h1 = isClinical1 = isClinical ? 'Rotation / ? 'Rotation / SGT' : SGT' : 'Subject';
 'Subject';
        doc.text(h        doc.text(h1, (col1, (colX[0]X[0] + colX[ + colX[1]) / 1]) / 2, hbCenter2, hbCenter, { align:, { align: 'center' });
        doc.text 'center' });
        doc.text('Class Conducted', (col('Class Conducted', (colX[1]X[1] + colX[ + colX[2]) / 2, hbCenter2]) / 2, hbCenter, { align:, { align: 'center' }); 'center' });
        doc.text
        doc.text('Present', (('Present', (colX[2] + colXcolX[2] + colX[3]) /[3]) / 2, hb 2, hbCenter, { alignCenter, { align: 'center': 'center' });
        doc.text('Current % });
        doc.text('Current %', (colX', (colX[5] +[5] + colX[6 colX[6]) / 2]) / 2, hbCenter,, hbCenter, { align: ' { align: 'center' });
center' });
        const topCenter        const topCenter = currentY + = currentY + headerRowHeight / headerRowHeight / 2;
 2;
        doc.text('        doc.text('Remarks', (colRemarks', (colX[3]X[3] + colX[ + colX[5]) / 5]) / 2, topCenter2, topCenter, { align:, { align: 'center' }); 'center' });
        doc.setFont
        doc.setFontSize(6.Size(6.5);
       5);
        const subCenter = const subCenter = currentY + header currentY + headerRowHeight + subRowHeight + subHeaderRowHeight /HeaderRowHeight / 2;
 2;
        doc.text('        doc.text('To Reach Preferred %To Reach Preferred %', (colX', (colX[3] +[3] + colX[4 colX[4]) / 2, subCenter,]) / 2, subCenter, { align: ' { align: 'center' });
center' });
        doc.text('        doc.text('Based on Planned ClassesBased on Planned Classes', (colX', (colX[4] +[4] + colX[5 colX[5]) / 2]) / 2, subCenter, { align: ', subCenter, { align: 'center' });
center' });
        doc.setDraw        doc.setDrawColor(85, 85Color(85, 85, 85, 85);
       );
        doc.setLineWidth( doc.setLineWidth(0.4);0.4);
        doc.line
        doc.line(15,(15, currentY, page currentY, pageWidth - 1Width - 15, currentY5, currentY);
        doc);
        doc.line(15.line(15, currentY +, currentY + totalHeaderHeight, totalHeaderHeight, pageWidth -  pageWidth - 15, currentY + totalHeader15, currentY + totalHeaderHeight);
       Height);
        doc.line(colX doc.line(colX[3], current[3], currentY + headerRowY + headerRowHeight, colXHeight, colX[5], current[5], currentY + headerRowY + headerRowHeight);
       Height);
        for (let i for (let i = 0; = 0; i <= 6 i <= 6; i++) {; i++) {
          if (
          if (i === 4i === 4) continue;
) continue;
          doc.line(col          doc.line(colX[i], currentX[i], currentY, colXY, colX[i], currentY + totalHeaderHeight[i], currentY + totalHeaderHeight);
        });
        }
        doc.line
        doc.line(colX[4(colX[4], currentY +], currentY + headerRowHeight, colX[4 headerRowHeight, colX[4], currentY +], currentY + totalHeaderHeight); totalHeaderHeight);
        currentY
        currentY += totalHeaderHeight += totalHeaderHeight;
        doc.setLineWidth(0;
        doc.setLineWidth(0.2);
.2);
      }

           }

      const isEven = idx % 2 const isEven = idx % 2 === 0; === 0;
      if (
      if (isEven) {isEven) {
        doc.set
        doc.setFillColor(24FillColor(241, 21, 245, 45, 249);249);
        doc.rect
        doc.rect(15,(15, currentY, page currentY, pageWidth - 3Width - 30, 8, 'F');0, 8, 'F');
      }


      }

      const displayName =      const displayName = item.name;
 item.name;
      trackLegend(display      trackLegend(displayName);
     Name);
      let subName = let subName = shortenSubject(displayName shortenSubject(displayName);
      if);
      if (subName.length (subName.length > 20 > 20) subName =) subName = subName.substring( subName.substring(0, 10, 18) + '..8) + '..';

      const target = targetP';

      const target = targetPct;
     ct;
      const conducted = item const conducted = item.total;
     .total;
      const attended = item const attended = item.attended;
.attended;
      const plannedTotal      const plannedTotal = item.planned = item.plannedTotal;

     Total;

      let remark1Text let remark1Text = '';
      = '';
      let remark1Color let remark1Color = [15 = [15, 23, 23, 42, 42];
      if];
      if (conducted === (conducted === 0) { 0) {
        remark1
        remark1Text = 'Yet to be ConductedText = 'Yet to be Conducted';
        remark1Color = [';
        remark1Color = [148,148, 163 163, 18, 184];
     4];
      } else {
 } else {
        const pct =        const pct = (attended / conducted) * 1 (attended / conducted) * 100;
00;
        if (p        if (pct >= target)ct >= target) {
          remark {
          remark1Text = '1Text = 'Target Achieved';Target Achieved';
          remark1
          remark1Color = [1Color = [16, 185, 6, 185, 129];129];
        } else
        } else {
          const {
          const needed = Math.ceil needed = Math.ceil((target * conducted((target * conducted) / 1) / 100) -00) - attended;
          attended;
          if (needed > if (needed > 0) { 0) {
            const class
            const classText = needed ===Text = needed === 1 ? ' 1 ? 'Class' : 'Class' : 'Classes';
           Classes';
            remark1Text = remark1Text = `Attend next ${ `Attend next ${needed} ${classneeded} ${classText}`;
            remark1ColorText}`;
            remark1Color = [25 = [255, 15, 165, 65, 0];
         0];
          } else {
 } else {
            remark1Text            remark1Text = 'Target Achie = 'Target Achieved';
           ved';
            remark1Color = remark1Color = [16, [16, 185 185, 12, 129];
         9];
          }
        } }
        }
      }

      let remark2
      }

      let remark2Text = '';
Text = '';
      let remark2      let remark2Color = [1Color = [15, 25, 23, 43, 42];
     2];
      let mergeRemarks = let mergeRemarks = false;
      false;
      if (conducted if (conducted === 0) === 0) {
        remark {
        remark2Text = '2Text = 'Yet to be ConductYet to be Conducted';
       ed';
        remark2Color = remark2Color = [148 [148, 16, 163, 13, 184];
84];
      } else if      } else if (plannedTotal (plannedTotal > 0) > 0) {
        const {
        const totalNeeded = Math totalNeeded = Math.ceil((target * plannedTotal) /.ceil((target * plannedTotal) / 100 100);
        if);
        if (attended >= total (attended >= totalNeeded) {
Needed) {
          remark2Text          remark2Text = 'Target Achie = 'Target Achieved';
          remark2Color =ved';
          remark2Color = [16, [16, 185 185, 12, 129];
         9];
          if (remark1 if (remark1Text === 'TargetText === 'Target Achieved') merge Achieved') mergeRemarks = true;Remarks = true;
        } else {
          const
        } else {
          const remaining = plannedTotal - conducted;
 remaining = plannedTotal - conducted;
          const neededFrom          const neededFromRemaining = totalNeededRemaining = totalNeeded - attended;
 - attended;
          const canMiss          const canMiss = remaining - needed = remaining - neededFromRemaining;
FromRemaining;
          if (can          if (canMiss > 0Miss > 0) {
           ) {
            remark2Text = remark2Text = `Can miss ${ `Can miss ${canMiss}`;canMiss}`;
            remark2
            remark2Color = [2Color = [255, 165,55, 165, 0];
 0];
            mergeRemarks =            mergeRemarks = false;
          false;
          } else if ( } else if (canMiss === canMiss === 0) {
0) {
            const classText            const classText = remaining ===  = remaining === 1 ? 'Class1 ? 'Class' : 'Classes' : 'Classes';
            remark';
            remark2Text = `2Text = `Must Attend remaining ${Must Attend remaining ${remaining} ${classremaining} ${classText}`;
Text}`;
            remark2Color            remark2Color = [13 = [139, 09, 0, 0];, 0];
            mergeRemarks
            mergeRemarks = true;
 = true;
          } else {          } else {
            remark2
            remark2Text = 'BetterText = 'Better Luck Next Life'; Luck Next Life';
            remark2
            remark2Color = [1Color = [128, 28, 0, 10, 128];
28];
            mergeRemarks =            mergeRemarks = true;
          true;
          }
        }
      } else }
        }
      } else {
        remark {
        remark2Text = '2Text = 'No Planned Classes';No Planned Classes';
        remark2
        remark2Color = [1Color = [148, 48, 163,163, 184 184];
        merge];
        mergeRemarks = false;Remarks = false;
      }


      }

      const isYet      const isYetToBeConducted = conducted === ToBeConducted = conducted === 0;

     0;

      doc.setDrawColor doc.setDrawColor(85,(85, 85, 85, 85); 85);
      doc.set
      doc.setLineWidth(0.LineWidth(0.3);
     3);
      doc.line(1 doc.line(15, currentY5, currentY, pageWidth -, pageWidth - 15, 15, currentY);
 currentY);
      doc.line(      doc.line(15, current15, currentY + 8Y + 8, pageWidth -, pageWidth - 15, 15, currentY +  currentY + 8);

     8);

      if (isYetToBeConducted if (isYetToBeConducted) {
       ) {
        doc.line(colX doc.line(colX[0], current[0], currentY, colXY, colX[0], current[0], currentY + 8Y + 8);
        doc);
        doc.line(colX[.line(colX[1], currentY1], currentY, colX[, colX[1], currentY1], currentY + 8); + 8);
        doc.line
        doc.line(colX[6(colX[6], currentY,], currentY, colX[6 colX[6], currentY +], currentY + 8);
 8);
        doc.setFont('        doc.setFont('helvetica', 'helvetica', 'bold');
        doc.setTextColor(1bold');
        doc.setTextColor(15, 25, 23, 43, 42);
       2);
        doc.text(subName doc.text(subName, (colX, (colX[0] +[0] + colX[1 colX[1]) / 2]) / 2, currentY +, currentY + 4, { 4, { align: 'center align: 'center' });
       ' });
        doc.setFont('hel doc.setFont('helvetica', 'normalvetica', 'normal');
        const');
        const mergedText = ' mergedText = 'Yet to be Conducted';
       Yet to be Conducted';
        const centerX = (colX[1 const centerX = (colX[1] + colX] + colX[6]) /[6]) / 2;
 2;
        doc.setTextColor(        doc.setTextColor(148,148, 163 163, 18, 184);
       4);
        doc.setFont('helvetica', 'italic doc.setFont('helvetica', 'italic');
        doc');
        doc.text(mergedText.text(mergedText, centerX, current, centerX, currentY + 4Y + 4, { align:, { align: 'center' }); 'center' });
        doc.setFont
        doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
        currentY +=        currentY += 8;
 8;
        continue;
        continue;
      }

           }

      for (let i for (let i = 0; = 0; i <= 6 i <= 6; i++) {; i++) {
        if (
        if (mergeRemarks && imergeRemarks && i >= 3 && >= 3 && i <= 5 i <= 5) continue;
) continue;
        doc.line(col        doc.line(colX[i], currentX[i], currentY, colXY, colX[i], currentY[i], currentY + 8); + 8);
      }

      }
      if (merge      if (mergeRemarks) {
Remarks) {
        doc.line(col        doc.line(colX[3],X[3], currentY, col currentY, colX[3],X[3], currentY +  currentY + 8);
       8);
        doc.line(colX doc.line(colX[5], current[5], currentY, colXY, colX[5], current[5], currentY + 8Y + 8);
      });
      }

      const cell

      const cellCenterY = currentCenterY = currentY + 4Y + 4;
      doc;
      doc.setFont('helvetica.setFont('helvetica', 'bold');', 'bold');
      doc.setTextColor
      doc.setTextColor(15,(15, 23, 23, 42); 42);
      doc.text
      doc.text(subName, ((subName, (colX[0colX[0] + colX] + colX[1]) /[1]) / 2, cell 2, cellCenterY, {CenterY, { align: 'center align: 'center' });
     ' });
      doc.setFont('hel doc.setFont('helvetica', 'normal');

      docvetica', 'normal');

      doc.text(String(conducted.text(String(conducted), (colX), (colX[1] +[1] + colX[2 colX[2]) / 2]) / 2, cellCenterY, cellCenterY, { align:, { align: 'center' }); 'center' });
      doc.text
      doc.text(String(attended),(String(attended), (colX[2] + col (colX[2] + colX[3])X[3]) / 2, / 2, cellCenterY, { align: ' cellCenterY, { align: 'center' });

      if (mergecenter' });

      if (mergeRemarks) {
Remarks) {
        const startX =        const startX = colX[3 colX[3];
        const];
        const endX = col endX = colX[5];X[5];
        const centerX
        const centerX = (startX = (startX + endX) + endX) / 2; / 2;
        const display
        const displayText = remark2Text = remark2Text;
       Text;
        doc.setTextColor(remark doc.setTextColor(remark2Color[02Color[0], remark2Color], remark2Color[1], remark[1], remark2Color[22Color[2]);
        if]);
        if (displayText === ' (displayText === 'Better Luck Next LifeBetter Luck Next Life' || displayText' || displayText.includes('Must Attend.includes('Must Attend')) {
         ')) {
          doc.setFont('hel doc.setFont('helvetica', 'boldvetica', 'bold');
        }');
        }
        doc.text
        doc.text(displayText, centerX(displayText, centerX, cellCenterY, cellCenterY, { align:, { align: 'center' }); 'center' });
        doc.setFont
        doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
      } else {      } else {
        doc.setTextColor
        doc.setTextColor(remark1Color(remark1Color[0], remark[0], remark1Color[11Color[1], remark1Color], remark1Color[2]);
[2]);
        if (remark        if (remark1Text.includes('1Text.includes('Attend')) {
Attend')) {
          doc.setFont('          doc.setFont('helvetica', 'helvetica', 'bold');
       bold');
        }
        doc }
        doc.text(remark1.text(remark1Text, (colText, (colX[3]X[3] + colX[ + colX[4]) / 4]) / 2, cellCenter2, cellCenterY, { alignY, { align: 'center': 'center' });
        doc });
        doc.setFont('helvetica.setFont('helvetica', 'normal');', 'normal');
        doc.setTextColor
        doc.setTextColor(remark2Color(remark2Color[0], remark[0], remark2Color[12Color[1], remark2Color], remark2Color[2]);
[2]);
        if (remark        if (remark2Text.includes('2Text.includes('Can miss') ||Can miss') || remark2Text === remark2Text === 'Target Achieved 'Target Achieved') {
         ') {
          doc.setFont('hel doc.setFont('helvetica', 'boldvetica', 'bold');
        }');
        }
        doc.text
        doc.text(remark2Text(remark2Text, (colX, (colX[4] +[4] + colX[5 colX[5]) / 2]) / 2, cellCenterY, cellCenterY, { align:, { align: 'center' }); 'center' });
        doc.setFont
        doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
      }

           }

      if (item.p if (item.pct >= targetPct >= targetPct) {
ct) {
        doc.setTextColor(        doc.setTextColor(16, 185,16, 185, 129 129);
      });
      } else {
        else {
        doc.setTextColor(2 doc.setTextColor(225, 25, 29, 29, 72);
72);
      }
           }
      doc.setFont('hel doc.setFont('helvetica', 'boldvetica', 'bold');
      doc');
      doc.text(`${item.p.text(`${item.pct.toFixed(1ct.toFixed(1)}%`, ()}%`, (colX[5colX[5] + colX] + colX[6]) /[6]) / 2, cell 2, cellCenterY, {CenterY, { align: 'center align: 'center' });
     ' });
      doc.setFont('hel doc.setFont('helvetica', 'normalvetica', 'normal');

      current');

      currentY += 8Y += 8;
    };
    }

    currentY

    currentY += 2; += 2;

    //

    // ── Legend anchored ── Legend anchored at the bottom ( at the bottom (3-column aligned grid3-column aligned grid) ──) ──
    if (
    if (legendMap.size >legendMap.size > 0) { 0) {
      currentY
      currentY += 4; += 4;
      if (
      if (currentY > currentY > 270)270) { doc.addPage { doc.addPage(); currentY =(); currentY = 20; 20; }
      doc }
      doc.setFontSize(7.setFontSize(7);
      doc);
      doc.setFont('helvetica.setFont('helvetica', 'bold');', 'bold');
      doc.setTextColor
      doc.setTextColor(100(100, 11, 116, 16, 139);
39);
      doc.text('      doc.text('Abbreviations usedAbbreviations used:', 17, currentY);:', 17, currentY);
      currentY
      currentY += 4; += 4;

      const left

      const leftMargin = 1Margin = 17;
     7;
      const colWidth = const colWidth = (pageWidth - 30) (pageWidth - 30) / 3;
      const bullet / 3;
      const bullet = '• '; = '• ';
      const eq
      const eq = ' = ';

      let col = ' = ';

      let col = 0; = 0;
      legendMap
      legendMap.forEach((full,.forEach((full, short) => { short) => {
        if (
        if (col === 0col === 0 && currentY > 275 && currentY > 275) { 
          doc.addPage();) { 
          doc.addPage(); 
          currentY 
          currentY = 20 = 20; 
        }; 
        }
        
        const
        
        const x = leftMargin x = leftMargin + (col * + (col * colWidth);
 colWidth);
        
        doc.setFont        
        doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
        doc.setTextColor(        doc.setTextColor(148,148, 163 163, 18, 184);
       4);
        doc.text(bullet doc.text(bullet, x, currentY);
        
, x, currentY);
        
        doc.setFont('        doc.setFont('helvetica', 'helvetica', 'bold');
       bold');
        doc.setTextColor(5 doc.setTextColor(51, 61, 65, 85, 85);
        const shortWidth =5);
        const shortWidth = doc.getTextWidth(short doc.getTextWidth(short);
        doc);
        doc.text(short, x.text(short, x + doc.getTextWidth + doc.getTextWidth(bullet), current(bullet), currentY);
        
Y);
        
        doc.setFont('        doc.setFont('helvetica', 'helvetica', 'normal');
       normal');
        doc.setTextColor(1 doc.setTextColor(148, 48, 163,163, 184 184);
        doc);
        doc.text(eq, x.text(eq, x + doc.getTextWidth + doc.getTextWidth(bullet) +(bullet) + shortWidth, current shortWidth, currentY);
        
Y);
        
        doc.setFont('        doc.setFont('helvetica', 'italic');
       helvetica', 'italic');
        doc.setTextColor(100,  doc.setTextColor(100, 116,116, 139 139);
        doc);
        doc.text(full, x.text(full, x + doc.getTextWidth + doc.getTextWidth(bullet) +(bullet) + shortWidth + doc.getTextWidth(eq), shortWidth + doc.getTextWidth(eq), currentY, { maxWidth: colWidth currentY, { maxWidth: colWidth - 10 });
        
        - 10 });
        
        col++;
        col++;
        if (col >= if (col >= 3) { 3) {
          col =
          col = 0;
 0;
          currentY +=          currentY += 4;
 4;
        }
             }
      });
      
      });
      
      if (col !== if (col !== 0) current 0) currentY += 4Y += 4;
      doc;
      doc.setFont('helvetica.setFont('helvetica', 'normal');', 'normal');
    }


    }

    currentY +=    currentY += 2;
 2;
    return currentY;
  };    return currentY;
  };

  if (

  if (academicItems.length >academicItems.length > 0) { 0) {
    y =
    y = drawTable('Ac drawTable('Academic Subjects', academicademic Subjects', academicItems, y,Items, y, false, true); false, true);
    y +=
    y += 12; 12;
  }


  }

  if (display  if (displayClinicalItems.length >ClinicalItems.length > 0) { 0) {
    if (
    if (y > 2y > 235) {35) {
      doc.add
      doc.addPage();
     Page();
      y = 2 y = 20;
   0;
    }
    y }
    y = drawTable(' = drawTable('Clinical Rotations &Clinical Rotations & SGT', display SGT', displayClinicalItems, yClinicalItems, y, true, false, true, false);
    y);
    y += 8; += 8;
  }


  }

  if (y > 23  if (y > 235) {
5) {
    doc.addPage    doc.addPage();
    y();
    y = 20 = 20;
  };
  }

  const combined

  const combinedAttended = overallAttended = overallAttended + clinicalAttended + clinicalOverallAttended;OverallAttended;
  const combined
  const combinedTotal = overallTotalTotal = overallTotal + clinicalOverallTotal + clinicalOverallTotal;
  const;
  const combinedPct = combinedPct = combinedTotal ===  combinedTotal === 0 ? 00 ? 0 : (combinedAtt : (combinedAttended / combinedTotalended / combinedTotal) * 1) * 100;

00;

  let academicRemark  let academicRemark = `On Track = `On Track (Target: ${ (Target: ${targetPct}targetPct}%)`;
 %)`;
  if (overallP if (overallPct >= 8ct >= 85) academicRemark5) academicRemark = `Excellent Performance = `Excellent Performance (Above ${target (Above ${targetPct}% TargetPct}% Target)`;
 )`;
  else if (overall else if (overallPct >= targetPct >= targetPct) academicPct) academicRemark = `SRemark = `Satisfactory Attendance (atisfactory Attendance (Meets ${targetMeets ${targetPct}% TargetPct}% Target)`;
 )`;
  else academicRemark = `Attention Required ( else academicRemark = `Attention Required (Below ${targetPBelow ${targetPct}% Required Thresholdct}% Required Threshold)`;

  let clinicalRemark =)`;

  let clinicalRemark = `On Track ( `On Track (Target: ${targetTarget: ${targetPct}%)Pct}%)`;
  if`;
  if (clinicalOverallP (clinicalOverallPct >= 8ct >= 85) clinicalRemark5) clinicalRemark = `Excellent Performance = `Excellent Performance (Above ${target (Above ${targetPct}% TargetPct}% Target)`;
 )`;
  else if (clinical else if (clinicalOverallPct >=OverallPct >= targetPct) targetPct) clinicalRemark = ` clinicalRemark = `Satisfactory AttendanceSatisfactory Attendance (Meets ${ (Meets ${targetPct}%targetPct}% Target)`;
 Target)`;
  else if (  else if (clinicalItems.length >clinicalItems.length > 0 && clinical 0 && clinicalOverallTotal > OverallTotal > 0)
   0)
    clinicalRemark = ` clinicalRemark = `Attention Required (BelowAttention Required (Below ${targetPct ${targetPct}% Required Threshold)`}% Required Threshold)`;
  else;
  else clinicalRemark = ' clinicalRemark = 'No Clinical Data AvailableNo Clinical Data Available';

  const';

  const boxHeight = clinical boxHeight = clinicalItems.length > Items.length > 0 ? 40 ? 44 : 24 : 26;
  doc.setFillColor(6;
  doc.setFillColor(240,240, 253 253, 24, 244);
 4);
  doc.setDrawColor doc.setDrawColor(187(187, 24, 247, 27, 208);
  doc.rounded08);
  doc.roundedRect(15Rect(15, y, page, y, pageWidth - 30, boxHeightWidth - 30, boxHeight, 3, 3, ', 3, 3, 'FD');
 FD');
  doc.setTextColor(2 doc.setTextColor(21, 11, 128, 28, 61);
  doc.setFont('61);
  doc.setFont('helvetica', 'helvetica', 'bold');
 bold');
  doc.setFontSize( doc.setFontSize(11);
11);
  doc.text(`  doc.text(`Overall Percentage: ${Overall Percentage: ${combinedPct.toFixedcombinedPct.toFixed(1)}%(1)}%`, pageWidth /`, pageWidth / 2, y 2, y + 8, + 8, { align: ' { align: 'center' });
center' });
  doc.setFontSize  doc.setFontSize(9);
(9);
  doc.setFont('  doc.setFont('helvetica', 'helvetica', 'normal');
 normal');
  doc.setTextColor(5 doc.setTextColor(51, 61, 65, 85, 85);
 5);
  let summaryY = let summaryY = y + 1 y + 15;
 5;
  doc.text(`Ac doc.text(`Academic Overall Percentage:ademic Overall Percentage: ${overallPct ${overallPct.toFixed(1)}.toFixed(1)}%`, pageWidth%`, pageWidth / 2, / 2, summaryY, { summaryY, { align: 'center align: 'center' });
 ' });
  summaryY +=  summaryY += 7;
 7;
  if (clinicalItems if (clinicalItems.length > 0.length > 0) {
   ) {
    doc.text(`Clinical doc.text(`Clinical Overall Percentage: ${ Overall Percentage: ${clinicalOverallPctclinicalOverallPct.toFixed(1)}.toFixed(1)}%`, pageWidth%`, pageWidth / 2, / 2, summaryY, { summaryY, { align: 'center align: 'center' });
   ' });
    summaryY += 7;
  summaryY += 7;
  }
  doc }
  doc.setTextColor(15.setTextColor(15, 23, 42, 23, 42);
  doc);
  doc.setFont('helvetica.setFont('helvetica', 'bold');
  doc.text', 'bold');
  doc.text(`Academic Remarks(`Academic Remarks: `, 2: `, 21, summaryY1, summaryY + 2); + 2);
  doc.setFont
  doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
  doc.setTextColor(  doc.setTextColor(21, 21, 128,128, 61); 61);
  doc.text
  doc.text(academicRemark,(academicRemark, 55, 55, summaryY +  summaryY + 2);
 2);
  summaryY +=  summaryY += 7;
 7;
  if (clinicalItems if (clinicalItems.length > 0.length > 0) {
   ) {
    doc.setTextColor(1 doc.setTextColor(15, 25, 23, 43, 42);
   2);
    doc.setFont('hel doc.setFont('helvetica', 'bold');
    docvetica', 'bold');
    doc.text(`Clinical Remarks.text(`Clinical Remarks: `, 2: `, 21, summaryY1, summaryY + 2); + 2);
    doc.setFont
    doc.setFont('helvetica',('helvetica', 'normal');
 'normal');
    doc.setTextColor(    doc.setTextColor(21, 128,21, 128, 61); 61);
    doc.text
    doc.text(clinicalRemark(clinicalRemark, 50, 50, summaryY +, summaryY + 2);
 2);
  }
   }
  y += boxHeight y += boxHeight + 6; + 6;

  doc.set

  doc.setDrawColor(2DrawColor(203, 03, 213, 225213, 225);
  doc);
  doc.line(15.line(15, 280, pageWidth, 280, pageWidth - 15 - 15, 28, 280);
 0);
  doc.setFontSize( doc.setFontSize(8);
 8);
  doc.setTextColor(1 doc.setTextColor(148, 48, 163,163, 184 184);
  doc);
  doc.text('Generated by.text('Generated by Attendance Tracker •  Attendance Tracker • 100%100% Local Device Privacy', Local Device Privacy', pageWidth /  pageWidth / 2, 22, 285, {85, { align: 'center align: 'center' });

 ' });

  doc.save(`Attendance doc.save(`Attendance_Report_${new Date_Report_${new Date().toISOString().slice().toISOString().slice(0, 10)}.pdf(0, 10)}.pdf`);
}`);
}

export

export function generateExcelReport function generateExcelReport(options: ExportReport(options: ExportReportOptions) {
Options) {
  const {
  const {
    studentName,    studentName,
    routineMode
    routineMode,
    filter,
    filterTitle,
   Title,
    items,
    items,
    overallAttended, overallAttended,
    overallTotal
    overallTotal,
    overall,
    overallPct,
Pct,
    targetPct    targetPct,
  },
  } = options;

 = options;

  const academicItems  const academicItems = items.filter(item = items.filter(item => !item.name => !item.name.includes('(Ward.includes('(Ward)') && !)') && !item.name.includes('(item.name.includes('(SGT)'));SGT)'));
  const clinical
  const clinicalItems = items.filterItems = items.filter(item => item.name(item => item.name.includes('(Ward)') || item.includes('(Ward)') || item.name.includes('(SG.name.includes('(SGT)'));
T)'));
  const displayClinical  const displayClinicalItems = clinicalItemsItems = clinicalItems.map(item => ({.map(item => ({
    ...item
    ...item,
    name,
    name: item.name.replace: item.name.replace(/ \(Ward(/ \(Ward\)$/, '')\)$/, '')
  }));
  }));

  const clinical

  const clinicalOverallAttended =OverallAttended = clinicalItems.reduce(( clinicalItems.reduce((acc, curr)acc, curr) => acc + curr => acc + curr.attended, .attended, 0);
 0);
  const clinicalOverallTotal const clinicalOverallTotal = clinicalItems.reduce = clinicalItems.reduce((acc, curr((acc, curr) => acc +) => acc + curr.total,  curr.total, 0);
 0);
  const clinicalOverallP const clinicalOverallPct = clinicalOverallct = clinicalOverallTotal > 0 ? (clinicalOverallTotal > 0 ? (clinicalOverallAttended / clinicalAttended / clinicalOverallTotal) *OverallTotal) * 100 100 : 0; : 0;

  const workbook

  const workbook = XLSX = XLSX.utils.book_new();.utils.book_new();

  if (

  if (academicItems.length >academicItems.length > 0) { 0) {
    const rows
    const rows = academicItems.map = academicItems.map(item => {
(item => {
      const conducted =      const conducted = item.total;
 item.total;
      const attended =      const attended = item.attended; item.attended;
      const planned
      const plannedTotal = item.plannedTotal;
Total = item.plannedTotal;
      const target = targetPct;      const target = targetPct;
      let remark
      let remark1 = '';
1 = '';
      let remark2      let remark2 = '';
      = '';
      if (conducted if (conducted === 0) === 0) {
        remark {
        remark1 = 'Yet1 = 'Yet to be Conducted to be Conducted';
        remark';
        remark2 = 'Yet2 = 'Yet to be Conducted to be Conducted';
      }';
      } else {
        else {
        const pct = ( const pct = (attended / conducted)attended / conducted) * 10 * 100;
       0;
        if (pct if (pct >= target) remark >= target) remark1 = 'Target1 = 'Target Achieved';
 Achieved';
        else {
          const needed =        else {
          const needed = Math.ceil((target Math.ceil((target * conducted) / * conducted) / 100 100) - attended;) - attended;
          remark1
          remark1 = needed >  = needed > 0 ? `Attend0 ? `Attend next ${needed} next ${needed} ${needed ===  ${needed === 1 ? 'Class1 ? 'Class' : 'Classes' : 'Classes'}` : ''}` : 'Target Achieved';Target Achieved';
        }

        }
        if (pl        if (plannedTotal > annedTotal > 0) {
0) {
          const totalNeeded          const totalNeeded = Math.ceil(( = Math.ceil((target * plannedTotaltarget * plannedTotal) / 1) / 100);
00);
          if (attended          if (attended >= totalNeeded) >= totalNeeded) remark2 = ' remark2 = 'Target Achieved';Target Achieved';
          else {
          else {
            const remaining
            const remaining = plannedTotal - = plannedTotal - conducted;
            conducted;
            const neededFromRemaining const neededFromRemaining = totalNeeded - = totalNeeded - attended;
            const canMiss = attended;
            const canMiss = remaining - neededFrom remaining - neededFromRemaining;
           Remaining;
            if (canMiss if (canMiss > 0) > 0) remark2 = ` remark2 = `Can miss ${canCan miss ${canMiss}`;
Miss}`;
            else if (            else if (canMiss === canMiss === 0) {
0) {
              const classText              const classText = remaining ===  = remaining === 1 ? 'Class1 ? 'Class' : 'Classes' : 'Classes';
              remark';
              remark2 = `Must2 = `Must Attend remaining ${remaining Attend remaining ${remaining} ${classText} ${classText}`;
           }`;
            } else remark2 } else remark2 = 'Better Luck = 'Better Luck Next Life';
 Next Life';
          }
                 }
        } else remark2 } else remark2 = 'No Planned Classes';
        = 'No Planned Classes';
        if (remark1 if (remark1 === remark2) === remark2) remark2 = '';
      }
 remark2 = '';
      }
      return {
        Subject: item      return {
        Subject: item.name,
       .name,
        'Class Conducted 'Class Conducted': conducted === ': conducted === 0 ? 'Yet0 ? 'Yet to be Conducted to be Conducted' : conducted,' : conducted,
        Present:
        Present: conducted === 0 conducted === 0 ? '' : attended ? '' : attended,
        ',
        'To Reach Preferred %To Reach Preferred %': remark1,': remark1,
        'Based
        'Based on Planned Classes': on Planned Classes': remark2,
 remark2,
        'Current %        'Current %': conducted === ': conducted === 0 ? '' :0 ? '' : Number(item.pct Number(item.pct.toFixed(1)),.toFixed(1)),
      };

      };
    });
       });
    rows.push({
 rows.push({
      Subject: '      Subject: 'ACADEMIC SUMMARY',
      'Class Conducted': overallTotal,
      Present: overallAttended,
      'To Reach Preferred %': overallPct >= targetPct ? 'ACADEMIC SUMMARY',
      'Class Conducted': overallTotal,
      Present: overallAttended,
      'To Reach Preferred %': overallPct >= targetPct ? 'Target Achieved'Target Achieved' : 'Action Needed : 'Action Needed',
      '',
      'Based on Planned ClassesBased on Planned Classes': overallPct': overallPct >= targetPct >= targetPct ? 'Target Achie ? 'Target Achieved' : 'ved' : 'Action Needed',
Action Needed',
      'Current %      'Current %': Number(overall': Number(overallPct.toFixed(Pct.toFixed(1)),
   1)),
    });
    const });
    const ws = XLS ws = XLSX.utils.json_toX.utils.json_to_sheet(rows);
_sheet(rows);
    ws['!    ws['!cols'] = [{cols'] = [{ wch:  wch: 32 }, {32 }, { wch:  wch: 18 }, { wch: 18 }, { wch: 15 }, {15 }, { wch:  wch: 22 }, {22 }, { wch:  wch: 28 }, {28 }, { wch:  wch: 16 }];16 }];
    XLS
    XLSX.utils.book_appendX.utils.book_append_sheet(workbook,_sheet(workbook, ws, 'Ac ws, 'Academic Subjects');
ademic Subjects');
  }

  if (displayClinical  }

  if (displayClinicalItems.length > 0) {
Items.length > 0) {
    const rows =    const rows = displayClinicalItems.map displayClinicalItems.map(item => {
      const conducted =(item => {
      const conducted = item.total;
 item.total;
      const attended =      const attended = item.attended; item.attended;
      const planned
      const plannedTotal = item.plTotal = item.plannedTotal;
annedTotal;
      const target =      const target = targetPct; targetPct;
      let remark
      let remark1 = '';
1 = '';
      let remark2      let remark2 = '';
      = '';
      if (conducted if (conducted === 0) === 0) {
        remark {
        remark1 = 'Yet1 = 'Yet to be Conducted to be Conducted';
        remark';
        remark2 = 'Yet2 = 'Yet to be Conducted to be Conducted';
      }';
      } else {
        else {
        const pct = ( const pct = (attended / conducted)attended / conducted) * 10 * 100;
       0;
        if (pct >= target) remark if (pct >= target) remark1 = 'Target1 = 'Target Achieved';
 Achieved';
        else {
        else {
          const needed =          const needed = Math.ceil((target Math.ceil((target * conducted) / * conducted) / 100 100) - attended;) - attended;
          remark1
          remark1 = needed >  = needed > 0 ? `Attend0 ? `Attend next ${needed} next ${needed} ${needed === 1 ? 'Class ${needed === 1 ? 'Class' : 'Classes' : 'Classes'}` : ''}` : 'Target Achieved';Target Achieved';
        }

        }
        if (pl        if (plannedTotal > annedTotal > 0) {
0) {
          const totalNeeded          const totalNeeded = Math.ceil(( = Math.ceil((target * plannedTotaltarget * plannedTotal) / 1) / 100);
00);
          if (attended          if (attended >= totalNeeded) >= totalNeeded) remark2 = ' remark2 = 'Target Achieved';Target Achieved';
          else {
            const remaining
          else {
            const remaining = plannedTotal - = plannedTotal - conducted;
            conducted;
            const neededFromRemaining const neededFromRemaining = totalNeeded - = totalNeeded - attended;
            attended;
            const canMiss = const canMiss = remaining - neededFrom remaining - neededFromRemaining;
           Remaining;
            if (canMiss if (canMiss > 0) > 0) remark2 = ` remark2 = `Can miss ${canCan miss ${canMiss}`;
Miss}`;
            else if (            else if (canMiss === canMiss === 0) {
0) {
              const classText              const classText = remaining ===  = remaining === 1 ? 'Class1 ? 'Class' : 'Classes' : 'Classes';
              remark';
              remark2 = `Must2 = `Must Attend remaining ${remaining Attend remaining ${remaining} ${classText} ${classText}`;
           }`;
            } else remark2 } else remark2 = 'Better Luck = 'Better Luck Next Life';
 Next Life';
          }
                 }
        } else remark2 } else remark2 = 'No Planned = 'No Planned Classes';
        Classes';
        if (remark1 if (remark1 === remark2) === remark2) remark2 = ''; remark2 = '';
      }

      }
      return {
      return {
        'Rotation /        'Rotation / SGT': item SGT': item.name,
       .name,
        'Class Conducted 'Class Conducted': conducted === ': conducted === 0 ? 'Yet0 ? 'Yet to be Conducted to be Conducted' : conducted,' : conducted,
        Present:
        Present: conducted === 0 conducted === 0 ? '' : attended ? '' : attended,
        ',
        'To Reach Preferred %To Reach Preferred %': remark1,': remark1,
        'Based
        'Based on Planned Classes': on Planned Classes': remark2,
 remark2,
        'Current %        'Current %': conducted === ': conducted === 0 ? '' :0 ? '' : Number(item.pct Number(item.pct.toFixed(1)),.toFixed(1)),
      };

      };
    });
       });
    rows.push({
 rows.push({
      'Rotation /      'Rotation / SGT': ' SGT': 'CLINICAL SUMMARY',
      'CLINICAL SUMMARY',
      'Class Conducted':Class Conducted': clinicalOverallTotal, clinicalOverallTotal,
      Present:
      Present: clinicalOverallAttended clinicalOverallAttended,
      'To Reach Preferred %,
      'To Reach Preferred %': clinicalOverallP': clinicalOverallPct >= targetPct >= targetPct ? 'Targetct ? 'Target Achieved' : Achieved' : 'Action Needed',
      'Based 'Action Needed',
      'Based on Planned Classes': on Planned Classes': clinicalOverallPct clinicalOverallPct >= targetPct >= targetPct ? 'Target Achie ? 'Target Achieved' : 'ved' : 'Action Needed',
Action Needed',
      'Current %': Number(clin      'Current %': Number(clinicalOverallPcticalOverallPct.toFixed(1)),.toFixed(1)),
    });

    });
    const ws =    const ws = XLSX.utils XLSX.utils.json_to_sheet(rows.json_to_sheet(rows);
    ws);
    ws['!cols']['!cols'] = [{ wch = [{ wch: 32: 32 }, { wch }, { wch: 18: 18 }, { wch }, { wch: 15: 15 }, { wch }, { wch: 22: 22 }, { wch }, { wch: 28: 28 }, { wch }, { wch: 16: 16 }];
    }];
    XLSX.utils XLSX.utils.book_append_sheet(work.book_append_sheet(workbook, ws,book, ws, 'Clinical Rotations 'Clinical Rotations');
  }');
  }

  const combined

  const combinedAttended = overallAttended = overallAttended + clinicalAttended + clinicalOverallAttended;OverallAttended;
  const combined
  const combinedTotal = overallTotalTotal = overallTotal + clinicalOverallTotal + clinicalOverallTotal;
  const;
  const combinedPct = combinedPct = combinedTotal ===  combinedTotal === 0 ? 00 ? 0 : (combinedAtt : (combinedAttended / combinedTotalended / combinedTotal) * 1) * 100;
00;
  const meta =  const meta = [
    { [
    { Property: 'Student Property: 'Student Name', Value: Name', Value: studentName || ' studentName || 'Medical Student' },Medical Student' },
    { Property
    { Property: 'Routine Mode: 'Routine Mode', Value: routine', Value: routineMode },
   Mode },
    { Property: ' { Property: 'Export Scope', ValueExport Scope', Value: filterTitle },: filterTitle },
    { Property
    { Property: 'Minimum Target: 'Minimum Target (%)', Value: (%)', Value: `${targetPct `${targetPct}%` },
}%` },
    { Property:    { Property: 'Overall Percentage', 'Overall Percentage', Value: `${combined Value: `${combinedPct.toFixed(Pct.toFixed(1)}%`1)}%` },
    { },
    { Property: 'Ac Property: 'Academic Overall Percentage',ademic Overall Percentage', Value: `${overall Value: `${overallPct.toFixed(Pct.toFixed(1)}%`1)}%` },
    { Property: 'Clinical },
    { Property: 'Clinical Overall Percentage', Value Overall Percentage', Value: `${clinicalOverall: `${clinicalOverallPct.toFixed(Pct.toFixed(1)}%`1)}%` },
    { },
    { Property: 'Ac Property: 'Academic Remarks', Valueademic Remarks', Value: overallPct: overallPct >= targetPct >= targetPct ? 'Target Achie ? 'Target Achieved' : 'ved' : 'Action Needed' },Action Needed' },
    { Property
    { Property: 'Clinical Remarks: 'Clinical Remarks', Value: clinical', Value: clinicalOverallPct >=OverallPct >= targetPct ? targetPct ? 'Target Achieved 'Target Achieved' : 'Action' : 'Action Needed' },
 Needed' },
    { Property:    { Property: 'Generated Date', 'Generated Date', Value: new Date Value: new Date().toLocaleString()().toLocaleString() },
  ]; },
  ];
  const meta
  const metaSheet = XLSSheet = XLSX.utils.json_toX.utils.json_to_sheet(meta);
_sheet(meta);
  metaSheet['  metaSheet['!cols'] = [{ wch:!cols'] = [{ wch: 24 }, 24 }, { wch: { wch: 40 } 40 }];
  X];
  XLSX.utils.bookLSX.utils.book_append_sheet(workbook_append_sheet(workbook, metaSheet,, metaSheet, 'Report Metadata'); 'Report Metadata');
  XLS
  XLSX.writeFile(workbookX.writeFile(workbook, `Attendance_Report, `Attendance_Report_${new Date()._${new Date().toISOString().slice(toISOString().slice(0, 10, 10)}.xlsx`0)}.xlsx`);
}

);
}

export function generateCSVexport function generateCSVReport(options: ExportReport(options: ExportReportOptions) {ReportOptions) {
  const {
  const { items, overallAtt items, overallAttended, overallTotalended, overallTotal } = options;

  const academic } = options;

  const academicItems = items.filter(item => !itemItems = items.filter(item => !item.name.includes('(Ward)') &&.name.includes('(Ward)') && !item.name.includes !item.name.includes('(SGT)('(SGT)'));
  const'));
  const clinicalItems = items clinicalItems = items.filter(item => item.filter(item => item.name.includes('(W.name.includes('(Ward)') ||ard)') || item.name.includes('( item.name.includes('(SGT)'));SGT)'));
  const display
  const displayClinicalItems = clinicalClinicalItems = clinicalItems.map(item =>Items.map(item => ({
    ... ({
    ...item,
   item,
    name: item.name name: item.name.replace(/ \(W.replace(/ \(Ward\)$/,ard\)$/, '')
  } '')
  }));

  const));

  const clinicalOverallAttended clinicalOverallAttended = clinicalItems.reduce = clinicalItems.reduce((acc, curr((acc, curr) => acc +) => acc + curr.attended, curr.attended, 0);
 0);
  const clinicalOverall  const clinicalOverallTotal = clinicalItemsTotal = clinicalItems.reduce((acc,.reduce((acc, curr) => acc curr) => acc + curr.total, + curr.total, 0);
 0);
  const combinedAtt  const combinedAttended = overallAttended = overallAttended + clinicalOverallended + clinicalOverallAttended;
Attended;
  const combinedTotal  const combinedTotal = overallTotal + = overallTotal + clinicalOverallTotal; clinicalOverallTotal;
  const combinedPct = combined
  const combinedPct = combinedTotal === 0Total === 0 ? 0 : ? 0 : (combinedAttended (combinedAttended / combinedTotal) / combinedTotal) * 10 * 100;

 0;

  const headers = [' const headers = ['Type', 'SubjectType', 'Subject/Rotation', '/Rotation', 'Class Conducted',Class Conducted', 'Present', ' 'Present', 'To Reach Preferred %To Reach Preferred %', 'Based on', 'Based on Planned Classes', ' Planned Classes', 'Current %'];
Current %'];
  const rows:  const rows: any[] = []; any[] = [];

  academicItems

  academicItems.forEach(i => {.forEach(i => {
    rows.push
    rows.push([
      '([
      'Academic',
Academic',
      `"${i      `"${i.name.replace(/"/.name.replace(/"/g, '""g, '""')}"`,
')}"`,
      i.total ===      i.total === 0 ? ' 0 ? 'Yet to be ConductYet to be Conducted' : ied' : i.total,
     .total,
      i.total ===  i.total === 0 ? '' :0 ? '' : i.attended, i.attended,
      i.total
      i.total === 0 ? === 0 ? '' : `"${ '' : `"${i.neededFori.neededForTarget}"`,
Target}"`,
      i.total ===      i.total === 0 ? '' 0 ? '' : `"${i : `"${i.neededForTarget.neededForTarget}"`,
     }"`,
      i.total ===  i.total === 0 ? '' :0 ? '' : i.pct.toFixed i.pct.toFixed(1),
(1),
    ]);
     ]);
  });

  display });

  displayClinicalItems.forEach(iClinicalItems.forEach(i => {
    => {
    rows.push([
 rows.push([
      'Clinical',      'Clinical',
      `"${
      `"${i.name.replace(/i.name.replace(/"/g, '""')}"`,"/g, '""')}"`,
      i.total
      i.total === 0 ? === 0 ? 'Yet to be 'Yet to be Conducted' : Conducted' : i.total,
 i.total,
      i.total ===      i.total === 0 ? '' 0 ? '' : i.attended : i.attended,
      i,
      i.total === 0.total === 0 ? '' : `"${i.needed ? '' : `"${i.neededForTarget}"`,ForTarget}"`,
      i.total
      i.total === 0 ? === 0 ? '' : `"${ '' : `"${i.neededFori.neededForTarget}"`,
Target}"`,
      i.total ===      i.total === 0 ? '' 0 ? '' : i.pct : i.pct.toFixed(1),.toFixed(1),
    ]);

    ]);
  });

   });

  rows.push([
 rows.push([
    'SUMMARY    'SUMMARY',
    '"',
    '"Combined Total"',
Combined Total"',
    combinedTotal,    combinedTotal,
    combinedAtt
    combinedAttended,
   ended,
    '"Combined Summary"', '"Combined Summary"',
    '"Combined
    '"Combined Summary"',
    Summary"',
    combinedPct.toFixed combinedPct.toFixed(1),
(1),
  ]);

   ]);

  const csvContent = const csvContent = [headers.join(',' [headers.join(','), ...rows.map), ...rows.map(r => r.join(r => r.join(','))].join(','))].join('\n');
('\n');
  const blob =  const blob = new Blob([csv new Blob([csvContent], { typeContent], { type: 'text/csv: 'text/csv;charset=utf-8;charset=utf-8;' });
 ;' });
  const url = URL const url = URL.createObjectURL(blob);.createObjectURL(blob);
  const link
  const link = document.createElement(' = document.createElement('a');
 a');
  link.href = url link.href = url;
  link;
  link.download = `Attendance.download = `Attendance_Report_${new Date_Report_${new Date().toISOString().slice().toISOString().slice(0, (0, 10)}.csv10)}.csv`;
  document`;
  document.body.appendChild(link);.body.appendChild(link);
  link.click
  link.click();
  document();
  document.body.removeChild(link);.body.removeChild(link);
  URL.re
  URL.revokeObjectURL(urlvokeObjectURL(url);
}
);
}
