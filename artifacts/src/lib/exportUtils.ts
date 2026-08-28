
import { getAttendanceStatus, type AttendanceStatus } from '@/lib/utils';

export interface AttendanceReportItem {
  name: string;
  category?: string;
  attended: number;
  total: number;
  plannedTotal: number;
  pct: number;
  neededForTarget: string;
  isFinished?: boolean;
  attendanceKey?: string;
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
  pdfTargetWindow?: Window | null;
}

const EXPORT_FILENAME_BASE = 'AttendenzTracker Report';

const isClinicalReportItem = (item: AttendanceReportItem): boolean => {
  const category = (item.category || '').toLowerCase();
  return Boolean(item.name.match(/ \((ward|sgt)\)$/i))
    || category.includes('clinical')
    || category.includes('ward')
    || category.includes('sgt');
};

const getReportStatus = (item: AttendanceReportItem, targetPct: number): {
  status: AttendanceStatus;
  label: string;
  guidance: string;
  isFinished: boolean;
} => {
  const hasPlannedClasses = item.plannedTotal > 0;
  const isFinished = hasPlannedClasses && (item.isFinished === true || item.total >= item.plannedTotal);
  const status = getAttendanceStatus(item.pct, targetPct, { isFinished, hasPlannedClasses });
  if (status === 'neutral') return { status, label: 'No Planned Classes', guidance: '', isFinished: false };
  if (isFinished) {
    return {
      status,
      label: status === 'green' ? 'Completed — Meets Threshold' : 'Completed — Below Threshold',
      guidance: '',
      isFinished: true,
    };
  }
  if (status === 'green') return { status, label: 'On Track', guidance: 'No attendance action required.', isFinished: false };
  if (status === 'yellow') return { status, label: 'Need Attention', guidance: 'Attend upcoming Classes to protect your attendance percentage.', isFinished: false };
  const remaining = Math.max(0, item.plannedTotal - item.total);
  const required = Math.max(0, Math.ceil((targetPct * item.plannedTotal) / 100) - item.attended);
  const guidance = required > remaining && remaining > 0
    ? 'Attend all remaining Classes; the preferred percentage cannot be restored.'
    : remaining > 0
      ? 'Attend upcoming Classes to protect your attendance percentage.'
      : 'Below the preferred percentage.';
  return { status, label: 'Must Attend', guidance, isFinished: false };
};

const reportItemsByKind = (items: AttendanceReportItem[]) => ({
  academic: items.filter(item => !isClinicalReportItem(item)),
  clinical: items.filter(isClinicalReportItem),
});

const getExportRow = (item: AttendanceReportItem, targetPct: number) => {
  const status = getReportStatus(item, targetPct);
  return {
    conducted: item.total,
    present: item.total > 0 ? item.attended : '',
    status: status.label,
    guidance: status.guidance || status.label,
    percentage: item.total > 0 ? Number(item.pct.toFixed(1)) : '',
  };
};

const getConductedDisplay = (row: ReturnType<typeof getExportRow>): string | number => {
  if (row.status === 'No Planned Classes') return 'No Planned Classes';
  return row.conducted === 0 ? 'Not Conducted Yet' : row.conducted;
};

