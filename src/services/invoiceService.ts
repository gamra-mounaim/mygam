import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SHOP_DETAILS } from '../constants';
import { uploadInvoiceToSupabase } from './supabaseService';
import { translations } from '../translations';

interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
}

interface InvoiceData {
  saleId: string;
  date: string;
  items: InvoiceItem[];
  total: number;
  clientName?: string;
  staffName?: string;
  paymentMethod?: string;
  paymentStatus?: 'PAID' | 'CREDIT' | 'PARTIAL';
  notes?: string;
  checkNumber?: string;
  checkOwner?: string;
}

// Helper to render text (especially Arabic) to a high-quality data URL via canvas
const renderTextToImg = (text: string, options: { size: number, bold?: boolean, color?: string, align?: string }): string => {
  const { size, bold = false, color = '#1a1a1a', align = 'right' } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Use a scale factor for higher resolution
  const scale = 4;
  const fontSize = size * scale;
  
  // Try to use a font that likely has Arabic support on the system
  ctx.font = `${bold ? 'bold' : 'normal'} ${fontSize}px "Inter", "Segoe UI", "Tahoma", "Arial", sans-serif`;
  
  const metrics = ctx.measureText(text);
  const padding = 10;
  canvas.width = metrics.width + padding;
  canvas.height = fontSize * 1.5;

  // Re-set font after canvas resize
  ctx.font = `${bold ? 'bold' : 'normal'} ${fontSize}px "Inter", "Segoe UI", "Tahoma", "Arial", sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  
  // Clean background (transparent)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw text
  ctx.fillText(text, padding / 2, canvas.height / 2);
  
  return canvas.toDataURL('image/png');
};

const containsArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

const prepareArabicCell = (data: any) => {
  if (data.cell.text && data.cell.text.length > 0) {
    const text = data.cell.text.join(' ');
    if (containsArabic(text)) {
      data.cell.rawArabicText = text;
      data.cell.text = []; // Clear text so autoTable doesn't render it garbled
    }
  }
};

const drawArabicCell = (doc: jsPDF, data: any, color?: string) => {
  if (data.cell.rawArabicText) {
    const textColor = color || (data.section === 'head' ? '#ffffff' : '#1a1a1a');
    const imgData = renderTextToImg(data.cell.rawArabicText, { 
      size: data.cell.styles.fontSize || 9, 
      bold: data.cell.styles.fontStyle === 'bold', 
      color: textColor 
    });
    const imgProps = (doc as any).getImageProperties(imgData);
    const padding = 2;
    const cellW = data.cell.width - padding * 2;
    const cellH = data.cell.height - padding * 2;
    
    let finalH = cellH;
    let finalW = (imgProps.width * finalH) / imgProps.height;
    
    if (finalW > cellW) {
      finalW = cellW;
      finalH = (imgProps.height * finalW) / imgProps.width;
    }

    const x = data.cell.x + (data.cell.width - finalW) / 2;
    const y = data.cell.y + (data.cell.height - finalH) / 2;
    
    doc.addImage(imgData, 'PNG', x, y, finalW, finalH);
  }
};

export const generateInvoicePDF = (data: InvoiceData, language: string = 'en', settings?: any) => {
  const isAr = language === 'ar';
  const t = (translations as any)[language] || translations.en;
  
  const shop = {
    name: settings?.shop_name || SHOP_DETAILS.name,
    address: settings?.shop_address || SHOP_DETAILS.address,
    phone: settings?.shop_phone || SHOP_DETAILS.phone,
    email: settings?.shop_email || 'contact@example.com',
  };

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Colors
  const slate600 = '#475569';
  const slate800 = '#1e293b';
  const primaryColor = slate800;
  
  // 1. Header & Branding
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  const storeNameText = shop.name.toUpperCase();
  const nameImg = renderTextToImg(storeNameText, { size: 24, bold: true, color: primaryColor });
  const nameImgProps = (doc as any).getImageProperties(nameImg);
  const nameW = 50;
  const nameH = (nameImgProps.height * nameW) / nameImgProps.width;
  doc.addImage(nameImg, 'PNG', margin, margin - 5, nameW, nameH);

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  const detailsX = pageWidth - margin;
  doc.text(shop.address, detailsX, margin, { align: 'right' });
  doc.text(`${t.phone || 'Tel'}: ${shop.phone}`, detailsX, margin + 5, { align: 'right' });
  doc.text(shop.email, detailsX, margin + 10, { align: 'right' });

  // 2. Invoice Title & Metadata
  let currentY = 60;
  
  const labelInvoice = t.invoice || 'INVOICE';
  const labelW = isAr ? 20 : 35;
  const invLabelImg = renderTextToImg(labelInvoice, { size: 28, bold: true, color: '#e2e8f0' });
  doc.addImage(invLabelImg, 'PNG', pageWidth - margin - labelW, currentY - 5, labelW, 12);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  const billToText = t.billTo || 'BILL TO:';
  const billToImg = renderTextToImg(billToText, { size: 9, bold: true, color: '#64748b' });
  doc.addImage(billToImg, 'PNG', margin, currentY, isAr ? 25 : 20, 4);
  
  currentY += 8;
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  if (data.clientName) {
    const clientNameImg = renderTextToImg(data.clientName, { size: 14, bold: true });
    const cW = (doc as any).getImageProperties(clientNameImg).width * 6 / (doc as any).getImageProperties(clientNameImg).height;
    doc.addImage(clientNameImg, 'PNG', margin, currentY, Math.min(cW, 80), 6);
  } else {
    const walkingText = t.walkingCustomer || 'Walking Customer';
    if (containsArabic(walkingText)) {
      const walkingImg = renderTextToImg(walkingText, { size: 10 });
      doc.addImage(walkingImg, 'PNG', margin, currentY, 25, 4);
    } else {
      doc.text(walkingText, margin, currentY + 4);
    }
  }

  const metaX = pageWidth - margin - 50;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  
  const invNumLabel = t.invoiceNo || 'Invoice No:';
  const dateLabel = t.date || 'Date:';
  
  const invNumLabelImg = renderTextToImg(invNumLabel, { size: 9 });
  const dateLabelImg = renderTextToImg(dateLabel, { size: 9 });
  
  doc.addImage(invNumLabelImg, 'PNG', metaX, currentY, 25, 4);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`#${data.saleId.toUpperCase().slice(0, 8)}`, pageWidth - margin, currentY + 3.5, { align: 'right' });
  
  currentY += 7;
  doc.addImage(dateLabelImg, 'PNG', metaX, currentY, 25, 4);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(data.date).toLocaleDateString(), pageWidth - margin, currentY + 3.5, { align: 'right' });

  currentY += 15;

  // 3. Items Table
  const tableHeaders = isAr ? 
    [[t.total, t.price, t.qty, t.productName]] : 
    [[t.productName, t.qty, t.price, t.total]];

  const itemsTableData = data.items.map(item => [
    isAr ? (item.qty * item.price).toFixed(2) : item.name,
    isAr ? item.price.toFixed(2) : item.qty.toString(),
    isAr ? item.qty.toString() : item.price.toFixed(2),
    isAr ? item.name : (item.qty * item.price).toFixed(2)
  ]);

  autoTable(doc, {
    startY: currentY,
    head: tableHeaders,
    body: itemsTableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4
    },
    styles: {
      fontSize: 9,
      cellPadding: 5,
      halign: isAr ? 'right' : 'left'
    },
    columnStyles: {
      0: { cellWidth: isAr ? 35 : 'auto', halign: isAr ? 'center' : 'left' },
      1: { cellWidth: isAr ? 30 : 30, halign: 'center' },
      2: { cellWidth: isAr ? 30 : 30, halign: 'center' },
      3: { cellWidth: isAr ? 'auto' : 35, halign: isAr ? 'right' : 'right' }
    },
    didParseCell: (data) => prepareArabicCell(data),
    didDrawCell: (data) => drawArabicCell(doc, data)
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // 4. Totals & Footer
  const summaryX = pageWidth - margin - 60;
  
  doc.setFillColor(30, 41, 59);
  doc.rect(summaryX, currentY, 60, 12, 'F');
  
  const totalAmountText = t.totalAmount || 'TOTAL AMOUNT:';
  const finalTotalImg = renderTextToImg(totalAmountText, { size: 10, bold: true, color: '#ffffff' });
  doc.addImage(finalTotalImg, 'PNG', summaryX + 2, currentY + 3.5, isAr ? 30 : 35, 5);
  
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.total.toFixed(2)} DH`, pageWidth - margin - 2, currentY + 7.5, { align: 'right' });

  // Payment Method Info
  currentY += 20;
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (data.paymentMethod) {
    const payMethodLabel = `${t.paymentMethod}: ${t[data.paymentMethod.toLowerCase()] || data.paymentMethod}`;
    const payImg = renderTextToImg(payMethodLabel, { size: 9, color: '#475569' });
    doc.addImage(payImg, 'PNG', margin, currentY, isAr ? 40 : 45, 4);
    currentY += 6;

    if (data.paymentMethod.toUpperCase() === 'CHECK' && (data.checkNumber || data.checkOwner)) {
      const checkDetails = `${t.checkNumber}: ${data.checkNumber || '-'} | ${t.checkOwner}: ${data.checkOwner || '-'}`;
      const checkImg = renderTextToImg(checkDetails, { size: 8, color: '#64748b' });
      doc.addImage(checkImg, 'PNG', margin, currentY, isAr ? 50 : 60, 3.5);
      currentY += 6;
    }
  }
  
  if (data.staffName) {
    const staffLabel = `${t.staffLabel || 'Staff'}: ${data.staffName}`;
    const staffImg = renderTextToImg(staffLabel, { size: 9, color: '#475569' });
    doc.addImage(staffImg, 'PNG', margin, currentY, 35, 4);
  }

  // Footer Disclaimer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const footerTerms = isAr ? 
    'شكراً لتعاملكم معنا. يرجى الاحتفاظ بالفاتورة كإثبات للشراء.' : 
    'Thank you for your business. Please keep this invoice as proof of purchase.';
  const termsTextImg = renderTextToImg(footerTerms, { size: 8, color: '#94a3b8' });
  doc.addImage(termsTextImg, 'PNG', (pageWidth - 100) / 2, pageHeight - margin - 5, 100, 3);

  // Save
  const fileName = `Invoice_${data.saleId.slice(0, 8)}.pdf`;
  doc.save(fileName);
  
  const blob = doc.output('blob');
  uploadInvoiceToSupabase(blob, fileName).catch(e => console.warn(e));
};

interface ReportData {
  customerName: string;
  totalDebt: number;
  paidAmount: number;
  remainingDebt: number;
  transactions: { 
    type: 'DEBT' | 'PAYMENT'; 
    amount: number; 
    date: string; 
    description: string;
    items?: { name: string; qty: number; price: number }[];
  }[];
  period?: string;
}

export const generateCustomerReportPDF = (data: ReportData, language: string = 'en', settings?: any) => {
  const isAr = language === 'ar';
  const t = (translations as any)[language] || translations.en;
  const shop = {
    name: settings?.shop_name || SHOP_DETAILS.name,
    address: settings?.shop_address || SHOP_DETAILS.address,
    phone: settings?.shop_phone || SHOP_DETAILS.phone,
    email: settings?.shop_email || 'contact@example.com',
  };
  
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Header Title Area
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 45, 'F');

  const titleText = isAr ? 'كشف حساب الزبون' : 'STATEMENT OF ACCOUNT';
  const titleImg = renderTextToImg(titleText, { size: 22, bold: true, color: '#1e293b' });
  const titleW = 75;
  const titleH = (doc as any).getImageProperties(titleImg).height * titleW / (doc as any).getImageProperties(titleImg).width;
  doc.addImage(titleImg, 'PNG', margin, margin - 5, titleW, titleH);
  
  if (data.period) {
    const periodText = `${isAr ? 'الفترة' : 'PERIOD'}: ${data.period.toUpperCase()}`;
    const periodImg = renderTextToImg(periodText, { size: 9, bold: true, color: '#3b82f6' });
    doc.addImage(periodImg, 'PNG', margin, margin + titleH, 40, 3.5);
  }

  // Shop Details on Right
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(shop.name, pageWidth - margin, margin, { align: 'right' });
  doc.text(`${shop.address} | ${shop.phone}`, pageWidth - margin, margin + 5, { align: 'right' });
  doc.text(shop.email, pageWidth - margin, margin + 10, { align: 'right' });

  let currentY = 60;

  // Brand Accent line
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(1);
  doc.line(margin, currentY, margin + 15, currentY);
  
  currentY += 10;

  // Customer Summary
  const nameLabel = t.customerName || 'Customer:';
  const nameLabelImg = renderTextToImg(nameLabel, { size: 10, color: '#64748b' });
  doc.addImage(nameLabelImg, 'PNG', margin, currentY, isAr ? 20 : 30, 3.5);
  
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  const cNameImg = renderTextToImg(data.customerName, { size: 14, bold: true });
  const cW = (doc as any).getImageProperties(cNameImg).width * 6 / (doc as any).getImageProperties(cNameImg).height;
  doc.addImage(cNameImg, 'PNG', margin, currentY + 5, Math.min(cW, 80), 6);

  // Balance Card
  const balanceLabel = isAr ? 'الرصيد المتبقي:' : 'CURRENT BALANCE:';
  const balanceLabelImg = renderTextToImg(balanceLabel, { size: 10, bold: true, color: '#64748b' });
  doc.addImage(balanceLabelImg, 'PNG', pageWidth - margin - 45, currentY, 40, 3.5);
  
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(pageWidth - margin - 50, currentY + 5, 50, 15, 2, 2, 'F');
  doc.setFontSize(16);
  doc.setTextColor(220, 38, 38);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.remainingDebt.toFixed(2)} DH`, pageWidth - margin - 5, currentY + 15, { align: 'right' });

  currentY += 35;

  // 1. PURCHASES TABLE
  const purchaseLabel = isAr ? 'تفاصيل العمليات' : 'TRANSACTION DETAILS';
  const pImg = renderTextToImg(purchaseLabel, { size: 11, bold: true, color: '#475569' });
  doc.addImage(pImg, 'PNG', margin, currentY, 40, 4.5);
  currentY += 8;

  const purchaseHeaders = isAr ? 
    [[t.total, t.price, t.qty, t.productName, t.date]] : 
    [[t.date, t.productName, t.qty, t.price, t.total]];
  
  const purchaseTable = data.transactions.flatMap(t => {
    const d = new Date(t.date).toLocaleDateString();
    if (t.items && t.items.length > 0) {
      return t.items.map(item => [
        isAr ? (item.qty * item.price).toFixed(2) : d,
        isAr ? item.price.toFixed(2) : item.name,
        item.qty.toString(),
        isAr ? item.name : item.price.toFixed(2),
        isAr ? d : (item.qty * item.price).toFixed(2)
      ]);
    }
    const typeLabel = t.type === 'DEBT' ? (isAr ? 'دين' : 'DEBT') : (isAr ? 'أداء' : 'PAYMENT');
    const desc = `${typeLabel}: ${t.description}`;
    return [[
      isAr ? t.amount.toFixed(2) : d,
      isAr ? '-' : desc,
      '-',
      isAr ? desc : '-',
      isAr ? d : t.amount.toFixed(2)
    ]];
  });

  autoTable(doc, {
    startY: currentY,
    head: purchaseHeaders,
    body: purchaseTable,
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 9, halign: 'center' },
    styles: { fontSize: 8, cellPadding: 3, halign: isAr ? 'right' : 'left' },
    columnStyles: { 4: { halign: isAr ? 'left' : 'right' } },
    didParseCell: (data) => prepareArabicCell(data),
    didDrawCell: (data) => drawArabicCell(doc, data)
  });

  // Footer info
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const automatedNote = isAr ? 'تم إنشاء هذا الكشف آلياً بواسطة نظام شوب ماستر' : 'Automated statement generated by ShopMaster POS';
  const autoImg = renderTextToImg(automatedNote, { size: 8, color: '#94a3b8' });
  doc.addImage(autoImg, 'PNG', (pageWidth - 80) / 2, pageHeight - margin, 80, 3);

  const filename = `Statement_${data.customerName.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);

  const pdfBlob = doc.output('blob');
  uploadInvoiceToSupabase(pdfBlob, filename).catch(e => console.warn(e));

  return { doc, filename };
};


interface GlobalReportData {
  customers: { name: string; debt: number; phone?: string }[];
  totalDebt: number;
}

export const generateGlobalCustomerReportPDF = (data: GlobalReportData, language: string = 'en', settings?: any) => {
  const isAr = language === 'ar';
  const t = (translations as any)[language] || translations.en;
  const shop = {
    name: settings?.shop_name || SHOP_DETAILS.name,
    address: settings?.shop_address || SHOP_DETAILS.address,
    phone: settings?.shop_phone || SHOP_DETAILS.phone,
    email: settings?.shop_email || 'contact@example.com',
  };
  
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Header Title
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 45, 'F');

  const titleText = isAr ? 'تقرير الديون الإجمالي' : 'GLOBAL DEBT REPORT';
  const titleImg = renderTextToImg(titleText, { size: 24, bold: true, color: '#1e293b' });
  const titleW = 80;
  const titleH = (doc as any).getImageProperties(titleImg).height * titleW / (doc as any).getImageProperties(titleImg).width;
  doc.addImage(titleImg, 'PNG', margin, margin - 5, titleW, titleH);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(shop.name, pageWidth - margin, margin, { align: 'right' });
  doc.text(`${shop.address} | ${shop.phone}`, pageWidth - margin, margin + 5, { align: 'right' });
  
  let currentY = 60;
  
  // Total Highlights
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 25, 3, 3, 'F');
  
  const sumLabel = isAr ? 'إجمالي المبالغ المستحقة بذمة الزبناء:' : 'TOTAL OUTSTANDING CUSTOMER DEBT:';
  const sumLabelImg = renderTextToImg(sumLabel, { size: 10, bold: true, color: '#991b1b' });
  doc.addImage(sumLabelImg, 'PNG', margin + 5, currentY + 5, isAr ? 50 : 70, 4);
  
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`${data.totalDebt.toFixed(2)} DH`, pageWidth - margin - 5, currentY + 16, { align: 'right' });
  
  currentY += 35;

  // Table
  const tableHeaders = isAr ? [[t.debt, t.phone, t.customerName]] : [[t.customerName, t.phone, t.debt]];
  const tableRows = data.customers.map(c => [
    isAr ? `${c.debt.toFixed(2)} DH` : c.name,
    c.phone || '-',
    isAr ? c.name : `${c.debt.toFixed(2)} DH`
  ]);

  autoTable(doc, {
    startY: currentY,
    head: tableHeaders,
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 9, cellPadding: 4, halign: isAr ? 'right' : 'left' },
    columnStyles: { 0: { halign: isAr ? 'center' : 'left' }, 1: { halign: 'center' }, 2: { halign: isAr ? 'right' : 'center' } },
    didParseCell: (data) => prepareArabicCell(data),
    didDrawCell: (data) => drawArabicCell(doc, data)
  });

  // Footer info
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const confidentialityNote = isAr ? 'وثيقة سرية - للاستخدام الداخلي فقط' : 'Confidential Document - Internal Use Only';
  const noteImg = renderTextToImg(confidentialityNote, { size: 8, color: '#94a3b8' });
  doc.addImage(noteImg, 'PNG', (pageWidth - 80) / 2, pageHeight - margin, 80, 3);

  // Save
  const filename = `Global_Debt_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);

  const pdfBlob = doc.output('blob');
  uploadInvoiceToSupabase(pdfBlob, filename).catch(e => console.warn(e));
};


