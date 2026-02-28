
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
// Fix: Added AppConfigurations to imports
import type { DetailedBill, InventoryItem, Medicine, AppConfigurations } from '../types';
import MediOneTemplate from './invoice-templates/MediOneTemplate';
import MargTemplate from './invoice-templates/MargTemplate';
import GftTemplate from './invoice-templates/GftTemplate';
import AbhigyanTemplate from './invoice-templates/AbhigyanTemplate';
import MediThreeTemplate from './invoice-templates/MediThreeTemplate';

// Declare html2pdf for TypeScript since it's loaded via CDN
declare const html2pdf: any;

interface PrintBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Fix: Updated bill type to include configurations as required by some templates
  bill: (DetailedBill & { inventory: InventoryItem[]; configurations: AppConfigurations }) | null;
  medicines: Medicine[];
}

const PrintBillModal: React.FC<PrintBillModalProps> = ({ isOpen, onClose, bill, medicines: _medicines }) => {
  const [template, setTemplate] = useState<'medi-1' | 'marg' | 'gft' | 'abhigyan' | 'medi-3'>('marg');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (template === 'medi-3') {
      setOrientation('portrait');
    }
  }, [template]);

  const effectiveOrientation: 'portrait' | 'landscape' = orientation;
  const isLandscape = effectiveOrientation === 'landscape';
    
  if (!isOpen || !bill) return null;

  const triggerBrowserPrint = () => {
    const originalTitle = document.title;
    const sanitizedCustomerName = (bill.customerName || 'Customer').replace(/[^a-z0-9]/gi, '_');
    document.title = `Invoice_${bill.id}_${sanitizedCustomerName}`;
    
    // Use a tiny delay to ensure title update and template renders are flushed
    setTimeout(() => {
        window.print();
        
        // Restore title after a safe delay
        setTimeout(() => {
            document.title = originalTitle;
        }, 2000);
    }, 100);
  };

  const handleDownloadOnly = () => {
    triggerBrowserPrint();
  };

  const handleWhatsAppShare = async () => {
    const rawPhone = bill.customerDetails?.phone || bill.customerPhone || "";
    if (!rawPhone) {
        alert("Customer phone number is missing.");
        return;
    }
    
    const phone = rawPhone.replace(/[^0-9]/g, '');
    /* Fixed: Changed pharmacyName to pharmacy_name for RegisteredPharmacy type */
    const message = `Greetings from ${bill.pharmacy.pharmacy_name}. Please find your Invoice #${bill.id} attached. Total Payable: ₹${bill.total.toFixed(2)}. Thank you!`;

    if (typeof html2pdf === 'undefined') {
        alert("PDF generation library is not loaded. Please try printing to PDF instead.");
        return;
    }

    setIsSharing(true);

    const element = document.getElementById('print-area');
    const opt = {
        margin: 0,
        filename: `Invoice_${bill.id}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a5', orientation: effectiveOrientation }
    };

    try {
        const worker = html2pdf().set(opt).from(element).toPdf();
        const pdfBlob = await worker.output('blob').then((blob: Blob) => blob);
        const pdfFile = new File([pdfBlob], `Invoice_${bill.id}.pdf`, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
                files: [pdfFile],
                title: `Invoice ${bill.id}`,
                text: message
            });
        } else {
            const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
    } catch (e) {
        console.error("Share error:", e);
        alert("Sharing failed. Use the Print button to save as PDF.");
    } finally {
        setIsSharing(false);
    }
  };

  const templates = [
    { id: 'marg', name: 'MEDI 2' },
    { id: 'medi-1', name: 'MEDI-1 (A5)' },
    { id: 'gft', name: 'GFT Pharma' },
    { id: 'abhigyan', name: 'Classic GST' },
    { id: 'medi-3', name: 'MEDI-3' },
  ];

  const renderTemplate = () => {
    switch (template) {
        case 'medi-1': return <MediOneTemplate bill={bill} orientation={effectiveOrientation} />;
        case 'marg': return <MargTemplate bill={bill} orientation={effectiveOrientation} />;
        case 'gft': return <GftTemplate bill={bill} />;
        case 'abhigyan': return <AbhigyanTemplate bill={bill} />;
        case 'medi-3': return <MediThreeTemplate bill={bill} orientation={effectiveOrientation} />;
        default: return <MargTemplate bill={bill} orientation={effectiveOrientation} />;
    }
  };

  return createPortal(
    <div id="print-bill-modal-container" className="fixed inset-0 bg-black bg-opacity-60 z-[999] flex justify-center items-center backdrop-blur-sm print:bg-white print:backdrop-blur-none">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl transform transition-all flex flex-col max-h-[95vh] overflow-hidden print:max-h-none print:overflow-visible print:shadow-none print:rounded-none">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border-b no-print bg-white z-10 relative gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-gray-800 leading-none">Invoice Preview</h3>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Orientation:</span>
                <button 
                  onClick={() => setOrientation('portrait')}
                  className={`px-2 py-0.5 text-xs rounded border transition-all ${effectiveOrientation === 'portrait' ? 'bg-primary text-white border-primary' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                >
                  Portrait
                </button>
                <button 
                  onClick={() => setOrientation('landscape')}
                  className={`px-2 py-0.5 text-xs rounded border transition-all ${effectiveOrientation === 'landscape' ? 'bg-primary text-white border-primary' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                >
                  Landscape
                </button>
            </div>
          </div>
          
           <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <span className="text-sm font-medium">Template:</span>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id as any)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${template === t.id ? 'bg-primary text-white font-semibold shadow-sm' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-4 print:p-0 print:bg-white print:overflow-visible">
            <div
              id="print-area"
              className={`${isLandscape ? 'w-[210mm] min-h-[148mm]' : 'w-[148mm] min-h-[210mm]'} p-0 text-black bg-white shadow-lg mx-auto overflow-hidden print:shadow-none print:mx-0 ${template === 'medi-3' ? 'h-auto overflow-visible' : ''}`}
            >
                {renderTemplate()}
            </div>
        </div>

        <div className="flex justify-end items-center p-4 bg-gray-50 border-t no-print space-x-3 z-10 relative">
            <button onClick={handleDownloadOnly} className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 flex items-center">
                Save as PDF
            </button>
            
            {(bill.customerPhone || bill.customerDetails?.phone) && (
                <button onClick={handleWhatsAppShare} disabled={isSharing} className="px-5 py-2 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg shadow-sm hover:bg-green-100 flex items-center disabled:opacity-50">
                    {isSharing ? 'Processing...' : 'WhatsApp'}
                </button>
            )}
            
            <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
                Close
            </button>
            <button onClick={triggerBrowserPrint} className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark">
                Re-Print / Save PDF
            </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            margin: 0;
            size: A5 ${effectiveOrientation};
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #root,
          #chatbot-container,
          .notification-container {
            display: none !important;
          }

          #print-bill-modal-container {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: white !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            visibility: visible !important;
          }

          #print-bill-modal-container > div {
            width: auto !important;
            max-width: none !important;
            max-height: none !important;
            height: auto !important;
            overflow: hidden !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            visibility: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          #print-area {
            width: ${isLandscape ? '210mm' : '148mm'} !important;
            min-height: ${template === 'medi-3' ? 'auto' : (isLandscape ? '148mm' : '210mm')} !important;
            height: auto !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            visibility: visible !important;
            page-break-before: auto !important;
            page-break-after: auto !important;
            break-before: auto !important;
            break-after: auto !important;
          }

          #print-area,
          #print-area * {
            visibility: visible !important;
          }

          #print-bill-modal-container .no-print {
            display: none !important;
          }

          #print-bill-modal-container,
          #print-bill-modal-container * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default PrintBillModal;
