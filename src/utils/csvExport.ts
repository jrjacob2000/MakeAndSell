import {
  Formula,
  FormulaIngredient,
  ProductionBatch,
  ProductSale,
  PurchaseOrder,
  RawMaterial,
  calculateFormulaEconomics,
} from '../types/domain';
import { formatDate } from './formatters';

/**
 * Escapes a single CSV cell according to RFC 4180
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Converts a 2D array of rows into a UTF-8 CSV string and triggers a browser file download.
 */
function downloadCsv(
  filename: string,
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csvContent = '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats a Firebase Timestamp or string date to readable date string
 */
function formatSaleDate(sale: ProductSale): string {
  try {
    if (sale.createdAt && typeof (sale.createdAt as unknown as { toDate: () => Date }).toDate === 'function') {
      return (sale.createdAt as unknown as { toDate: () => Date }).toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {
    // fallback
  }
  return 'Recent Sale';
}

/**
 * Exports customer sales ledger to CSV for bookkeeping, accounting, or Excel
 */
export function exportSalesToCsv(sales: ProductSale[], brandName = 'Business'): void {
  const headers = [
    'Sale Date',
    'Customer / Buyer',
    'Product Sold',
    'Category',
    'Quantity Sold',
    'Unit Type',
    'Price Per Unit (₱)',
    'Gross Revenue (₱)',
    'Cost Per Unit (₱)',
    'Total Cost (₱)',
    'Net Profit Kept (₱)',
    'Profit Margin (%)',
    'Notes / Refill Details',
  ];

  const rows = sales.map((s) => {
    const margin = s.totalRevenue > 0 ? (s.totalProfit / s.totalRevenue) * 100 : 0;

    return [
      formatSaleDate(s),
      s.customerName || 'Walk-in Customer',
      s.formulaName || 'Product',
      s.productCategory || 'General',
      s.quantitySold,
      s.unitLabel || 'Unit',
      Number(s.sellingPricePerUnit.toFixed(2)),
      Number(s.totalRevenue.toFixed(2)),
      Number(s.costPerUnit.toFixed(2)),
      Number(s.totalCost.toFixed(2)),
      Number(s.totalProfit.toFixed(2)),
      Number(margin.toFixed(1)),
      s.notes || '',
    ];
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const cleanBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadCsv(`${cleanBrand}-sales-ledger-${dateStr}.csv`, [headers, ...rows]);
}

/**
 * Exports raw materials and packaging inventory to CSV
 */
export function exportMaterialsToCsv(materials: RawMaterial[], brandName = 'Business'): void {
  const headers = [
    'Material / Supply Name',
    'SKU / Code',
    'Category',
    'Supplier',
    'Stock On Shelf',
    'Unit of Measure',
    'Cost Per Unit (₱)',
    'Total Stock Value (₱)',
    'Reorder Warning Point',
    'Stock Status',
    'Notes',
  ];

  const rows = materials.map((m) => {
    const isLow = m.stockQuantity <= m.reorderPoint;
    const totalVal = Number((m.stockQuantity * m.costPerUnit).toFixed(2));

    return [
      m.name,
      m.sku,
      m.category || 'Raw Ingredient',
      m.supplierName || 'Standard Supplier',
      m.stockQuantity,
      m.unit,
      Number(m.costPerUnit.toFixed(2)),
      totalVal,
      m.reorderPoint,
      isLow ? 'LOW STOCK (Needs Reorder)' : 'In Stock (Good)',
      m.notes || '',
    ];
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const cleanBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadCsv(`${cleanBrand}-inventory-supplies-${dateStr}.csv`, [headers, ...rows]);
}

/**
 * Exports complete product price guide including refill tiers for all container sizes
 */
export function exportPriceGuideToCsv(
  formulas: Formula[],
  ingredients: FormulaIngredient[],
  materials: RawMaterial[],
  brandName = 'Business'
): void {
  const headers = [
    'Product Name',
    'SKU',
    'Category',
    'Standard Pack / Bottle',
    'Standard Bottled Price (₱)',
    'Full Unit Cost (₱)',
    'Liquid-Only Cost / Liter (₱)',
    'Packaging / Bottle Cost (₱)',
    'Suggested Refill Price / Liter (₱)',
    '500 mL Refill Price (₱)',
    '1.0 Liter Refill Price (₱)',
    '1.5 Liter Jug Refill Price (₱)',
    '1 Gallon Jug Refill Price (₱)',
    '5 Gallon Drum Refill Price (₱)',
    'Bottled Profit Per Unit (₱)',
    'Bottled Margin (%)',
    'Shelf Stock Available',
  ];

  const rows = formulas.map((f) => {
    const formulaIngs = ingredients.filter((i) => i.formulaId === f.id);
    const econ = calculateFormulaEconomics(f, formulaIngs, materials);

    return [
      f.name,
      f.sku,
      f.productCategory || 'Finished Product',
      f.unitLabel || '1L Bottle',
      Number(f.sellingPricePerUnit.toFixed(2)),
      Number(econ.costPerUnit.toFixed(2)),
      Number(econ.liquidOnlyCostPerUnit.toFixed(2)),
      Number(econ.packagingCostPerUnit.toFixed(2)),
      Number(econ.suggestedRefillPricePerUnit.toFixed(2)),
      Number((econ.suggestedRefillPricePerUnit * 0.5).toFixed(2)),
      Number((econ.suggestedRefillPricePerUnit * 1.0).toFixed(2)),
      Number((econ.suggestedRefillPricePerUnit * 1.5).toFixed(2)),
      Number((econ.suggestedRefillPricePerUnit * 3.785).toFixed(2)),
      Number((econ.suggestedRefillPricePerUnit * 18.9).toFixed(2)),
      Number(econ.grossProfitPerUnit.toFixed(2)),
      Number(econ.grossMarginPercent.toFixed(1)),
      f.finishedStockUnits || 0,
    ];
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const cleanBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadCsv(`${cleanBrand}-product-and-refill-price-guide-${dateStr}.csv`, [headers, ...rows]);
}

/**
 * Exports a complete Monthly Report (Summary + Product Breakdown + Sales + Supply Purchases)
 */
export function exportMonthlyReportToCsv(params: {
  periodLabel: string;
  brandName: string;
  totalSalesRevenue: number;
  totalSalesCost: number;
  totalSalesProfit: number;
  totalSuppliesSpent: number;
  totalBatchCost: number;
  productRows: {
    formulaName: string;
    unitLabel: string;
    unitsSold: number;
    salesCount: number;
    revenue: number;
    cost: number;
    profit: number;
    batchesMixed: number;
    unitsProduced: number;
  }[];
  sales: ProductSale[];
  purchaseOrders: PurchaseOrder[];
  batches: ProductionBatch[];
}): void {
  const {
    periodLabel,
    brandName,
    totalSalesRevenue,
    totalSalesCost,
    totalSalesProfit,
    totalSuppliesSpent,
    totalBatchCost,
    productRows,
    sales,
    purchaseOrders,
  } = params;

  const netCashFlow = totalSalesRevenue - totalSuppliesSpent;

  const rows: (string | number | boolean | null | undefined)[][] = [
    [`${brandName} — Monthly Business Report (${periodLabel})`],
    [],
    ['1. MONTHLY SUMMARY', 'Amount (₱)'],
    ['Total Sales Collected (Cash In)', Number(totalSalesRevenue.toFixed(2))],
    ['Cost of Items Sold', Number(totalSalesCost.toFixed(2))],
    ['Real Profit Earned (From Sales)', Number(totalSalesProfit.toFixed(2))],
    ['Money Spent Buying Supplies (Cash Out)', Number(totalSuppliesSpent.toFixed(2))],
    ['Net Cash Flow (Sales In - Supplies Out)', Number(netCashFlow.toFixed(2))],
    ['Total Cost of Batches Mixed', Number(totalBatchCost.toFixed(2))],
    [],
    [
      '2. PERFORMANCE BY PRODUCT',
      'Unit',
      'Orders',
      'Units Sold',
      'Sales Collected (₱)',
      'Cost of Sold (₱)',
      'Profit Earned (₱)',
      'Batches Mixed',
      'Units Produced',
    ],
    ...productRows.map((p) => [
      p.formulaName,
      p.unitLabel,
      p.salesCount,
      p.unitsSold,
      Number(p.revenue.toFixed(2)),
      Number(p.cost.toFixed(2)),
      Number(p.profit.toFixed(2)),
      p.batchesMixed,
      p.unitsProduced,
    ]),
    [],
    [
      '3. CUSTOMER SALES IN THIS PERIOD',
      'Customer',
      'Product',
      'Qty Sold',
      'Unit',
      'Cash Collected (₱)',
      'Cost (₱)',
      'Profit (₱)',
      'Notes',
    ],
    ...sales.map((s) => [
      formatDate(s.createdAt),
      s.customerName,
      s.formulaName,
      s.quantitySold,
      s.unitLabel,
      Number(s.totalRevenue.toFixed(2)),
      Number(s.totalCost.toFixed(2)),
      Number(s.totalProfit.toFixed(2)),
      s.notes || '',
    ]),
    [],
    [
      '4. SUPPLIES BOUGHT IN THIS PERIOD',
      'Supply Item',
      'Supplier',
      'Qty Bought',
      'Unit',
      'Price/Unit (₱)',
      'Total Spent (₱)',
      'Ref #',
    ],
    ...purchaseOrders.map((po) => [
      formatDate(po.createdAt),
      po.materialName,
      po.supplierName,
      po.quantityPurchased,
      po.unit,
      Number(po.unitCost.toFixed(2)),
      Number(po.totalCost.toFixed(2)),
      po.batchReference,
    ]),
  ];

  const cleanBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cleanPeriod = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadCsv(`${cleanBrand}-monthly-report-${cleanPeriod}.csv`, rows);
}