interface HistoryReportData {
  type: 'SALES' | 'PAYMENTS' | 'ACTIVITY';
  period?: string;
  items: any[];
  totalAmount: number;
}

export const generateHistoryReportPDF = (data: HistoryReportData, language: string = 'en', settings?: any) => {
  const isAr = language === 'ar';
  const shop = {
    name: settings?.shop_name || SHOP_DETAILS.name,
    address: settings?.shop_address || SHOP_DETAILS.address,
    phone: settings?.shop_phone || SHOP_DETAILS.phone,
  };
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 20;

  // Header Title
  const titleText = isAr 
    ? (data.type === 'SALES' ? 'تقرير المبيعات' : data.type === 'PAYMENTS' ? 'تقرير المدفوعات' : 'سجل الأنشطة') 
    : (data.type === 'SALES' ? 'SALES REPORT' : data.type === 'PAYMENTS' ? 'PAYMENTS REPORT' : 'ACTIVITY LOG');
  const titleImg = renderTextToImg(titleText, { size: 18, bold: true, color: '#1e293b' });
  const titleW = 60;
  const titleH = (doc as any).getImageProperties(titleImg).height * titleW / (doc as any).getImageProperties(titleImg).width;
  doc.addImage(titleImg, 'PNG', isAr ? pageWidth - 14 - titleW : 14, currentY, titleW, titleH);
  
  // Period
  if (data.period) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const periodText = isAr ? `الفترة: ${data.period}` : `Period: ${data.period}`;
    doc.text(periodText, isAr ? 14 : pageWidth - 14, currentY + titleH/2, { align: isAr ? 'left' : 'right' });
  }
  currentY += titleH + 15;

  // Total Summary (if applicable)
  if (data.type !== 'ACTIVITY') {
    doc.setDrawColor(240, 240, 240);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 15, 2, 2, 'FD');
    
    const totalLabel = isAr ? 'الإجمالي الكلي:' : 'TOTAL AMOUNT:';
    const totalLabelImg = renderTextToImg(totalLabel, { size: 9, bold: true });
    doc.addImage(totalLabelImg, 'PNG', isAr ? pageWidth - 50 : 19, currentY + 5.5, 30, 3.5);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`${data.totalAmount.toFixed(2)} DH`, isAr ? 19 : pageWidth - 19, currentY + 10, { align: isAr ? 'left' : 'right' });
    currentY += 25;
  }

  // Table
  autoTable(doc, {
    startY: currentY,
    head: [[
      isAr ? 'المبلغ' : 'AMOUNT',
      isAr ? 'الوصف' : 'DESCRIPTION',
      isAr ? 'التاريخ' : 'DATE',
    ]],
    body: data.items.map(item => [
      `${item.amount.toFixed(2)} DH`,
      item.description,
      new Date(item.date).toLocaleString(isAr ? 'ar-EG' : 'en-US')
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 4,
      halign: isAr ? 'right' : 'left'
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 35, halign: 'center' },
      2: { cellWidth: 50, halign: 'center' }
    },
    didParseCell: (data) => prepareArabicCell(data),
    didDrawCell: (data) => drawArabicCell(doc, data)
  });

  doc.save(`History_Report_${data.type}_${new Date().getTime()}.pdf`);
};

