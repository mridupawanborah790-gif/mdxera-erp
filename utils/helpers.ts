import type { Customer, Distributor } from '../types';
import type { TransactionLedgerItem } from '../types';

const round2 = (value: number): number => Number((Number(value || 0)).toFixed(2));

const getLedgerAmount = (entry: TransactionLedgerItem): number => {
    const credit = Number(entry.credit || 0);
    if (credit > 0) return credit;
    return Number(entry.debit || 0);
};

const getOpeningBalanceSignedFromLedger = (ledger: TransactionLedgerItem[]): number | null => {
    const openingEntries = ledger.filter((entry) => entry && entry.type === 'openingBalance' && entry.status !== 'cancelled');
    if (openingEntries.length === 0) return null;
    return round2(openingEntries.reduce((sum, entry) => sum + Number(entry.credit || 0) - Number(entry.debit || 0), 0));
};

const getLinkedAdjustedAmount = (ledger: TransactionLedgerItem[], paymentEntry: TransactionLedgerItem): number => {
    if (!paymentEntry?.id) return 0;
    const adjusted = ledger
        .filter((row) => row && row.status !== 'cancelled')
        .reduce((sum, row) => {
            if (paymentEntry.entryCategory === 'down_payment' && row.entryCategory === 'down_payment_adjustment' && row.sourceDownPaymentId === paymentEntry.id) {
                return sum + Number(row.adjustedAmount || 0);
            }
            if (paymentEntry.entryCategory !== 'down_payment' && row.entryCategory === 'invoice_payment_adjustment' && row.sourcePaymentId === paymentEntry.id) {
                return sum + Number(row.adjustedAmount || 0);
            }
            return sum;
        }, 0);
    return round2(adjusted);
};

export interface SupplierPayableBreakdown {
    openingBalanceSigned: number;
    purchaseInvoices: number;
    purchaseReturns: number;
    adjustedPayments: number;
    unadjustedAdvanceSigned: number;
    grossPayable: number;
    netOutstanding: number;
}

export const calculateSupplierPayableBreakdown = (supplier: Distributor | null | undefined): SupplierPayableBreakdown => {
    if (!supplier) {
        return {
            openingBalanceSigned: 0,
            purchaseInvoices: 0,
            purchaseReturns: 0,
            adjustedPayments: 0,
            unadjustedAdvanceSigned: 0,
            grossPayable: 0,
            netOutstanding: 0,
        };
    }

    const ledger = Array.isArray(supplier.ledger) ? supplier.ledger.filter(Boolean) : [];
    const openingFromLedger = getOpeningBalanceSignedFromLedger(ledger);
    const openingBalanceSigned = round2(openingFromLedger ?? Number((supplier as any).opening_balance || (supplier as any).openingBalance || 0));

    const purchaseInvoices = round2(
        ledger
            .filter((row) => row.status !== 'cancelled' && row.type === 'purchase')
            .reduce((sum, row) => sum + Number(row.debit || 0), 0)
    );

    const purchaseReturns = round2(
        ledger
            .filter((row) => row.status !== 'cancelled' && row.type === 'return')
            .reduce((sum, row) => sum + Number(row.credit || 0), 0)
    );

    const adjustedPayments = round2(
        ledger
            .filter((row) => row.status !== 'cancelled' && (row.entryCategory === 'invoice_payment_adjustment' || row.entryCategory === 'down_payment_adjustment'))
            .reduce((sum, row) => sum + Number(row.adjustedAmount || 0), 0)
    );

    const paymentVouchers = ledger.filter(
        (row) =>
            row.status !== 'cancelled' &&
            row.type === 'payment' &&
            (row.entryCategory === 'invoice_payment' || row.entryCategory === 'down_payment')
    );

    const unadjustedAdvanceSigned = round2(
        paymentVouchers.reduce((sum, row) => {
            const remaining = Math.max(round2(getLedgerAmount(row) - getLinkedAdjustedAmount(ledger, row)), 0);
            return sum - remaining;
        }, 0)
    );

    const grossPayable = round2(openingBalanceSigned + purchaseInvoices - purchaseReturns - adjustedPayments);
    const netOutstanding = round2(grossPayable + unadjustedAdvanceSigned);

    return {
        openingBalanceSigned,
        purchaseInvoices,
        purchaseReturns,
        adjustedPayments,
        unadjustedAdvanceSigned,
        grossPayable,
        netOutstanding,
    };
};

