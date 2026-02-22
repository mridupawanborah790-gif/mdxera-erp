
import type { InvoiceNumberConfig } from '../types';

export function getFiscalYearSuffix(date = new Date()): number {
    const year = date.getFullYear();
    const month = date.getMonth(); 
    return month >= 3 ? year : year - 1;
}

export interface GeneratedInvoiceIds {
    id: string;
    externalId: string;
    nextExternalNumber: number;
    systemId: string;
    nextInternalNumber: number;
}

export function generateNewInvoiceId(config?: Partial<InvoiceNumberConfig>, type: 'regular' | 'non-gst' | 'purchase-order' | 'physical-inventory' | 'purchase-bill' | 'delivery-challan' | 'sales-challan' | 'medicine-master' = 'regular'): GeneratedInvoiceIds {
    let defaultPrefix = 'INV';
    let defaultPadding = 7;
    let defaultFiscal = true;

    if (type === 'non-gst') {
        defaultPrefix = 'NG';
    } else if (type === 'purchase-order') {
        defaultPrefix = 'PUR-';
        defaultPadding = 8;
        defaultFiscal = false;
    } else if (type === 'physical-inventory') {
        defaultPrefix = 'PHY-';
        defaultPadding = 6;
        defaultFiscal = false;
    } else if (type === 'purchase-bill') {
        defaultPrefix = 'PB-';
        defaultPadding = 7;
        defaultFiscal = true;
    } else if (type === 'delivery-challan') {
        defaultPrefix = 'DC-';
        defaultPadding = 6;
        defaultFiscal = false;
    } else if (type === 'sales-challan') {
        defaultPrefix = 'SC-';
        defaultPadding = 6;
        defaultFiscal = false;
    } else if (type === 'medicine-master') {
        defaultPrefix = 'SKU-';
        defaultPadding = 6;
        defaultFiscal = false;
    }
    
    const defaults: InvoiceNumberConfig = {
        prefix: defaultPrefix,
        startingNumber: 1,
        paddingLength: defaultPadding,
        useFiscalYear: defaultFiscal,
        currentNumber: 1,
        internalCurrentNumber: 1,
        activeMode: 'external'
    };

    const cfg = { ...defaults, ...config };
    const activeMode = cfg.activeMode || 'external';

    // The core fix: use the maximum of currentNumber and startingNumber
    const currentNumInDb = Math.max(
        Number(cfg.startingNumber) || 1, 
        Number(cfg.currentNumber) || 1
    ); 
    
    const externalPadded = String(currentNumInDb).padStart(Number(cfg.paddingLength) || defaultPadding, '0');
    const externalFiscalSuffix = cfg.useFiscalYear ? `-${getFiscalYearSuffix()}` : '';
    
    const prefix = cfg.prefix || defaultPrefix;
    const externalId = `${prefix}${externalPadded}${externalFiscalSuffix}`;
    
    const nextExternalNumber = currentNumInDb + 1;

    const internalNumToUse = Number(cfg.internalCurrentNumber) || 1;
    const internalPadded = String(internalNumToUse).padStart(7, '0');
    const internalFiscalSuffix = `-${getFiscalYearSuffix()}`;
    
    const systemIdPrefix = type === 'non-gst' ? 'NG' : (type === 'purchase-order' ? 'PUR-' : (type === 'physical-inventory' ? 'PHY-' : (type === 'purchase-bill' ? 'PB-' : (type === 'delivery-challan' ? 'DC-' : (type === 'sales-challan' ? 'SC-' : (type === 'medicine-master' ? 'SKU-' : 'INV-'))))));
    const systemId = `${systemIdPrefix}${internalPadded}${internalFiscalSuffix}`;
    
    const nextInternalNumber = internalNumToUse + 1;

    const id = activeMode === 'internal' ? systemId : externalId;

    return { 
        id,
        externalId, 
        nextExternalNumber, 
        systemId, 
        nextInternalNumber 
    };
}
