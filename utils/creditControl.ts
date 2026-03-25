import type { Customer, SalesChallan } from '../types';
import { SalesChallanStatus } from '../types';
import { getOutstandingBalance } from './helpers';

export interface CreditCheckResult {
    canProceed: boolean;
    mode: 'warning_only' | 'hard_block';
    message: string;
    details: {
        creditLimit: number;
        currentOutstanding: number;
        openChallanExposure: number;
        currentTransactionAmount: number;
        projectedExposure: number;
        availableCredit: number;
    };
}

export const getCustomerOpenChallanExposure = (salesChallans: SalesChallan[], customerId?: string | null): number => {
    if (!customerId) return 0;
    return salesChallans
        .filter(c => c.customerId === customerId && c.status === SalesChallanStatus.OPEN)
        .reduce((sum, c) => sum + Number(c.totalAmount || 0), 0);
};

export const evaluateCustomerCredit = ({
    customer,
    currentTransactionAmount,
    openChallanExposure = 0,
    moduleName,
}: {
    customer: Customer | null;
    currentTransactionAmount: number;
    openChallanExposure?: number;
    moduleName: 'POS' | 'Sales Challan';
}): CreditCheckResult | null => {
    if (!customer) return null;

    if (customer.is_active === false || customer.creditStatus === 'blocked') {
        return {
            canProceed: false,
            mode: 'hard_block',
            message: `Customer is blocked. ${moduleName} transaction cannot be created.`,
            details: {
                creditLimit: Number(customer.creditLimit || 0),
                currentOutstanding: Number(getOutstandingBalance(customer) || 0),
                openChallanExposure: Number(openChallanExposure || 0),
                currentTransactionAmount: Number(currentTransactionAmount || 0),
                projectedExposure: 0,
                availableCredit: 0,
            },
        };
    }

    const limitRaw = customer.creditLimit;
    const creditLimit = Number(limitRaw);
    if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
        return {
            canProceed: false,
            mode: 'hard_block',
            message: 'Credit limit is not defined for this customer. Please update Customer Master before proceeding.',
            details: {
                creditLimit: 0,
                currentOutstanding: Number(getOutstandingBalance(customer) || 0),
                openChallanExposure: Number(openChallanExposure || 0),
                currentTransactionAmount: Number(currentTransactionAmount || 0),
                projectedExposure: Number(getOutstandingBalance(customer) || 0) + Number(openChallanExposure || 0) + Number(currentTransactionAmount || 0),
                availableCredit: 0,
            },
        };
    }

    const currentOutstanding = Number(getOutstandingBalance(customer) || 0);
    const openExposure = Number(openChallanExposure || 0);
    const txAmount = Number(currentTransactionAmount || 0);
    const projectedExposure = currentOutstanding + openExposure + txAmount;
    const availableCredit = creditLimit - currentOutstanding;

    const mode = customer.creditControlMode || 'hard_block';
    if (projectedExposure > creditLimit) {
        const txnLabel = moduleName === 'POS' ? 'Invoice' : 'Sales Challan';
        return {
            canProceed: false,
            mode,
            message: `Customer credit limit exceeded. ${txnLabel} cannot be posted.`,
            details: {
                creditLimit,
                currentOutstanding,
                openChallanExposure: openExposure,
                currentTransactionAmount: txAmount,
                projectedExposure,
                availableCredit,
            },
        };
    }

    return {
        canProceed: true,
        mode,
        message: '',
        details: {
            creditLimit,
            currentOutstanding,
            openChallanExposure: openExposure,
            currentTransactionAmount: txAmount,
            projectedExposure,
            availableCredit,
        },
    };
};
