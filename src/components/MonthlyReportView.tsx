import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Package,
  Printer,
  ShoppingBag,
} from 'lucide-react';
import {
  Formula,
  ProductionBatch,
  ProductSale,
  PurchaseOrder,
} from '../types/domain';
import { exportMonthlyReportToCsv } from '../utils/csvExport';
import { extractEffectiveDate, formatDate, parseDateValue } from '../utils/formatters';

interface MonthlyReportViewProps {
  formulas: Formula[];
  sales: ProductSale[];
  batches: ProductionBatch[];
  purchaseOrders: PurchaseOrder[];
  brandName?: string;
}

/**
 * Extracts a Date object from a Firestore Timestamp, Date, or ISO string.
 */
function parseRecordDate(ts: unknown): Date | null {
  if (!ts) return null;
  try {
    const item = ts as { toDate?: () => Date; seconds?: number };
    if (typeof item.toDate === 'function') return item.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'string' || typeof ts === 'number') {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof item.seconds === 'number') return new Date(item.seconds * 1000);
  } catch {
    return null;
  }
  return null;
}

/**
 * Returns YYYY-MM key (e.g., "2026-11")
 */
function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Formats "2026-11" -> "November 2026"
 */
function formatMonthLabel(monthKey: string): string {
  if (monthKey === 'ALL') return 'All Time Summary';
  const [yStr, mStr] = monthKey.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const MonthlyReportView: React.FC<MonthlyReportViewProps> = ({
  formulas,
  sales,
  batches,
  purchaseOrders,
  brandName = 'Make & Sell',
}) => {
  const currentMonthKey = useMemo(() => toMonthKey(new Date()), []);

  // Build sorted list of available months (newest first), always including current month
  const availableMonths = useMemo(() => {
    const set = new Set<string>([currentMonthKey]);
    for (const s of sales) {
      const d = extractEffectiveDate(s.createdAt, s.notes);
      if (d) set.add(toMonthKey(d));
    }
    for (const b of batches) {
      const d = parseDateValue(b.createdAt);
      if (d) set.add(toMonthKey(d));
    }
    for (const po of purchaseOrders) {
      const d = parseDateValue(po.createdAt);
      if (d) set.add(toMonthKey(d));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [sales, batches, purchaseOrders, currentMonthKey]);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [activeSection, setActiveSection] = useState<'products' | 'sales' | 'supplies'>(
    'products'
  );
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Filter records by selectedMonth (or include all if 'ALL')
  const periodSales = useMemo(() => {
    if (selectedMonth === 'ALL') return sales;
    return sales.filter((s) => {
      const d = extractEffectiveDate(s.createdAt, s.notes);
      return (d ? toMonthKey(d) : currentMonthKey) === selectedMonth;
    });
  }, [sales, selectedMonth, currentMonthKey]);

  const periodBatches = useMemo(() => {
    if (selectedMonth === 'ALL') return batches;
    return batches.filter((b) => {
      const d = parseDateValue(b.createdAt);
      return (d ? toMonthKey(d) : currentMonthKey) === selectedMonth;
    });
  }, [batches, selectedMonth, currentMonthKey]);

  const periodPOs = useMemo(() => {
    if (selectedMonth === 'ALL') return purchaseOrders;
    return purchaseOrders.filter((po) => {
      const d = parseDateValue(po.createdAt);
      return (d ? toMonthKey(d) : currentMonthKey) === selectedMonth;
    });
  }, [purchaseOrders, selectedMonth, currentMonthKey]);

  // Aggregate Monthly Totals
  const summary = useMemo(() => {
    const totalSalesRevenue = periodSales.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalSalesCost = periodSales.reduce((acc, s) => acc + s.totalCost, 0);
    const totalSalesProfit = periodSales.reduce((acc, s) => acc + s.totalProfit, 0);
    const totalUnitsSold = periodSales.reduce((acc, s) => acc + s.quantitySold, 0);
    const marginPercent =
      totalSalesRevenue > 0 ? (totalSalesProfit / totalSalesRevenue) * 100 : 0;

    const totalSuppliesSpent = periodPOs.reduce((acc, po) => acc + po.totalCost, 0);
    const completedBatches = periodBatches.filter((b) => b.status === 'completed');
    const totalBatchCost = completedBatches.reduce(
      (acc, b) => acc + b.totalProductionCost,
      0
    );
    const totalUnitsProduced = completedBatches.reduce(
      (acc, b) => acc + b.unitsProduced,
      0
    );
    const netCashFlow = totalSalesRevenue - totalSuppliesSpent;

    return {
      totalSalesRevenue,
      totalSalesCost,
      totalSalesProfit,
      totalUnitsSold,
      marginPercent,
      totalSuppliesSpent,
      completedBatchesCount: completedBatches.length,
      totalBatchCost,
      totalUnitsProduced,
      netCashFlow,
    };
  }, [periodSales, periodPOs, periodBatches]);

  // Breakdown by Product
  const productRows = useMemo(() => {
    const map = new Map<
      string,
      {
        formulaId: string;
        formulaName: string;
        unitLabel: string;
        salesCount: number;
        unitsSold: number;
        revenue: number;
        cost: number;
        profit: number;
        batchesMixed: number;
        unitsProduced: number;
      }
    >();

    for (const f of formulas) {
      map.set(f.id, {
        formulaId: f.id,
        formulaName: f.name,
        unitLabel: f.unitLabel,
        salesCount: 0,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        batchesMixed: 0,
        unitsProduced: 0,
      });
    }

    for (const s of periodSales) {
      const existing = map.get(s.formulaId) || {
        formulaId: s.formulaId,
        formulaName: s.formulaName,
        unitLabel: s.unitLabel,
        salesCount: 0,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        batchesMixed: 0,
        unitsProduced: 0,
      };
      existing.salesCount += 1;
      existing.unitsSold += s.quantitySold;
      existing.revenue += s.totalRevenue;
      existing.cost += s.totalCost;
      existing.profit += s.totalProfit;
      map.set(s.formulaId, existing);
    }

    for (const b of periodBatches) {
      if (b.status !== 'completed') continue;
      const existing = map.get(b.formulaId) || {
        formulaId: b.formulaId,
        formulaName: b.formulaName,
        unitLabel: b.unitLabel,
        salesCount: 0,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        batchesMixed: 0,
        unitsProduced: 0,
      };
      existing.batchesMixed += 1;
      existing.unitsProduced += b.unitsProduced;
      map.set(b.formulaId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [formulas, periodSales, periodBatches]);

  const currentMonthIdx = availableMonths.indexOf(selectedMonth);
  const canGoOlder =
    selectedMonth !== 'ALL' &&
    currentMonthIdx >= 0 &&
    currentMonthIdx < availableMonths.length - 1;
  const canGoNewer = selectedMonth !== 'ALL' && currentMonthIdx > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Monthly Sales, Expenses &amp; Profit Summary
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1">
            Monthly Business Report
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            See your total sales collected, real profit earned, supplies bought, and best-selling products for any month.
          </p>
        </div>

        {/* Month Selector + Export Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 flex-1 sm:flex-initial">
            <button
              type="button"
              disabled={!canGoOlder}
              onClick={() => {
                if (canGoOlder) setSelectedMonth(availableMonths[currentMonthIdx + 1]);
              }}
              title="Previous Month"
              aria-label="Previous Month"
              className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2 flex-1 justify-center">
              <Calendar className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Select Report Month"
                className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer py-1.5"
              >
                {availableMonths.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {formatMonthLabel(mKey)}
                  </option>
                ))}
                <option value="ALL">All Time Summary</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!canGoNewer}
              onClick={() => {
                if (canGoNewer) setSelectedMonth(availableMonths[currentMonthIdx - 1]);
              }}
              title="Next Month"
              aria-label="Next Month"
              className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              exportMonthlyReportToCsv({
                periodLabel: formatMonthLabel(selectedMonth),
                brandName,
                totalSalesRevenue: summary.totalSalesRevenue,
                totalSalesCost: summary.totalSalesCost,
                totalSalesProfit: summary.totalSalesProfit,
                totalSuppliesSpent: summary.totalSuppliesSpent,
                totalBatchCost: summary.totalBatchCost,
                productRows,
                sales: periodSales,
                purchaseOrders: periodPOs,
                batches: periodBatches,
              })
            }
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* 4 Core Monthly KPI Cards (2x2 on Mobile, 4-Col on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            1. Sales Collected (Cash In)
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₱{summary.totalSalesRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {periodSales.length} orders · {summary.totalUnitsSold.toLocaleString()} items sold
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            2. Real Profit Earned
          </span>
          <div className="text-lg sm:text-2xl font-bold text-teal-800 font-mono tabular-nums mt-1">
            +₱{summary.totalSalesProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate font-mono">
            {summary.marginPercent.toFixed(1)}% margin · Cost: ₱{summary.totalSalesCost.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            3. Supplies Bought (Cash Out)
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₱{summary.totalSuppliesSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {periodPOs.length} supply restock deliveries
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            4. Net Cash Flow (In − Out)
          </span>
          <div
            className={`text-lg sm:text-2xl font-bold font-mono tabular-nums mt-1 ${
              summary.netCashFlow >= 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {summary.netCashFlow >= 0 ? '+' : '-'}₱
            {Math.abs(summary.netCashFlow).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Sales cash in minus supplies bought
          </p>
        </div>
      </div>

      {/* Segmented Section Switcher (Mobile-Friendly, No Vertically Stacked Tables) */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/80 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveSection('products')}
          className={`min-h-[40px] px-2 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSection === 'products'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          1. By Product ({productRows.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          className={`min-h-[40px] px-2 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSection === 'sales'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          2. Sales ({periodSales.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('supplies')}
          className={`min-h-[40px] px-2 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSection === 'supplies'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          3. Supplies &amp; Batches ({periodPOs.length + periodBatches.length})
        </button>
      </div>

      {/* TAB 1: PERFORMANCE BY PRODUCT */}
      {activeSection === 'products' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-700 shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Sales &amp; Profit by Product ({formatMonthLabel(selectedMonth)})
              </h2>
            </div>
          </div>

          {productRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No product activity recorded for {formatMonthLabel(selectedMonth)}.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-right">Batches Mixed</th>
                      <th className="py-3 px-4 text-right">Units Sold</th>
                      <th className="py-3 px-4 text-right">Sales Collected (₱)</th>
                      <th className="py-3 px-4 text-right">Cost of Sold (₱)</th>
                      <th className="py-3 px-4 text-right">Real Profit Kept (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {productRows.map((row) => {
                      const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                      return (
                        <tr key={row.formulaId} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900">{row.formulaName}</div>
                            <div className="text-xs text-slate-500">{row.salesCount} customer orders</div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                            {row.batchesMixed > 0 ? (
                              <>
                                <div className="font-semibold text-slate-900">
                                  {row.batchesMixed} batches
                                </div>
                                <div>
                                  Made {row.unitsProduced.toLocaleString()} × {row.unitLabel}
                                </div>
                              </>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                            {row.unitsSold.toLocaleString()} × {row.unitLabel}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            ₱{row.revenue.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                            ₱{row.cost.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            <div className="font-bold text-teal-800">+₱{row.profit.toFixed(2)}</div>
                            <div className="text-xs text-slate-500">{margin.toFixed(1)}% margin</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Tap-to-Expand Product Rows */}
              <div className="md:hidden divide-y divide-slate-200">
                {productRows.map((row) => {
                  const isExpanded = expandedProductId === row.formulaId;
                  const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                  return (
                    <div
                      key={row.formulaId}
                      className={isExpanded ? 'bg-slate-50/70' : 'bg-white'}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedProductId((prev) =>
                            prev === row.formulaId ? null : row.formulaId
                          )
                        }
                        className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">
                            {row.formulaName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 font-mono">
                            Sold {row.unitsSold.toLocaleString()} × {row.unitLabel} ({row.salesCount} orders)
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right font-mono tabular-nums">
                            <div className="text-sm font-bold text-teal-800">
                              +₱{row.profit.toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              ₱{row.revenue.toFixed(2)} sales
                            </div>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform ${
                              isExpanded ? 'rotate-180 text-teal-700' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 pt-2 border-t border-slate-200/70 grid grid-cols-3 gap-2 text-xs font-mono">
                          <div>
                            <span className="text-[10px] font-sans text-slate-500 block">
                              Cost of Sold
                            </span>
                            <strong className="text-slate-900">₱{row.cost.toFixed(2)}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] font-sans text-slate-500 block">
                              Profit Margin
                            </span>
                            <strong className="text-teal-800">{margin.toFixed(1)}%</strong>
                          </div>
                          <div>
                            <span className="text-[10px] font-sans text-slate-500 block">
                              Batches Mixed
                            </span>
                            <strong className="text-slate-900">
                              {row.batchesMixed} ({row.unitsProduced} made)
                            </strong>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: CUSTOMER SALES IN THIS MONTH */}
      {activeSection === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-700 shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Customer Sales in {formatMonthLabel(selectedMonth)} ({periodSales.length})
              </h2>
            </div>
          </div>

          {periodSales.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No customer sales recorded in {formatMonthLabel(selectedMonth)}.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {periodSales.map((sale) => (
                <div
                  key={sale.id}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {sale.customerName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      <span className="font-mono text-teal-800 font-medium">
                        {formatDate(sale.createdAt, true, sale.notes)}
                      </span>{' '}
                      · {sale.formulaName} ({sale.quantitySold} × {sale.unitLabel})
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-sm font-bold text-teal-800">
                      +₱{sale.totalProfit.toFixed(2)} profit
                    </div>
                    <div className="text-xs text-slate-600">
                      ₱{sale.totalRevenue.toFixed(2)} collected
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUPPLIES BOUGHT & BATCHES MIXED IN THIS MONTH */}
      {activeSection === 'supplies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Supply Purchases */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-teal-700 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Supplies Bought ({periodPOs.length})
                </h3>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-900">
                ₱{summary.totalSuppliesSpent.toFixed(2)}
              </span>
            </div>

            {periodPOs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No supply purchases recorded in {formatMonthLabel(selectedMonth)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {periodPOs.map((po) => (
                  <div
                    key={po.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {po.materialName}
                      </div>
                      <div className="text-slate-500 mt-0.5 truncate">
                        <span className="font-mono text-teal-800">
                          {formatDate(po.createdAt)}
                        </span>{' '}
                        · {po.supplierName}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-semibold text-slate-900">
                        ₱{po.totalCost.toFixed(2)}
                      </div>
                      <div className="text-slate-500">
                        +{po.quantityPurchased} {po.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batches Mixed */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Batches Mixed ({periodBatches.length})
              </h3>
              <span className="text-xs font-mono font-semibold text-slate-900">
                ₱{summary.totalBatchCost.toFixed(2)} cost
              </span>
            </div>

            {periodBatches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No batches mixed in {formatMonthLabel(selectedMonth)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {periodBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {batch.formulaName}
                      </div>
                      <div className="text-slate-500 mt-0.5 truncate">
                        <span className="font-mono text-teal-800">
                          {formatDate(batch.createdAt)}
                        </span>{' '}
                        · Made {batch.unitsProduced} × {batch.unitLabel}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-semibold text-slate-900">
                        ₱{batch.totalProductionCost.toFixed(2)} cost
                      </div>
                      <div className="text-teal-800">
                        +₱{batch.projectedProfit.toFixed(2)} profit
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