// ── Shortened subject map ──
const SHORTEN_MAP: Record<string, string> = {
  'Surgery': 'Surg.',
  'General Surgery': 'Gen. Surg.',
  'Obstetrics & Gynaecology': 'Obs & Gyn.',
  'Pediatrics': 'Peds.',
  'Orthopedics': 'Ortho.',
  'Orthopaedics': 'Ortho.',
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

/**
 * Smart shortening:
 * - If the full name fits the column (<= 20 chars), use the full name (no legend entry).
 * - If it doesn't fit, apply the abbreviation map and flag it for the legend.
 */
function shortenSubject(name: string): { display: string; wasShortened: boolean; shortForm: string; fullForm: string } {
  const sgtMatch = name.match(/^(.+?)\s*\(SGT\)$/);
  let base = name;
  let tag = '';

  if (sgtMatch) {
    base = sgtMatch[1];
    tag = ' (SGT)';
  }

  const mappedBase = SHORTEN_MAP[base] || base;
  const fullDisplay = base + tag;
  const shortDisplay = mappedBase + tag;

  if (fullDisplay.length <= 20) {
    return { display: fullDisplay, wasShortened: false, shortForm: '', fullForm: '' };
  }

  return { display: shortDisplay, wasShortened: true, shortForm: mappedBase, fullForm: base };
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

/** Convert only edge-connected near-white pixels to transparency, preserving white details inside the icon. */
async function prepareLogoForPdf(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(img, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const nearWhite = (index: number) => data[index] > 238 && data[index + 1] > 238 && data[index + 2] > 238;
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const index = pixel * 4;
    if (!nearWhite(index)) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data[pixel * 4 + 3] = 0;
    add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Crop a profile image to the passport-frame aspect ratio, covering the frame without letterbox bands. */
async function preparePassportPhoto(dataUrl: string, targetAspect: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;
  if (sourceAspect > targetAspect) {
    cropWidth = Math.max(1, Math.round(sourceHeight * targetAspect));
    cropX = Math.round((sourceWidth - cropWidth) / 2);
  } else if (sourceAspect < targetAspect) {
    cropHeight = Math.max(1, Math.round(sourceWidth / targetAspect));
    cropY = Math.round((sourceHeight - cropHeight) / 2);
  }
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function isStandalonePWA(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

async function handoffPDFForIOSPWA(doc: { output: (type: 'blob') => Blob }, filename: string, targetWindow?: Window | null): Promise<void> {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text: 'Attendenz attendance report' });
      URL.revokeObjectURL(url);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        URL.revokeObjectURL(url);
        return;
      }
    }
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    // iOS standalone can block both popup and download-anchor behavior. A direct
    // navigation still opens the PDF viewer and lets the user use its Share/Save UI.
    window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

  const { academic: academicItems, clinical: clinicalItems } = reportItemsByKind(items);
  const clinicalDisplayItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/i, ''),
  }));
  const academicAttended = academicItems.reduce((sum, item) => sum + item.attended, 0);
  const academicTotal = academicItems.reduce((sum, item) => sum + item.total, 0);
  const academicPct = academicTotal > 0 ? (academicAttended / academicTotal) * 100 : 0;
  const clinicalAttended = clinicalItems.reduce((sum, item) => sum + item.attended, 0);
  const clinicalTotal = clinicalItems.reduce((sum, item) => sum + item.total, 0);
  const clinicalPct = clinicalTotal > 0 ? (clinicalAttended / clinicalTotal) * 100 : 0;

  let logoBase64 = '';
  let logoFormat: 'PNG' | 'JPEG' = 'PNG';
  let logoDimensions = { width: 1, height: 1 };
  try {
    const sourceLogo = await loadImageAsBase64('/Logo.jpeg');
    logoBase64 = await prepareLogoForPdf(sourceLogo);
    logoDimensions = await getImageDimensions(logoBase64);
  } catch {
    logoBase64 = '';
    logoFormat = 'JPEG';
  }

  let photoBase64 = '';
  let photoDimensions = { width: 1, height: 1 };
  try {
    if (options.profileImage) {
      const sourcePhoto = options.profileImage.startsWith('data:') ? options.profileImage : await loadImageAsBase64(options.profileImage);
      photoBase64 = await preparePassportPhoto(sourcePhoto, 25 / 34);
      photoDimensions = await getImageDimensions(photoBase64);
    }
  } catch {
    photoBase64 = '';
  }

  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const navy = [15, 23, 42] as const;
  const teal = [13, 148, 136] as const;
  const slate = [71, 85, 105] as const;
  const muted = [100, 116, 139] as const;
  const border = [203, 213, 225] as const;
  const pale = [248, 250, 252] as const;

  const statusColor = (status: AttendanceStatus): readonly [number, number, number] => {
    if (status === 'green') return [5, 150, 105];
    if (status === 'yellow') return [217, 119, 6];
    if (status === 'red') return [190, 24, 93];
    return [100, 116, 139];
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text('Attendenz Tracker  |  Attendance Record', margin, pageHeight - 10);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  const drawHeader = (firstPage: boolean) => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 34, 'F');
    if (logoBase64) {
      const logoH = 19;
      const logoW = Math.max(12, logoH * (logoDimensions.width / Math.max(1, logoDimensions.height)));
      doc.addImage(logoBase64, logoFormat, margin, 7, Math.min(24, logoW), logoH);
    } else {
      doc.setFillColor(30, 64, 175);
      doc.roundedRect(margin, 8, 18, 18, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('AT', margin + 9, 19.5, { align: 'center' });
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(firstPage ? 18 : 13);
    doc.text('ATTENDANCE RECORD', margin + 28, firstPage ? 15 : 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(226, 232, 240);
    doc.text(firstPage ? 'Official Academic & Clinical attendance Summary' : 'Attendenz Tracker  |  Continued', margin + 28, firstPage ? 22 : 21);
  };

  const addPageWithHeader = () => {
    doc.addPage();
    drawHeader(false);
    return 45;
  };

  drawHeader(true);
  let y = 43;

  const now = new Date();
  const exportedAt = `${String(now.getDate()).padStart(2, '0')}-${now.toLocaleString('en-US', { month: 'short' })}-${String(now.getFullYear()).slice(-2)} at ${now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  const infoX = margin;
  const infoY = y;
  const infoH = 42;
  doc.setFillColor(...pale);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.25);
  doc.roundedRect(infoX, infoY, contentWidth, infoH, 3, 3, 'FD');

  const infoTextX = infoX + (photoBase64 ? 37 : 6);
  const metaRight = infoX + contentWidth - 6;
  const infoAvailableW = metaRight - infoTextX;
  if (photoBase64) {
    // Passport-style portrait: the image and its border are the visual focus, without a dead panel around it.
    const photoBoxW = 25;
    const photoBoxH = 34;
    const photoX = infoX + 6;
    const photoY = infoY + (infoH - photoBoxH) / 2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.2);
    doc.roundedRect(photoX, photoY, photoBoxW, photoBoxH, 1.8, 1.8, 'FD');
    const ratio = photoDimensions.width / Math.max(1, photoDimensions.height);
    const photoW = ratio >= photoBoxW / photoBoxH ? photoBoxW : photoBoxH * ratio;
    const photoH = ratio >= photoBoxW / photoBoxH ? photoBoxW / ratio : photoBoxH;
    doc.addImage(photoBase64, photoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG', photoX + (photoBoxW - photoW) / 2, photoY + (photoBoxH - photoH) / 2, photoW, photoH);
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.55);
    doc.roundedRect(photoX, photoY, photoBoxW, photoBoxH, 1.8, 1.8, 'S');
  }

  const identityWidth = Math.max(48, infoAvailableW - 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...teal);
  doc.text('STUDENT IDENTITY', infoTextX, infoY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...navy);
  doc.text(doc.splitTextToSize(studentName || 'Name Not Provided', identityWidth).slice(0, 1), infoTextX, infoY + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...muted);
  doc.text(`Attendance Summary  |  ${filterTitle}`, infoTextX, infoY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...slate);
  const generatedLabel = 'Generated Date & Time:';
  const generatedX = metaRight - 72;
  doc.text(generatedLabel, generatedX, infoY + 7);
  const generatedLabelWidth = doc.getTextWidth(generatedLabel) + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...navy);
  doc.text(exportedAt, generatedX + generatedLabelWidth, infoY + 7);

  doc.setDrawColor(...border);
  doc.setLineWidth(0.2);
  doc.line(infoTextX, infoY + 20.5, metaRight, infoY + 20.5);
  const recordType = clinicalItems.length > 0 ? 'Academic + Clinical' : 'Academic';
  const fields: Array<[string, string]> = [
    ['Programme', routineMode],
    ['Report Scope', filterTitle],
    ['Attendance Target', `${targetPct}%`],
    ['Record Type', recordType],
  ];
  const fieldW = (infoAvailableW - 10) / 2;
  fields.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const fieldX = infoTextX + column * (fieldW + 10);
    const rowY = infoY + 25.5 + row * 9;
    const labelText = `${label.toUpperCase()}:`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...teal);
    doc.text(labelText, fieldX, rowY);
    const labelWidth = doc.getTextWidth(labelText) + 2.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...navy);
    doc.text(doc.splitTextToSize(value, Math.max(18, fieldW - labelWidth - 2)).slice(0, 1), fieldX + labelWidth, rowY);
  });
  y += infoH + 8;

  const statusLabel = (item: AttendanceReportItem) => getReportStatus(item, targetPct);
  const drawSection = (title: string, sectionItems: AttendanceReportItem[], clinical: boolean): void => {
    if (sectionItems.length === 0) return;
    const sectionAccent = clinical ? [30, 64, 175] as const : [4, 120, 87] as const;
    const sectionTitle = clinical ? 'Clinical Rotations and Small Group Teaching' : title;
    const itemColumn = clinical ? 'Rotation / SGT' : 'Subject';
    const cols = [
      { label: itemColumn, width: 53 },
      { label: 'Conducted', width: 20 },
      { label: 'Present', width: 18 },
      { label: 'Planned', width: 18 },
      { label: 'Current %', width: 22 },
      { label: 'Status / Remarks', width: contentWidth - 131 },
    ];
    const drawTableHeader = () => {
      doc.setFillColor(...sectionAccent);
      doc.rect(margin, y, contentWidth, 10, 'F');
      let x = margin;
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      cols.forEach(col => {
        doc.text(col.label, x + col.width / 2, y + 6.5, { align: 'center' });
        x += col.width;
      });
      y += 10;
    };

    if (y > pageHeight - 78) y = addPageWithHeader();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(...navy);
    doc.text(sectionTitle, margin, y);
    y += 5;
    drawTableHeader();

    sectionItems.forEach((item, idx) => {
      const reportStatus = statusLabel(item);
      const guidance = reportStatus.guidance || reportStatus.label;
      const guidanceLines = doc.splitTextToSize(guidance, cols[5].width - 5).slice(0, 2);
      const rowH = Math.max(10, guidanceLines.length * 4.1 + 4);
      if (y + rowH > pageHeight - 23) {
        y = addPageWithHeader();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...navy);
        doc.text(`${sectionTitle} (continued)`, margin, y);
        y += 5;
        drawTableHeader();
      }
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(...border);
      doc.setLineWidth(0.25);
      doc.rect(margin, y, contentWidth, rowH, 'S');
      let x = margin;
      cols.slice(0, -1).forEach(col => {
        x += col.width;
        doc.line(x, y, x, y + rowH);
      });
      const centerY = y + rowH / 2 + 1.5;
      const displayName = shortenSubject(item.name).display;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      doc.setTextColor(...navy);
      doc.text(doc.splitTextToSize(displayName, cols[0].width - 4).slice(0, 2), margin + cols[0].width / 2, centerY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.6);
      doc.setTextColor(...slate);
      const values = [item.total === 0 ? '—' : String(item.total), item.total === 0 ? '—' : String(item.attended), item.plannedTotal > 0 ? String(item.plannedTotal) : '—', item.total > 0 ? `${item.pct.toFixed(1)}%` : '—'];
      let valueX = margin + cols[0].width;
      values.forEach((value, valueIndex) => {
        const width = cols[valueIndex + 1].width;
        if (valueIndex === 3) doc.setTextColor(...statusColor(reportStatus.status));
        doc.text(value, valueX + width / 2, centerY, { align: 'center' });
        valueX += width;
      });
      const statusX = margin + contentWidth - cols[5].width + 3;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...statusColor(reportStatus.status));
      doc.text(reportStatus.label, statusX, y + 4.4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...slate);
      doc.text(guidanceLines, statusX, y + 8.1);
      y += rowH;
    });
    y += 8;
  };

  drawSection('Academic Subjects', academicItems, false);
  drawSection('Clinical Rotations and Small Group Teaching', clinicalDisplayItems, true);

  if (y > pageHeight - 93) y = addPageWithHeader();
  const overallReportItem: AttendanceReportItem = {
    name: 'Overall Attendance',
    attended: overallAttended,
    total: overallTotal,
    plannedTotal: items.reduce((sum, item) => sum + item.plannedTotal, 0),
    pct: overallPct,
    neededForTarget: '',
  };
  const overallStatus = getReportStatus(overallReportItem, targetPct);
  const summaryH = clinicalItems.length > 0 ? 55 : 43;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(margin, y, contentWidth, summaryH, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.setFontSize(11);
  doc.text('Attendance Summary', margin + 6, y + 9);
  doc.setFontSize(18);
  doc.setTextColor(...statusColor(overallStatus.status));
  doc.text(`${overallPct.toFixed(1)}%`, pageWidth - margin - 6, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text(`Overall attendance  |  Preferred threshold: ${targetPct}%`, pageWidth - margin - 6, y + 15, { align: 'right' });
  doc.setDrawColor(191, 219, 254);
  doc.line(margin + 6, y + 20, pageWidth - margin - 6, y + 20);

  const summaryRows: Array<[string, string, string]> = [
    ['Academic', `${academicAttended}/${academicTotal || 0}`, `${academicPct.toFixed(1)}%`],
  ];
  if (clinicalItems.length > 0) summaryRows.push(['Clinical and SGT', `${clinicalAttended}/${clinicalTotal || 0}`, `${clinicalPct.toFixed(1)}%`]);
  summaryRows.push(['Overall status', overallStatus.label, overallStatus.guidance || '']);
  let summaryY = y + 28;
  summaryRows.forEach(([label, value, note]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...slate);
    doc.text(label, margin + 7, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...navy);
    doc.text(value, margin + 48, summaryY);
    if (note) {
      doc.setFontSize(7.2);
      doc.setTextColor(...muted);
      doc.text(doc.splitTextToSize(note, contentWidth - 75).slice(0, 1), margin + 79, summaryY);
    }
    summaryY += 8;
  });
  y += summaryH + 5;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.2);
  doc.setTextColor(...muted);
  doc.text('This report is generated from the attendance records currently stored in Attendenz.', margin, Math.min(y, pageHeight - 25));

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(page, totalPages);
  }

  const filename = `${EXPORT_FILENAME_BASE}.pdf`;
  if (isStandalonePWA()) await handoffPDFForIOSPWA(doc, filename, options.pdfTargetWindow);
  else doc.save(filename);
}
function applyExcelStatusStyles(XLSX: any, worksheet: any, statusColumnIndex: number, rowCount: number): void {
  const palette: Record<string, { fill: string; text: string }> = {
    'Must Attend': { fill: 'FCE7F3', text: '9F1239' },
    'Need Attention': { fill: 'FEF3C7', text: '92400E' },
    'Safe to Miss': { fill: 'DCFCE7', text: '166534' },
    'On Track': { fill: 'DCFCE7', text: '166534' },
    'Target Achieved': { fill: 'DCFCE7', text: '166534' },
    'Completed — Meets Threshold': { fill: 'DCFCE7', text: '166534' },
    'Completed — Below Threshold': { fill: 'FEE2E2', text: '991B1B' },
    'No Attendance Planned': { fill: 'F1F5F9', text: '475569' },
    'No Planned Classes': { fill: 'F1F5F9', text: '475569' },
  };
  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: statusColumnIndex })];
    if (!cell || typeof cell.v !== 'string') continue;
    const colors = palette[cell.v] || { fill: 'F1F5F9', text: '475569' };
    cell.s = {
      fill: { patternType: 'solid', fgColor: { rgb: colors.fill } },
      font: { bold: true, color: { rgb: colors.text } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      },
    };
  }
}

export async function generateExcelReport(options: ExportReportOptions) {
  const XLSX = await import('xlsx-js-style');
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

  const { academic: academicItems, clinical: clinicalItems } = reportItemsByKind(items);
  const displayClinicalItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const academicOverallAttended = academicItems.reduce((acc, curr) => acc + curr.attended, 0);
  const academicOverallTotal = academicItems.reduce((acc, curr) => acc + curr.total, 0);
  const academicOverallPct = academicOverallTotal > 0 ? (academicOverallAttended / academicOverallTotal) * 100 : 0;
  const clinicalOverallAttended = clinicalItems.reduce((acc, curr) => acc + curr.attended, 0);
  const clinicalOverallTotal = clinicalItems.reduce((acc, curr) => acc + curr.total, 0);
  const clinicalOverallPct = clinicalOverallTotal > 0 ? (clinicalOverallAttended / clinicalOverallTotal) * 100 : 0;

  const workbook = XLSX.utils.book_new();

  if (academicItems.length > 0) {
    const rows = academicItems.map(item => {
      const row = getExportRow(item, targetPct);
      return {
        Subject: item.name,
        'Class Conducted': getConductedDisplay(row),
        Present: row.present,
        'Attendance Status': row.status,
        'Recommended Action': row.guidance,
        'Current %': row.percentage,
      };
    });
    rows.push({
      Subject: 'ACADEMIC SUMMARY',
      'Class Conducted': academicOverallTotal,
      Present: academicOverallAttended,
      'Attendance Status': getReportStatus({ name: 'Academic Summary', attended: academicOverallAttended, total: academicOverallTotal, plannedTotal: academicItems.reduce((sum, item) => sum + item.plannedTotal, 0), pct: academicOverallPct, neededForTarget: '' }, targetPct).label,
      'Recommended Action': 'See the detailed Subject rows above.',
      'Current %': Number(academicOverallPct.toFixed(1)),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    applyExcelStatusStyles(XLSX, ws, 3, rows.length);
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Academic Subjects');
  }

  if (displayClinicalItems.length > 0) {
    const rows = displayClinicalItems.map(item => {
      const row = getExportRow(item, targetPct);
      return {
        'Rotation / SGT': item.name,
        'Class Conducted': getConductedDisplay(row),
        Present: row.present,
        'Attendance Status': row.status,
        'Recommended Action': row.guidance,
        'Current %': row.percentage,
      };
    });
    rows.push({
      'Rotation / SGT': 'CLINICAL SUMMARY',
      'Class Conducted': clinicalOverallTotal,
      Present: clinicalOverallAttended,
      'Attendance Status': getReportStatus({ name: 'Clinical Summary', attended: clinicalOverallAttended, total: clinicalOverallTotal, plannedTotal: clinicalItems.reduce((sum, item) => sum + item.plannedTotal, 0), pct: clinicalOverallPct, neededForTarget: '' }, targetPct).label,
      'Recommended Action': 'See the detailed Clinical rows above.',
      'Current %': Number(clinicalOverallPct.toFixed(1)),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    applyExcelStatusStyles(XLSX, ws, 3, rows.length);
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, 'Clinical Rotations');
  }

  const combinedAttended = overallAttended;
  const combinedTotal = overallTotal;
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
  XLSX.writeFile(workbook, `${EXPORT_FILENAME_BASE}.xlsx`);
}

export function generateCSVReport(options: ExportReportOptions) {
  const { items, overallAttended, overallTotal } = options;

  const { academic: academicItems, clinical: clinicalItems } = reportItemsByKind(items);
  const displayClinicalItems = clinicalItems.map(item => ({
    ...item,
    name: item.name.replace(/ \(Ward\)$/, '')
  }));

  const clinicalOverallAttended = clinicalItems.reduce((acc, curr) => acc + curr.attended, 0);
  const clinicalOverallTotal = clinicalItems.reduce((acc, curr) => acc + curr.total, 0);
  const combinedAttended = overallAttended;
  const combinedTotal = overallTotal;
  const combinedPct = combinedTotal === 0 ? 0 : (combinedAttended / combinedTotal) * 100;

  const headers = ['Type', 'Subject/Rotation', 'Class Conducted', 'Present', 'Attendance Status', 'Recommended Action', 'Current %'];
  const rows: any[] = [];

  academicItems.forEach(i => {
    const row = getExportRow(i, options.targetPct);
    rows.push([
      'Academic',
      `"${i.name.replace(/"/g, '""')}"`,
      getConductedDisplay(row),
      row.present,
      `"${row.status}"`,
      `"${row.guidance}"`,
      row.percentage === '' ? '' : Number(row.percentage).toFixed(1),
    ]);
  });

  displayClinicalItems.forEach(i => {
    const row = getExportRow(i, options.targetPct);
    rows.push([
      'Clinical',
      `"${i.name.replace(/"/g, '""')}"`,
      getConductedDisplay(row),
      row.present,
      `"${row.status}"`,
      `"${row.guidance}"`,
      row.percentage === '' ? '' : Number(row.percentage).toFixed(1),
    ]);
  });

  rows.push([
    'SUMMARY',
    '"Combined Total"',
    combinedTotal,
    combinedAttended,
    '"Combined Summary"',
    '"See the detailed rows above"',
    combinedPct.toFixed(1),
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_FILENAME_BASE}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}