import { AppConfigurations, InventoryItem } from '../types';

export type StockHandlingConfig = {
  strictStock: boolean;
  allowNegativeStock: boolean;
  mode: 'strict' | 'negative';
};

export const resolveStockHandlingConfig = (config?: AppConfigurations | null): StockHandlingConfig => {
  const strictStock = config?.displayOptions?.strictStock;
  const enableNegativeStock = config?.displayOptions?.enableNegativeStock;

  // Enforce exclusive + default-safe behavior.
  if ((strictStock === true && enableNegativeStock === true) || (strictStock === false && enableNegativeStock === false)) {
    return { strictStock: true, allowNegativeStock: false, mode: 'strict' };
  }

  if (enableNegativeStock === true) {
    return { strictStock: false, allowNegativeStock: true, mode: 'negative' };
  }

  return { strictStock: true, allowNegativeStock: false, mode: 'strict' };
};

export const normalizeStockHandlingConfig = (config: AppConfigurations): AppConfigurations => {
  const resolved = resolveStockHandlingConfig(config);
  return {
    ...config,
    displayOptions: {
      ...(config.displayOptions || {}),
      strictStock: resolved.strictStock,
      enableNegativeStock: resolved.allowNegativeStock,
    },
  };
};

export const logStockMovement = (args: {
  transactionType: string;
  item: string;
  batch: string;
  qty: number;
  stockBefore: number;
  stockAfter: number;
  validationResult: 'allowed' | 'blocked';
  mode: 'strict' | 'negative';
}) => {
  const { transactionType, item, batch, qty, stockBefore, stockAfter, validationResult, mode } = args;
  console.info('[StockMovement]', {
    transactionType,
    item,
    batch,
    qty,
    stockBefore,
    stockAfter,
    validationResult,
    configUsed: mode,
    timestamp: new Date().toISOString(),
  });
};

