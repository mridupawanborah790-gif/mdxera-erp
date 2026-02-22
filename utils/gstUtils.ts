
/**
 * Advanced GST Reconciliation & Statutory Reporting Utilities
 * Aligned with FORM GST ANX-1, ANX-2 and GSTR-3B structures.
 */

import { Transaction, Purchase, Customer } from '../types';

export interface StatutorySummary {
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    itcEligible: number;
}

/**
 * Categorizes a transaction into ANX-1 Tables
 * 3A: B2C supplies
 * 3B: B2B supplies
 * 3C/3D: Exports
 */
export const categorizeSalesForAnx1 = (tx: Transaction, customers: Customer[]) => {
    const customer = customers.find(c => c.id === tx.customerId);
    const hasGst = !!(customer?.gstNumber);

    if (tx.billType === 'non-gst') return 'EXEMPT';
    if (hasGst) return '3B'; // B2B
    return '3A'; // B2C
};

/**
 * Calculates statutory summary from a list of transactions
 */
export const calculateTaxSummary = (items: (Transaction | Purchase)[]): StatutorySummary => {
    return items.reduce((acc, item) => {
        if (item.status === 'cancelled') return acc;

        const totalGst = 'totalGst' in item ? (item.totalGst || 0) : (item as any).total_gst || 0;
        const subtotal = 'subtotal' in item ? (item.subtotal || 0) : (item as any).subtotal || 0;
        
        acc.taxableValue += subtotal;
        acc.totalTax += totalGst;
        
        // Simple 50/50 split assumption for local sales (CGST/SGST)
        // In real use, this would check state codes for IGST
        acc.cgst += totalGst / 2;
        acc.sgst += totalGst / 2;
        
        return acc;
    }, {
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        itcEligible: 0
    });
};

/**
 * Validates return file structure against mandatory statutory headers
 */
export const validateReturnFormat = (headers: string[], type: 'GSTR1' | 'GSTR2' | 'GSTR3B' | 'ANX1' | 'ANX2'): boolean => {
    const required = {
        GSTR1: ['gstin', 'invoice', 'date', 'taxable'],
        GSTR2: ['supplier', 'invoice', 'itc', 'taxable'],
        GSTR3B: ['nature', 'taxable', 'integrated', 'central', 'state'],
        ANX1: ['gstin', 'document', 'hsn', 'taxable'],
        ANX2: ['supplier', 'gstin', 'document', 'status', 'action']
    };
    
    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    return required[type].every(req => lowerHeaders.some(h => h.includes(req.toLowerCase())));
};
