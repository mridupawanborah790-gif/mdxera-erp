import type { AppConfigurations, BillItem } from '../types';

export type SchemeDiscountCalculationBase = 'subtotal' | 'after_trade_discount';
export type TaxCalculationBaseOption = 'subtotal' | 'after_trade_discount' | 'after_all_discounts';

interface TotalsInput {
  items: BillItem[];
  billDiscount?: number;
  isNonGst?: boolean;
  configurations?: AppConfigurations;
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

export const resolveBillingSettings = (configurations?: AppConfigurations) => {
  const schemeBase = (configurations?.displayOptions?.schemeDiscountCalculationBase || 'after_trade_discount') as SchemeDiscountCalculationBase;
  const taxBase = (configurations?.displayOptions?.taxCalculationBase || 'after_all_discounts') as TaxCalculationBaseOption;
  return { schemeBase, taxBase };
};

export const calculateBillingTotals = ({ items, billDiscount = 0, isNonGst = false, configurations }: TotalsInput): BillingTotals => {
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
    const rate = item.rate || item.mrp || 0;
    const itemGross = billedQty * rate;
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

    if (!isNonGst && lineTaxBase > 0) {
      taxBaseLines.push({ base: lineTaxBase, gstPercent: item.gstPercent || 0 });
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
  const taxableValue = Math.max(0, selectedTaxBaseAmount - safeBillDiscount);

  let tax = 0;
  if (!isNonGst && selectedTaxBaseAmount > 0) {
    const scale = taxableValue / selectedTaxBaseAmount;
    tax = taxBaseLines.reduce((sum, line) => {
      const discountedBase = line.base * scale;
      return sum + discountedBase * ((line.gstPercent || 0) / 100);
    }, 0);
  }

  const baseTotal = taxableValue + tax;
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

export const calculateLineNetAmount = (item: BillItem, configurations?: AppConfigurations): number => {
  const { schemeBase } = resolveBillingSettings(configurations);
  const unitsPerPack = item.unitsPerPack || 1;
  const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
  const rate = item.rate || item.mrp || 0;
  const gross = billedQty * rate;
  const trade = gross * ((item.discountPercent || 0) / 100);
  const flat = Math.max(0, item.itemFlatDiscount || 0);
  const afterTrade = Math.max(0, gross - trade - flat);
  const schemeBaseAmount = schemeBase === 'subtotal' ? gross : afterTrade;
  const scheme = Math.min(afterTrade, getSchemeDiscountAmount(item, schemeBaseAmount));
  return Math.max(0, afterTrade - scheme);
};
