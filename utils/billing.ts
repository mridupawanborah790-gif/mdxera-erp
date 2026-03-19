import type { AppConfigurations, BillItem } from '../types';

export type SchemeDiscountCalculationBase = 'subtotal' | 'after_trade_discount';
export type TaxCalculationBaseOption = 'subtotal' | 'after_trade_discount' | 'after_all_discounts';

interface TotalsInput {
  items: BillItem[];
  billDiscount?: number;
  isNonGst?: boolean;
  configurations?: AppConfigurations;
  organizationType?: 'Retail' | 'Distributor';
}

export interface BillingTotals {
  gross: number;
  tradeDiscount: number;
  subtotal: number;
  lineFlatDiscount: number;
  schemeTotal: number;
  afterTradeDiscountValue: number;
  afterSchemeDiscountValue: number;
  billDiscount: number;
  taxableValue: number;
  tax: number;
  baseTotal: number;
  autoRoundOff: number;
}

const getSchemeDiscountAmount = (item: BillItem, schemeBaseAmount: number): number => {
  const hasPercent = (item.schemeDiscountPercent || 0) > 0;
  if (hasPercent) {
    return Math.max(0, schemeBaseAmount * ((item.schemeDiscountPercent || 0) / 100));
  }
  return Math.max(0, item.schemeDiscountAmount || 0);
};

const isGstInclusiveMrp = (item: BillItem, organizationType?: 'Retail' | 'Distributor') => {
  if (organizationType === 'Retail') return true;
  return item.taxBasis === 'I-Incl.MRP';
};

const getDisplayRateForLine = (item: BillItem, organizationType?: 'Retail' | 'Distributor') => {
  if (organizationType === 'Retail') return Number(item.mrp || 0);
  if (organizationType === 'Distributor') return Number(item.rate || item.mrp || 0);
  
  if (isGstInclusiveMrp(item)) return Number(item.mrp || 0);
  return Number(item.rate || item.mrp || 0);
};


export const resolveBillingSettings = (configurations?: AppConfigurations) => {
  const schemeBase = (configurations?.displayOptions?.schemeDiscountCalculationBase || 'after_trade_discount') as SchemeDiscountCalculationBase;
  const taxBase = (configurations?.displayOptions?.taxCalculationBase || 'after_all_discounts') as TaxCalculationBaseOption;
  return { schemeBase, taxBase };
};

export const calculateBillingTotals = ({ items, billDiscount = 0, isNonGst = false, configurations, organizationType }: TotalsInput): BillingTotals => {
  const { schemeBase, taxBase } = resolveBillingSettings(configurations);

  let gross = 0;
  let tradeDiscount = 0;
  let subtotal = 0;
  let lineFlatDiscount = 0;
  let schemeTotal = 0;
  const taxBaseLines: { base: number; gstPercent: number }[] = [];

  items.forEach(item => {
    const unitsPerPack = item.unitsPerPack || 1;
    const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
    const itemGross = billedQty * getDisplayRateForLine(item, organizationType);
    const itemTradeDisc = itemGross * ((item.discountPercent || 0) / 100);
    const itemFlatDisc = Math.max(0, item.itemFlatDiscount || 0);
    const lineAfterTrade = Math.max(0, itemGross - itemTradeDisc - itemFlatDisc);

    const schemeBaseAmount = schemeBase === 'subtotal' ? itemGross : lineAfterTrade;
    const schemeDiscount = Math.min(lineAfterTrade, getSchemeDiscountAmount(item, schemeBaseAmount));
    const lineAfterAllDiscounts = Math.max(0, lineAfterTrade - schemeDiscount);

    gross += itemGross;
    tradeDiscount += itemTradeDisc;
    subtotal += lineAfterTrade;
    lineFlatDiscount += itemFlatDisc;
    schemeTotal += schemeDiscount;

    const lineTaxBase = (() => {
      if (taxBase === 'subtotal') return itemGross;
      if (taxBase === 'after_trade_discount') return lineAfterTrade;
      return lineAfterAllDiscounts;
    })();

    if (lineTaxBase > 0) {
      const gstPercent = isNonGst ? 0 : (item.gstPercent || 0);
      const isInclusive = isGstInclusiveMrp(item, organizationType);
      
      const taxableBase = isInclusive && gstPercent > 0
        ? lineTaxBase / (1 + (gstPercent / 100))
        : lineTaxBase;
      taxBaseLines.push({ base: taxableBase, gstPercent });
    }
  });

  const afterTradeDiscountValue = Math.max(0, gross - tradeDiscount - lineFlatDiscount);
  const afterSchemeDiscountValue = Math.max(0, afterTradeDiscountValue - schemeTotal);

  const selectedTaxBaseAmount = (() => {
    if (taxBase === 'subtotal') return gross;
    if (taxBase === 'after_trade_discount') return afterTradeDiscountValue;
    return afterSchemeDiscountValue;
  })();

  const safeBillDiscount = Math.max(0, billDiscount);
  const discountedTaxBase = Math.max(0, selectedTaxBaseAmount - safeBillDiscount);
  const scale = selectedTaxBaseAmount > 0 ? (discountedTaxBase / selectedTaxBaseAmount) : 0;
  const taxableValue = isNonGst
    ? discountedTaxBase
    : taxBaseLines.reduce((sum, line) => sum + (line.base * scale), 0);

  let tax = 0;
  if (!isNonGst && selectedTaxBaseAmount > 0) {
    tax = taxBaseLines.reduce((sum, line) => {
      const discountedBase = line.base * scale;
      return sum + discountedBase * ((line.gstPercent || 0) / 100);
    }, 0);
  }

  const baseTotal = isNonGst ? taxableValue : (taxableValue + tax);
  const autoRoundOff = Math.round(baseTotal) - baseTotal;

  return {
    gross,
    tradeDiscount,
    subtotal,
    lineFlatDiscount,
    schemeTotal,
    afterTradeDiscountValue,
    afterSchemeDiscountValue,
    billDiscount: safeBillDiscount,
    taxableValue,
    tax,
    baseTotal,
    autoRoundOff,
  };
};

export const calculateLineNetAmount = (item: BillItem, configurations?: AppConfigurations, organizationType?: 'Retail' | 'Distributor'): number => {
  const { schemeBase } = resolveBillingSettings(configurations);
  const unitsPerPack = item.unitsPerPack || 1;
  const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
  const gross = billedQty * getDisplayRateForLine(item, organizationType);
  const trade = gross * ((item.discountPercent || 0) / 100);
  const flat = Math.max(0, item.itemFlatDiscount || 0);
  const afterTrade = Math.max(0, gross - trade - flat);
  const schemeBaseAmount = schemeBase === 'subtotal' ? gross : afterTrade;
  const scheme = Math.min(afterTrade, getSchemeDiscountAmount(item, schemeBaseAmount));
  return Math.max(0, afterTrade - scheme);
};