interface TransactionReceiptData {
  customerName: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  date: string;
  description: string;
  saleId?: string;
}

export const generateTransactionReceiptPDF = (data: TransactionReceiptData, language: string = 'en', settings?: any) => {
  const isAr = language === 'ar';
  const shop = {
    name: settings?.shop_name || SHOP_DETAILS.name,
    address: settings?.shop_address || SHOP_DETAILS.address,
    phone: settings?.shop_phone || SHOP_DETAILS.phone,
  };
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 150]
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;

  // Header Title
  const titleText = data.type === 'PAYMENT' 
    ? (isAr ? 'وصل سداد' : 'RECEIPT') 
    : (isAr ? 'وصل دين' : 'DEBIT NOTE');
  const titleImg = renderTextToImg(titleText, { size: 16, bold: true, color: '#334155' });
  const titleW = 40;
  const titleH = (doc as any).getImageProperties(titleImg).height * titleW / (doc as any).getImageProperties(titleImg).width;
  doc.addImage(titleImg, 'PNG', (pageWidth - titleW) / 2, currentY, titleW, titleH);
  currentY += titleH + 8;

  // Shop Info
  const shopNameImg = renderTextToImg(shop.name, { size: 10, bold: true });
  doc.addImage(shopNameImg, 'PNG', (pageWidth - 30) / 2, currentY, 30, 4);
  currentY += 6;

  // Ref & Date
  const refText = `REF: #${data.saleId?.slice(0, 8).toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(refText, pageWidth / 2, currentY, { align: 'center' });
  currentY += 4;
  
  const dateStr = new Date(data.date).toLocaleString(isAr ? 'ar-EG' : 'en-US');
  doc.text(dateStr, pageWidth / 2, currentY, { align: 'center' });
  currentY += 10;

  doc.setLineDashPattern([1, 1], 0);
  doc.line(5, currentY, pageWidth - 5, currentY);
  currentY += 10;

  // Customer & Details
  const customerLabel = isAr ? 'اسم الزبون:' : 'Customer:';
  const customerLabelImg = renderTextToImg(customerLabel, { size: 9 });
  doc.addImage(customerLabelImg, 'PNG', isAr ? pageWidth - 20 : 10, currentY, 12, 3.5);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.customerName, isAr ? 10 : pageWidth - 10, currentY + 3, { align: isAr ? 'left' : 'right' });
  
  currentY += 8;
  const descLabel = isAr ? 'التفاصيل:' : 'Details:';
  const descLabelImg = renderTextToImg(descLabel, { size: 9 });
  doc.addImage(descLabelImg, 'PNG', isAr ? pageWidth - 20 : 10, currentY, 12, 3.5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(data.description, isAr ? 10 : pageWidth - 10, currentY + 3, { align: isAr ? 'left' : 'right' });

  currentY += 15;

  // Amount Box
  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, currentY, pageWidth - 20, 20, 2, 2, 'FD');
  
  const amtLabel = isAr ? 'المبلغ:' : 'AMOUNT:';
  const amtLabelImg = renderTextToImg(amtLabel, { size: 10, bold: true });
  doc.addImage(amtLabelImg, 'PNG', (pageWidth - 15) / 2, currentY + 3, 15, 3.5);
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  if (data.type === 'PAYMENT') doc.setTextColor(22, 163, 74);
  else doc.setTextColor(220, 38, 38);
  doc.text(`${data.amount.toFixed(2)} DH`, pageWidth / 2, currentY + 14, { align: 'center' });

  // Footer
  currentY += 30;
  const footerText = isAr ? 'شكرا لتعاملكم معنا' : 'Thank you for your business';
  const footerImg = renderTextToImg(footerText, { size: 8 });
  doc.addImage(footerImg, 'PNG', (pageWidth - 30) / 2, currentY, 30, 3);

  // Save
  const filename = `Receipt_${data.type}_${new Date().getTime()}.pdf`;
  doc.save(filename);
};

interface StockReportData {
  items: any[];
  generatedAt: string;
  language: string;
}

export const generateStockReportPDF = (data: StockReportData) => {
  const { items, generatedAt, language } = data;
  const isAr = language === 'ar';
  const doc = new jsPDF();
  
  doc.setFontSize(22);
  doc.setTextColor(51, 65, 85);
  doc.text(isAr ? 'تقرير المخزون الحرج' : 'Critical Stock Report', 105, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  doc.text(`${isAr ? 'تم الإنشاء في' : 'Generated at'}: ${generatedAt}`, 105, 30, { align: 'center' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 40, 190, 40);

  const tableColumn = isAr ? 
    ["اسم المنتج", "المورد", "الكمية", "الحد الأدنى", "الحالة"] : 
    ["Product Name", "Supplier", "Qty", "Min", "Status"];

  const tableRows = items.map(p => [
    p.name,
    p.supplier || '-',
    p.qty.toString(),
    (p.minStock ?? 5).toString(),
    p.qty === 0 ? (isAr ? "نفذ المخزون" : "Out of Stock") : (isAr ? "مخزون منخفض" : "Low Stock")
  ]);

  (doc as any).autoTable({
    startY: 50,
    head: [tableColumn],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [239, 68, 68] },
    styles: { fontSize: 9, halign: isAr ? 'right' : 'left' },
    didParseCell: function (data: any) {
      prepareArabicCell(data);
    },
    didDrawCell: function (data: any) {
      drawArabicCell(doc, data);
      if (data.section === 'body' && data.column.index === 4) {
        const status = data.cell.raw;
        if (status === 'Out of Stock' || status === 'نفذ المخزون') {
          data.cell.styles.textColor = [234, 88, 12]; // Orange-600
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'Low Stock' || status === 'مخزون منخفض') {
          data.cell.styles.textColor = [220, 38, 38]; // Red-600
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  doc.save(`STOCK_ALERTS_REPORT_${Date.now()}.pdf`);
};
