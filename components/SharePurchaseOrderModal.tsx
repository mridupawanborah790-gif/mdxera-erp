
import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import type { PurchaseOrder, Distributor, RegisteredPharmacy } from '../types';
// Fix: Added missing storage service export
import { pushPartnerOrder } from '../services/storageService';

interface SharePurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  distributor: Distributor | null;
  pharmacyName: string;
  senderEmail?: string; 
  senderOrgId?: string; 
}

const SharePurchaseOrderModal: React.FC<SharePurchaseOrderModalProps> = ({ isOpen, onClose, purchaseOrder, distributor, pharmacyName, senderEmail, senderOrgId }) => {
  const [copied, setCopied] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate the object to be shared/pushed
  const sharedOrderPayload = useMemo(() => {
    if (!purchaseOrder) return null;
    return {
      serialId: purchaseOrder.serialId,
      distributorName: pharmacyName, 
      distributorEmail: senderEmail, 
      items: purchaseOrder.items.map(item => ({
        name: item.name,
        brand: item.brand,
        quantity: item.quantity,
        freeQuantity: item.freeQuantity,
        purchasePrice: item.purchasePrice,
        packType: item.packType,
        unitOfMeasurement: item.unitOfMeasurement,
        manufacturer: item.manufacturer,
        hsnCode: item.hsnCode,
        mrp: item.mrp,
        gstPercent: item.gstPercent,
      })),
      status: purchaseOrder.status, 
    };
  }, [purchaseOrder, pharmacyName, senderEmail]);

  const shareableOrderCode = useMemo(() => {
    if (!sharedOrderPayload) return '';
    const jsonString = JSON.stringify(sharedOrderPayload);
    return btoa(unescape(encodeURIComponent(jsonString))); 
  }, [sharedOrderPayload]);

  const directLink = useMemo(() => {
    if (!shareableOrderCode) return '';
    const baseUrl = window.location.origin; 
    return `${baseUrl}?code=${shareableOrderCode}`;
  }, [shareableOrderCode]);

  // Push to DB functionality
  const handlePushToPartner = async () => {
    if (pushStatus === 'pushing') return;
    
    // Validate required data for schema constraints (Not Nulls)
    if (!sharedOrderPayload || !distributor?.email || !senderOrgId || !purchaseOrder || !pharmacyName) {
        setPushStatus('error');
        setErrorMessage("Critical data missing for sync. Ensure distributor email and your pharmacy profile name are set.");
        return;
    }
    
    setPushStatus('pushing');
    setErrorMessage(null);
    try {
        await pushPartnerOrder(
            senderOrgId, 
            pharmacyName, 
            distributor.email, 
            sharedOrderPayload,
            purchaseOrder.serialId // Maps to mandatory sender_po_id
        );
        setPushStatus('success');
    } catch (e: any) {
        console.error("Cloud push failed:", e);
        setPushStatus('error');
        setErrorMessage(e.message || "Cloud sync failed. The recipient might not be registered yet, but you can still share the link manually.");
    }
  };

  const handleCopy = async (text: string) => {
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    }
  };

  const emailSubject = useMemo(() => {
    return encodeURIComponent(`Purchase Order from ${pharmacyName} - #${purchaseOrder?.serialId}`);
  }, [purchaseOrder, pharmacyName]);

  const emailBody = useMemo(() => {
    return encodeURIComponent(
      `Dear ${distributor?.name || 'Partner'},\n\n` +
      `Please find attached our Purchase Order (PO #${purchaseOrder?.serialId}).\n\n` +
      `Accept and import it directly into your Medimart ERP using the link below:\n\n` +
      `${directLink}\n\n` +
      `Regards,\n${pharmacyName}`
    );
  }, [purchaseOrder, distributor, pharmacyName, directLink]);

  const whatsappMessage = useMemo(() => {
    return encodeURIComponent(
      `*New PO from ${pharmacyName} (#${purchaseOrder?.serialId})*\n\n` +
      `Import link: ${directLink}`
    );
  }, [purchaseOrder, pharmacyName, directLink]);


  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setPushStatus('idle');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || !purchaseOrder || !distributor) return null;

  const hasEmail = distributor.email && distributor.email.trim().length > 0;
  const hasPhone = distributor.phone && distributor.phone.trim().length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share Purchase Order #${purchaseOrder.serialId}`} widthClass="max-w-xl">
      <div className="p-6 overflow-y-auto max-h-[80vh]">
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 p-5 rounded-2xl mb-6">
            <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed font-semibold">
              Share this order with <strong>{distributor.name}</strong>. They can accept and convert it into a local purchase entry instantly.
            </p>
        </div>

        {/* Dedicated Push Action */}
        <div className="mb-6">
            <button 
                onClick={handlePushToPartner}
                disabled={pushStatus === 'pushing' || pushStatus === 'success'}
                className={`w-full py-5 flex flex-col items-center justify-center rounded-3xl border-2 transition-all group ${
                    pushStatus === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' :
                    pushStatus === 'error' ? 'bg-red-50 border-red-300 text-red-700' :
                    'bg-primary text-white border-primary shadow-xl shadow-primary/20 hover:bg-primary-dark hover:-translate-y-0.5 active:scale-95'
                }`}
            >
                {pushStatus === 'pushing' ? (
                    <>
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mb-2"></div>
                        <span className="font-black text-xs uppercase tracking-widest">Pushing to Inbox...</span>
                    </>
                ) : pushStatus === 'success' ? (
                    <>
                        <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-2 shadow-lg scale-110">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <span className="font-black text-xs uppercase tracking-widest">Sent to Partner Inbox!</span>
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                        </svg>
                        <span className="font-black text-sm uppercase tracking-[0.2em]">Sync to Partner Inbox</span>
                    </>
                )}
            </button>
            {errorMessage && (
                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 font-bold leading-relaxed animate-in fade-in slide-in-from-top-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-2 mb-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {errorMessage}
                </div>
            )}
        </div>

        <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-app-border"></div>
            </div>
            <div className="relative flex justify-center text-[10px] font-black uppercase">
                <span className="bg-white dark:bg-card-bg px-4 text-gray-400 tracking-[0.3em]">Or share manually</span>
            </div>
        </div>

        <div className="mb-6 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-3xl border-2 border-app-border">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-app-text-tertiary mb-3 ml-1">Secure Import Link</h3>
            <div className="relative group">
                <input
                    readOnly
                    value={directLink}
                    className="w-full p-4 text-xs font-mono border border-app-border rounded-2xl bg-white dark:bg-gray-900 text-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button 
                    onClick={() => handleCopy(directLink)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-primary-dark transition-all transform active:scale-95"
                >
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
                href={hasEmail ? `mailto:${distributor.email}?subject=${emailSubject}&body=${emailBody}` : '#'}
                target={hasEmail ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className={`flex flex-col items-center p-5 text-center rounded-3xl transition-all border-2 ${hasEmail ? 'bg-white border-blue-100 text-blue-600 hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5' : 'bg-gray-50 text-gray-400 cursor-not-allowed border-transparent'}`}
                aria-disabled={!hasEmail}
                onClick={(e) => { if (!hasEmail) e.preventDefault(); }}
            >
                <div className={`p-3 rounded-2xl mb-3 ${hasEmail ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/></svg>
                </div>
                <p className="font-black text-xs uppercase tracking-widest">Share via Email</p>
                <p className="text-[10px] font-bold text-gray-400 mt-1 truncate w-full px-2">{hasEmail ? distributor.email : 'No email address set'}</p>
            </a>
            <a
                href={hasPhone ? `https://wa.me/${distributor.phone?.replace(/\D/g, '')}?text=${whatsappMessage}` : '#'}
                target={hasPhone ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className={`flex flex-col items-center p-5 text-center rounded-3xl transition-all border-2 ${hasPhone ? 'bg-white border-green-100 text-green-600 hover:border-green-300 hover:shadow-lg hover:-translate-y-0.5' : 'bg-gray-50 text-gray-400 cursor-not-allowed border-transparent'}`}
                aria-disabled={!hasPhone}
                onClick={(e) => { if (!hasPhone) e.preventDefault(); }}
            >
                <div className={`p-3 rounded-2xl mb-3 ${hasPhone ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    <svg viewBox="0 0 24 24" width="24" height="24" className="fill-current"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.001.572 1.973.911 3.03.911h.001c3.187 0 5.767-2.586 5.768-5.766.001-3.187-2.575-5.77-5.993-5.794zm-5.444 7.371l-.148-.235c-.715-1.132-.952-2.09-.952-3.233 0-4.914 6.353-7.796 9.641-4.509 1.637 1.636 2.538 3.813 2.537 6.129 0 4.771-5.83 7.208-9.049 4.316l-.23-.207-2.008.526.746-2.608zm10.296 2.367c-.289-.145-1.711-.845-1.975-.941-.266-.097-.459-.145-.651.145-.193.29-.748.941-.917 1.135-.169.193-.337.217-.626.072-1.427-.714-2.365-1.554-3.322-3.205-.121-.208-.013-.319.13-.464.13-.132.289-.338.434-.507.145-.169.193-.29.289-.483.096-.193.048-.362-.024-.507-.072-.145-.651-1.569-.892-2.15-.233-.563-.473-.486-.651-.496-.168-.009-.361-.009-.554-.009-.193 0-.506.072-.771.362-.265.29-1.011.99-1.011 2.415 0 1.425 1.036 2.799 1.181 3.016.145.217 2.016 3.106 4.931 4.329 1.976.83 2.76.897 3.73.837.781-.048 1.711-.7 1.952-1.375.241-.676.241-1.255.169-1.375-.072-.121-.265-.193-.554-.338z"/></svg>
                </div>
                <p className="font-black text-xs uppercase tracking-widest">Share via WhatsApp</p>
                <p className="text-[10px] font-bold text-gray-400 mt-1">{hasPhone ? distributor.phone : 'No mobile number set'}</p>
            </a>
        </div>

      </div>
      <div className="flex justify-end p-5 bg-slate-50 dark:bg-slate-900 border-t border-app-border rounded-b-2xl">
        <button onClick={onClose} className="px-8 py-3 text-xs font-black uppercase tracking-[0.2em] text-app-text-secondary hover:text-primary transition-all">
          Dismiss
        </button>
      </div>
    </Modal>
  );
};

export default SharePurchaseOrderModal;
