import React, { useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Printer, Download, X, Package, Check } from 'lucide-react';
import { Sale, AppSettings } from '../types';
import { useSettings } from '../hooks/useSettings';
import { format } from 'date-fns';

interface InvoiceModalProps {
  sale: Sale;
  settings: AppSettings;
  onClose: () => void;
}

export default function ProfessionalInvoice({ sale, settings, onClose }: InvoiceModalProps) {
  const { t, isRTL } = useSettings();
  const invoiceRef = useRef<HTMLDivElement>(null);

  const downloadPDF = async () => {
    if (!invoiceRef.current) return;
    
    // Scale up for better quality
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`ElecPro_Facture_${sale.id || 'N' + Date.now()}.pdf`);
  };

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto pt-20 pb-20">
      <div className="max-w-4xl w-full space-y-4">
        <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-all font-bold"
            >
              <X className="w-4 h-4" /> {t('cancel')}
            </button>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={printInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all font-bold shadow-lg shadow-blue-900/20"
            >
              <Printer className="w-4 h-4" /> {t('generateInvoice')}
            </button>
            <button 
              onClick={downloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all font-bold shadow-lg shadow-emerald-900/20"
            >
              <Download className="w-4 h-4" /> {t('downloadPdf')}
            </button>
          </div>
        </div>

        {/* The Actual Invoice - Clean Editorial Style */}
        <div 
          ref={invoiceRef}
          className="invoice-box"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <table cellPadding="0" cellSpacing="0">
            <tr className="top">
                <td colSpan={4}>
                    <table className="w-full">
                        <tr>
                            <td className="title" style={{ textAlign: isRTL ? 'right' : 'left' }}>
                                {settings.storeLogo ? (
                                    <img 
                                      src={settings.storeLogo} 
                                      alt="Store Logo" 
                                      className="h-16 w-auto object-contain"
                                      crossOrigin="anonymous"
                                      referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-12 h-12 bg-slate-950 text-white flex items-center justify-center rounded-lg font-bold text-xl inline-block">
                                      {settings.storeName.charAt(0)}
                                    </div>
                                )}
                                <h1 className="text-4xl font-black uppercase tracking-tighter inline-block ml-4 align-middle">{settings.storeName}</h1>
                            </td>
                            
                            <td style={{ textAlign: isRTL ? 'left' : 'right' }}>
                                <div className="space-y-1 font-mono text-sm">
                                    <p>Facture #: <span className="font-bold text-slate-950">{sale.id?.slice(-8).toUpperCase() || 'PROV-' + Date.now().toString().slice(-4)}</span></p>
                                    <p>Crée le: <span className="font-bold text-slate-950">{format(new Date(sale.timestamp), 'dd/MM/yyyy HH:mm')}</span></p>
                                    <p>Paiement: <span className="font-bold text-slate-950 uppercase">{t(sale.paymentMethod)}</span></p>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            
            <tr className="information">
                <td colSpan={4}>
                    <table className="w-full">
                        <tr>
                            <td style={{ textAlign: isRTL ? 'right' : 'left' }}>
                                <p className="font-bold">{settings.storeName}</p>
                                <p>{settings.storeAddress || 'MA-123 Street Name, Casablanca'}</p>
                                <p>{settings.storePhone || '+212 522-000000'}</p>
                            </td>
                            
                            <td style={{ textAlign: isRTL ? 'left' : 'right' }}>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('billTo')}</p>
                                <p className="font-bold">{t('customer')} Comptant</p>
                                <p>Clientele Passagère</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            
            <tr className="heading">
                <td style={{ textAlign: isRTL ? 'right' : 'left' }}>ARTICLE</td>
                <td className="text-center">QTÉ</td>
                <td className="text-center">P.U</td>
                <td style={{ textAlign: isRTL ? 'left' : 'right' }}>TOTAL</td>
            </tr>
            
            {(sale.items || []).map((item, idx) => (
                <tr key={idx} className="item">
                    <td className="py-2">
                        <div className="font-bold">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{item.productId.slice(0, 8)}</div>
                    </td>
                    <td className="text-center font-mono">{item.qty}</td>
                    <td className="text-center font-mono">{settings.currency}{item.price.toLocaleString()}</td>
                    <td style={{ textAlign: isRTL ? 'left' : 'right' }} className="font-mono font-bold">
                        {settings.currency}{(item.price * item.qty).toLocaleString()}
                    </td>
                </tr>
            ))}
            
            <tr className="total">
                <td colSpan={3}></td>
                <td style={{ textAlign: isRTL ? 'left' : 'right' }} className="font-black pt-4 border-t-2 border-slate-950 text-xl">
                   TOTAL: {settings.currency}{sale.total.toLocaleString()}
                </td>
            </tr>
          </table>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-[0.3em]">
            <p className="mb-2">MERCI DE VOTRE VISITE À {settings.storeName}</p>
            <p>ICE: 000000000000000 | IF: 11111111 | RC: 222222</p>
          </div>
        </div>
      </div>

      <style>{`
        .invoice-box {
            max-width: 800px;
            margin: auto;
            padding: 40px;
            border: 1px solid #eee;
            background: #fff;
            color: #555;
            min-height: 1000px;
            position: relative;
        }

        .invoice-box table {
            width: 100%;
            line-height: 24px;
            text-align: left;
            border-collapse: collapse;
        }

        .invoice-box table td {
            padding: 5px;
            vertical-align: top;
        }

        .invoice-box table tr.top table td {
            padding-bottom: 20px;
        }

        .invoice-box table tr.information table td {
            padding-bottom: 40px;
        }

        .invoice-box table tr.heading td {
            background: #f8f9fa;
            border-bottom: 2px solid #dee2e6;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 10px 5px;
        }

        .invoice-box table tr.item td {
            border-bottom: 1px solid #eee;
            padding: 10px 5px;
        }

        .invoice-box table tr.item.last td {
            border-bottom: none;
        }

        .invoice-box table tr.total td:nth-child(2) {
            border-top: 2px solid #eee;
            font-weight: bold;
        }

        @media only print {
            body * { visibility: hidden; }
            .invoice-box, .invoice-box * { visibility: visible; }
            .invoice-box {
                position: absolute;
                left: 0;
                top: 0;
                box-shadow: none;
                border: none;
                padding: 0;
                width: 100%;
                max-width: none;
            }
            .fixed { display: none !important; }
        }
      `}</style>
    </div>
  );
}