/**
 * Calculates the outstanding balance for a given customer or distributor.
 * Falls back to opening_balance if no ledger entries exist.
 */
export const getOutstandingBalance = (entity: Customer | Distributor | null | undefined): number => {
    if (!entity) return 0;

    const looksLikeSupplier = 'supplier_group' in (entity as any) || 'control_gl_id' in (entity as any);
    if (looksLikeSupplier) {
        return calculateSupplierPayableBreakdown(entity as Distributor).netOutstanding;
    }
    
    // 1. Check if there are entries in the ledger
    if (Array.isArray(entity.ledger) && entity.ledger.length > 0) {
        return entity.ledger[entity.ledger.length - 1]?.balance ?? 0;
    }
    
    // 2. Fallback to opening_balance if ledger is empty
    return (entity as any).opening_balance || (entity as any).openingBalance || 0;
};

/**
 * Formats a YYYY-MM-DD date string to MM/YY display format.
 */
export const formatExpiryToMMYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0]; // Remove time if present
    const parts = clean.split('-');
    if (parts.length < 2) return dateStr; // Return as is if not standard format
    
    const year = parts[0].slice(-2);
    const month = parts[1].padStart(2, '0');
    return `${month}/${year}`;
};

/**
 * Normalizes various date string formats to YYYY-MM-DD for Postgres compatibility.
 * Handles: DD-MM-YYYY, MM/YYYY, MM/YY, and Excel serials.
 * For MM/YY or MM/YYYY, it defaults to the last day of that month.
 * Returns null if the input is empty or invalid.
 */
export const normalizeImportDate = (dateStr: string | undefined | null): string | null => {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return null;
    let cleanStr = dateStr.trim();
    
    // 1. Handle YYYY-MM-DD (Already correct)
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

    // 2. Handle DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = cleanStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // 3. Handle MM/YY or MM-YY (e.g., "07/26")
    const myShortMatch = cleanStr.match(/^(\d{1,2})[-/](\d{2})$/);
    if (myShortMatch) {
        let month = parseInt(myShortMatch[1], 10);
        let year = 2000 + parseInt(myShortMatch[2], 10);
        
        // Basic validation: if month > 12, it might be DD/MM or DD/YY
        // If it's DD/MM, we can't be sure of the year, so we assume current year or similar.
        // But the most common case for 2-digit/2-digit in this app is MM/YY for expiry.
        if (month > 12) {
            // Swap if it looks like DD/MM
            const day = month;
            month = parseInt(myShortMatch[2], 10);
            year = new Date().getFullYear();
            if (month > 12) return null; // Still invalid
            const lastDay = new Date(year, month, 0).getDate();
            return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
        }

        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    // 4. Handle MM/YYYY or MM-YYYY
    const myMatch = cleanStr.match(/^(\d{1,2})[-/](\d{4})$/);
    if (myMatch) {
        const month = parseInt(myMatch[1], 10);
        const year = parseInt(myMatch[2], 10);
        if (month < 1 || month > 12) return null;
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    // 5. Handle Excel Serial Date
    if (/^\d{5}$/.test(cleanStr)) {
        const serial = parseInt(cleanStr, 10);
        const date = new Date((serial - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }

    // 6. Standard ISO fallback
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    
    return null;
};

/**
 * Checks if a given expiry date (in MM/YY or YYYY-MM-DD format) is expired.
 */
export const checkIsExpired = (expiryStr: string | undefined | null): boolean => {
    if (!expiryStr || expiryStr === 'N/A') return false;
    
    let expiryDate: Date;
    
    // Handle MM/YY format
    const myMatch = expiryStr.match(/^(\d{1,2})\/(\d{2})$/);
    if (myMatch) {
        const month = parseInt(myMatch[1], 10);
        const year = 2000 + parseInt(myMatch[2], 10);
        // Expiry at the end of the month
        expiryDate = new Date(year, month, 0);
    } else {
        // Handle YYYY-MM-DD or other formats
        const normalized = normalizeImportDate(expiryStr);
        if (!normalized) return false;
        expiryDate = new Date(normalized);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiryDate < today;
};

export const parseNumber = (value: string | number | undefined | null): number => {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const clean = value.trim().replace(/[^0-9.-]/g, '');
    return parseFloat(clean) || 0;
};
