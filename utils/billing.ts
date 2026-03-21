import type { AppConfigurations, BillItem } from '../types';

export type SchemeDiscountCalculationBase = 'subtotal' | 'after_trade_discount' | 'ask_user';
export type TaxCalculationBaseOption = 'subtotal' | 'after_trade_discount' | 'after_all_discounts';

interface TotalsInput {
  items: BillItem[];
  billDiscount?: number;
  isNonGst?: boolean;
  configurations?: AppConfigurations;
  organizationType?: 'Retail' | 'Distributor';
  pricingMode?: 'mrp' | 'rate';
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
  pricingMode: 'mrp' | 'rate';
}

const resolveSchemeBaseForItem = (item: BillItem, schemeBase: SchemeDiscountCalculationBase): 'subtotal' | 'after_trade_discount' => {
  if (item.schemeCalculationBasis === 'before_discount') return 'subtotal';
  if (item.schemeCalculationBasis === 'after_discount') return 'after_trade_discount';
  return schemeBase === 'subtotal' ? 'subtotal' : 'after_trade_discount';
};

const getSchemeDiscountAmount = (item: BillItem, schemeBaseAmount: number): number => {
  const hasPercent = (item.schemeDiscountPercent || 0) > 0;
  if (hasPercent) {
    return Math.max(0, schemeBaseAmount * ((item.schemeDiscountPercent || 0) / 100));
  }
  return Math.max(0, item.schemeDiscountAmount || 0);
};

const resolvePricingMode = (organizationType?: 'Retail' | 'Distributor', pricingMode?: 'mrp' | 'rate', configurations?: AppConfigurations): 'mrp' | 'rate' => {
  if (organizationType === 'Distributor') return 'rate';
  if (pricingMode) return pricingMode;
  if (configurations?.displayOptions?.pricingMode) return configurations.displayOptions.pricingMode;
  return 'mrp'; // Default for Retail
};

const isGstInclusiveMrp = (item: BillItem, organizationType?: 'Retail' | 'Distributor', pricingMode?: 'mrp' | 'rate', configurations?: AppConfigurations) => {
  const mode = resolvePricingMode(organizationType, pricingMode, configurations);
  if (mode === 'mrp') return true;
  return false;
};

const getDisplayRateForLine = (item: BillItem, organizationType?: 'Retail' | 'Distributor', pricingMode?: 'mrp' | 'rate', configurations?: AppConfigurations) => {
  const mode = resolvePricingMode(organizationType, pricingMode, configurations);
  if (mode === 'mrp') return Number(item.mrp || 0);
  return Number(item.rate || item.mrp || 0);
};


export const resolveBillingSettings = (configurations?: AppConfigurations) => {
  const rawSchemeBase = (configurations?.displayOptions?.schemeDiscountCalculationBase || 'after_trade_discount') as SchemeDiscountCalculationBase;
  const schemeBase = rawSchemeBase === 'ask_user' ? 'after_trade_discount' : rawSchemeBase;
  const taxBase = (configurations?.displayOptions?.taxCalculationBase || 'after_all_discounts') as TaxCalculationBaseOption;
  return { schemeBase, taxBase };
};

export const calculateBillingTotals = ({ items, billDiscount = 0, isNonGst = false, configurations, organizationType, pricingMode }: TotalsInput): BillingTotals => {
  const { schemeBase, taxBase } = resolveBillingSettings(configurations);
  const effectivePricingMode = resolvePricingMode(organizationType, pricingMode, configurations);

  let gross = 0;
  let tradeDiscount = 0;
  let subtotal = 0;
  let lineFlatDiscount = 0;
  let schemeTotal = 0;
  const taxBaseLines: { base: number; gstPercent: number }[] = [];

  items.forEach(item => {
    const unitsPerPack = item.unitsPerPack || 1;
    const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
    const itemGross = billedQty * getDisplayRateForLine(item, organizationType, effectivePricingMode, configurations);
    const itemTradeDisc = itemGross * ((item.discountPercent || 0) / 100);
    const itemFlatDisc = Math.max(0, item.itemFlatDiscount || 0);
    const lineAfterTrade = Math.max(0, itemGross - itemTradeDisc - itemFlatDisc);

    const effectiveSchemeBase = resolveSchemeBaseForItem(item, schemeBase);
    const schemeBaseAmount = effectiveSchemeBase === 'subtotal' ? itemGross : lineAfterTrade;
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
      const isInclusive = isGstInclusiveMrp(item, organizationType, effectivePricingMode, configurations);
      
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
    pricingMode: effectivePricingMode,
  };
};

export const calculateLineNetAmount = (item: BillItem, configurations?: AppConfigurations, organizationType?: 'Retail' | 'Distributor', pricingMode?: 'mrp' | 'rate'): number => {
  const { schemeBase } = resolveBillingSettings(configurations);
  const unitsPerPack = item.unitsPerPack || 1;
  const billedQty = (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack);
  const effectivePricingMode = resolvePricingMode(organizationType, pricingMode, configurations);
  const gross = billedQty * getDisplayRateForLine(item, organizationType, effectivePricingMode, configurations);
  const trade = gross * ((item.discountPercent || 0) / 100);
  const flat = Math.max(0, item.itemFlatDiscount || 0);
  const afterTrade = Math.max(0, gross - trade - flat);
  const effectiveSchemeBase = resolveSchemeBaseForItem(item, schemeBase);
  const schemeBaseAmount = effectiveSchemeBase === 'subtotal' ? gross : afterTrade;
  const scheme = Math.min(afterTrade, getSchemeDiscountAmount(item, schemeBaseAmount));
  return Math.max(0, afterTrade - scheme);
};
