import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  PackageCheck,
  Play,
  ShoppingBag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  BatchStatus,
  calculateFormulaEconomics,
  Formula,
  FormulaIngredient,
  ProductionBatch,
  ProductSale,
  RawMaterial,
} from '../types/domain';
import {
  deleteProductSale,
  executeProductionBatch,
  transitionBatchStatus,
} from '../services/firestoreService';
import { FinishedStockModal, FinishedStockModalMode } from './FinishedStockModal';
import { exportSalesToCsv } from '../utils/csvExport';
import { cleanDisplayNotes, formatDate } from '../utils/formatters';

interface BatchProductionViewProps {
  ownerId: string;
  formulas: Formula[];
  ingredients: FormulaIngredient[];
  materials: RawMaterial[];
  batches: ProductionBatch[];
  sales: ProductSale[];
  preselectedFormulaId?: string | null;
  onClearPreselectedFormula?: () => void;
  brandName?: string;
}

export const BatchProductionView: React.FC<BatchProductionViewProps> = ({
  ownerId,
  formulas,
  ingredients,
  materials,
  batches,
  sales,
  preselectedFormulaId,
  onClearPreselectedFormula,
  brandName = 'Business',
}) => {
  const [activeSection, setActiveSection] = useState<'stock' | 'sales' | 'batches'>('stock');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BatchStatus>('ALL');
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    preselectedFormulaId || formulas[0]?.id || ''
  );
  const [batchCode, setBatchCode] = useState(
    `LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  );
  const [batchMultiplier, setBatchMultiplier] = useState('1');
  const [initialStatus, setInitialStatus] = useState<BatchStatus>('completed');
  const [batchNotes, setBatchNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Multi-bottle size allocation state for a batch
  const [bottleAllocations, setBottleAllocations] = useState<
    { id: string; name: string; sizeLiters: number; count: string }[]
  >([
    { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
    { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: '100' },
    { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
    { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
  ]);
  const [customBottleName, setCustomBottleName] = useState('');
  const [customBottleSize, setCustomBottleSize] = useState('2.0');
  const [showAddCustomRow, setShowAddCustomRow] = useState(false);
  const [showMultiBottleSplit, setShowMultiBottleSplit] = useState(false);
  const [showExtraBatchFields, setShowExtraBatchFields] = useState(false);

  // Finished Product Stock Modal State (Sell / Fix Count)
  const [stockModalFormula, setStockModalFormula] = useState<Formula | null>(null);
  const [stockModalMode, setStockModalMode] = useState<FinishedStockModalMode>('sell');

  useEffect(() => {
    if (preselectedFormulaId) {
      setSelectedFormulaId(preselectedFormulaId);
      setBatchCode(`LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
      setBatchMultiplier('1');
      setInitialStatus('completed');
      setBatchNotes('');
      setShowMultiBottleSplit(false);
      setShowExtraBatchFields(false);
      const targetFormula = formulas.find((f) => f.id === preselectedFormulaId);
      const yieldQty = targetFormula ? String(targetFormula.batchYieldUnits) : '100';
      setBottleAllocations([
        { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
        { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: yieldQty },
        { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
        { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
      ]);
      setIsRunModalOpen(true);
      if (onClearPreselectedFormula) {
        onClearPreselectedFormula();
      }
    }
  }, [preselectedFormulaId, onClearPreselectedFormula, formulas]);

  const activeFormula = useMemo(
    () => formulas.find((f) => f.id === selectedFormulaId) || formulas[0] || null,
    [formulas, selectedFormulaId]
  );

  const activeIngredients = useMemo(() => {
    if (!activeFormula) return [];
    return ingredients.filter((i) => i.formulaId === activeFormula.id);
  }, [activeFormula, ingredients]);

  const batchSimulation = useMemo(() => {
    if (!activeFormula) return null;
    const mult = Math.max(0.1, parseFloat(batchMultiplier) || 1);
    const econ = calculateFormulaEconomics(activeFormula, activeIngredients, materials);
    const unitsProduced = Math.max(1, Math.round(activeFormula.batchYieldUnits * mult));

    // Sum up volume of all bottled allocations (500mL, 1L, 1.5L, 1 Gal, etc.)
    const totalBottledLiters = Number(
      bottleAllocations
        .reduce((sum, item) => sum + (parseFloat(item.count) || 0) * item.sizeLiters, 0)
        .toFixed(2)
    );
    const effectiveBottledLiters = Math.min(unitsProduced, totalBottledLiters);
    const refillUnits = Math.max(
      0,
      Number((unitsProduced - effectiveBottledLiters).toFixed(2))
    );
    const bottledFraction = unitsProduced > 0 ? effectiveBottledLiters / unitsProduced : 1;
    const totalBottlesCount = bottleAllocations.reduce(
      (sum, item) => sum + (parseInt(item.count, 10) || 0),
      0
    );

    const scaledRequirements = econ.ingredientBreakdown.map((item) => {
      const baseQty = item.ingredient.quantityRequired * mult;
      const effectiveQty = item.isPackaging ? baseQty * bottledFraction : baseQty;
      const requiredQty = Number(effectiveQty.toFixed(3));
      const lineCost = Number((requiredQty * item.currentCostPerUnit).toFixed(2));
      const isShort = item.availableStock < requiredQty;
      return {
        ...item,
        requiredQty,
        lineCost,
        isShort,
      };
    });

    const rawMatCost = Number(
      scaledRequirements.reduce((acc, r) => acc + r.lineCost, 0).toFixed(2)
    );
    const laborCost = Number((activeFormula.laborCostPerBatch * mult).toFixed(2));
    const overheadCost = Number((activeFormula.overheadCostPerBatch * mult).toFixed(2));
    const totalCost = Number((rawMatCost + laborCost + overheadCost).toFixed(2));
    const costPerUnit = Number((totalCost / unitsProduced).toFixed(2));
    const revenue = Number((activeFormula.sellingPricePerUnit * unitsProduced).toFixed(2));
    const profit = Number((revenue - totalCost).toFixed(2));
    const margin = revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : 0;

    const hasAnyShortage = scaledRequirements.some((r) => r.isShort);

    return {
      mult,
      econ,
      unitsProduced,
      totalBottledLiters,
      effectiveBottledLiters,
      refillUnits,
      totalBottlesCount,
      bottledFraction,
      rawMatCost,
      laborCost,
      overheadCost,
      totalCost,
      costPerUnit,
      revenue,
      profit,
      margin,
      scaledRequirements,
      hasAnyShortage,
    };
  }, [activeFormula, activeIngredients, materials, batchMultiplier, bottleAllocations]);

  const openRunModalForFormula = (formulaId?: string) => {
    setErrorMsg(null);
    const targetId = formulaId || formulas[0]?.id || '';
    setSelectedFormulaId(targetId);
    setBatchCode(`LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setBatchMultiplier('1');
    setInitialStatus('completed');
    setBatchNotes('');
    setShowMultiBottleSplit(false);
    setShowExtraBatchFields(false);

    const targetFormula = formulas.find((f) => f.id === targetId);
    const yieldQty = targetFormula ? String(targetFormula.batchYieldUnits) : '100';
    setBottleAllocations([
      { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
      { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: yieldQty },
      { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
      { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
    ]);
    setIsRunModalOpen(true);
  };

  const openFinishedStockModal = (formula: Formula, mode: FinishedStockModalMode) => {
    setStockModalFormula(formula);
    setStockModalMode(mode);
  };

  const handleRunBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFormula || !batchSimulation) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const activeAllocations = bottleAllocations.filter(
        (b) => (parseFloat(b.count) || 0) > 0
      );
      const breakdownParts = activeAllocations.map(
        (b) => `${b.count}x ${b.name} (${(Number(b.count) * b.sizeLiters).toFixed(1)}L)`
      );
      const breakdownText =
        breakdownParts.length > 0
          ? `[Bottled: ${breakdownParts.join(', ')} | ${batchSimulation.refillUnits}L in Bulk Drum for Refills]`
          : `[100% Bulk Drum for Refills: ${batchSimulation.unitsProduced}L]`;

      await executeProductionBatch(
        ownerId,
        activeFormula,
        activeIngredients,
        materials,
        {
          batchCode,
          batchMultiplier: Math.max(0.1, parseFloat(batchMultiplier) || 1),
          refillUnitsNoBottle: batchSimulation.refillUnits,
          bottlingBreakdownNote: breakdownText,
          status: initialStatus,
          notes: batchNotes,
        }
      );
      setIsRunModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to execute production batch');
    } finally {
      setSubmitting(false);
    }
  };

  const finishedInventoryRows = useMemo(() => {
    return formulas.map((formula) => {
      const fIngs = ingredients.filter((i) => i.formulaId === formula.id);
      const econ = calculateFormulaEconomics(formula, fIngs, materials);
      const stockUnits = formula.finishedStockUnits;
      const shelfCostValue = Number((stockUnits * econ.costPerUnit).toFixed(2));
      const shelfSalesValue = Number((stockUnits * formula.sellingPricePerUnit).toFixed(2));
      const shelfProfitValue = Number((shelfSalesValue - shelfCostValue).toFixed(2));
      return {
        formula,
        econ,
        stockUnits,
        shelfCostValue,
        shelfSalesValue,
        shelfProfitValue,
      };
    });
  }, [formulas, ingredients, materials]);

  const finishedShelfTotals = useMemo(() => {
    let totalUnits = 0;
    let totalCostValue = 0;
    let totalSalesValue = 0;
    let totalProfitValue = 0;
    for (const row of finishedInventoryRows) {
      totalUnits += row.stockUnits;
      totalCostValue += row.shelfCostValue;
      totalSalesValue += row.shelfSalesValue;
      totalProfitValue += row.shelfProfitValue;
    }
    return {
      totalUnits,
      totalCostValue,
      totalSalesValue,
      totalProfitValue,
    };
  }, [finishedInventoryRows]);

  const salesTotals = useMemo(() => {
    const totalItemsSold = sales.reduce((acc, s) => acc + s.quantitySold, 0);
    const totalCashCollected = sales.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalCostOfSold = sales.reduce((acc, s) => acc + s.totalCost, 0);
    const totalRealizedProfit = sales.reduce((acc, s) => acc + s.totalProfit, 0);
    return {
      count: sales.length,
      totalItemsSold,
      totalCashCollected,
      totalCostOfSold,
      totalRealizedProfit,
    };
  }, [sales]);

  const filteredBatches = useMemo(() => {
    if (statusFilter === 'ALL') return batches;
    return batches.filter((b) => b.status === statusFilter);
  }, [batches, statusFilter]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Step 3 of 3 · Finished Stock, Customer Sales &amp; Batches
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1">
            Finished Product Stock &amp; Customer Sales
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            Click <strong>Record a Sale (-)</strong> whenever a customer buys from you (subtracts bottles from your shelf and logs your cash &amp; profit). Click <strong>Make a Batch (+)</strong> when you mix more stock.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {formulas.length > 0 && (
            <button
              type="button"
              onClick={() => openFinishedStockModal(formulas[0], 'sell')}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[38px] px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-teal-700" />
              Record a Sale (-)
            </button>
          )}
          <button
            type="button"
            onClick={() => openRunModalForFormula()}
            disabled={formulas.length === 0}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[42px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Make a Batch (+)
          </button>
        </div>
      </div>

      {/* Responsive 2x2 Mobile / 4-Column Desktop KPI Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Finished Items on Shelf
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {finishedShelfTotals.totalUnits.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Worth ₱{finishedShelfTotals.totalSalesValue.toFixed(2)} when sold
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Profit Waiting on Shelf
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            +₱{finishedShelfTotals.totalProfitValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Cost to make: ₱{finishedShelfTotals.totalCostValue.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Actual Sales Collected
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₱{salesTotals.totalCashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {salesTotals.totalItemsSold.toLocaleString()} items sold ({salesTotals.count} orders)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Real Profit Earned (Sold)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg sm:text-2xl font-bold text-teal-800 font-mono tabular-nums">
              +₱{salesTotals.totalRealizedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums truncate">
            Money in your pocket after costs
          </p>
        </div>
      </div>

      {/* Segmented Section Switcher (Replaces 3 Vertically Stacked Tables) */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/80 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveSection('stock')}
          className={`min-h-[40px] px-2 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSection === 'stock'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          1. Ready to Sell ({finishedInventoryRows.length})
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
          2. Sales ({sales.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('batches')}
          className={`min-h-[40px] px-2 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeSection === 'batches'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          3. Batches ({batches.length})
        </button>
      </div>

      {/* SECTION 1: FINISHED PRODUCT INVENTORY ON SHELF (READY TO SELL) */}
      {activeSection === 'stock' && (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <PackageCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Finished Product Inventory (Ready to Sell)
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                When a customer buys from you, click <strong>Record Sale (-)</strong> on that product. When you run low, click <strong>Make More (+)</strong>.
              </p>
            </div>
          </div>
        </div>

        {finishedInventoryRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No products created yet. Go to <strong>2. Recipes</strong> to create your first product recipe.
          </div>
        ) : (
          <>
            {/* Desktop Finished Inventory Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Finished Product Name</th>
                    <th className="py-3 px-4 text-right">Ready to Sell on Shelf</th>
                    <th className="py-3 px-4 text-right">Cost to Make 1</th>
                    <th className="py-3 px-4 text-right">Selling Price (Profit)</th>
                    <th className="py-3 px-4 text-right">Total Value on Shelf</th>
                    <th className="py-3 px-4 text-right">Sell, Restock or Fix Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {finishedInventoryRows.map((row) => {
                    const isOut = row.stockUnits <= 0;
                    return (
                      <tr key={row.formula.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900">{row.formula.name}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">{row.formula.sku}</span>
                            <span aria-hidden="true">·</span>
                            <span>{row.formula.productCategory}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Supplies can make{' '}
                              <strong className="text-slate-700">
                                {row.econ.maxProducibleBatches} more batches
                              </strong>
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <div
                            className={`text-sm font-bold ${
                              isOut ? 'text-amber-700' : 'text-slate-900'
                            }`}
                          >
                            {row.stockUnits.toLocaleString()} × {row.formula.unitLabel}
                          </div>
                          <div className="text-xs text-slate-500">
                            {isOut ? 'Out of stock — make a batch' : 'In stock ready to sell'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          <div>₱{row.econ.costPerUnit.toFixed(2)} w/ bottle</div>
                          {row.econ.packagingCostPerUnit > 0 ? (
                            <div className="text-xs text-teal-800">
                              Refill: ₱{row.econ.liquidOnlyCostPerUnit.toFixed(2)} (no bottle)
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500">
                              ₱{row.shelfCostValue.toFixed(2)} total cost
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <div className="text-slate-900 font-medium">
                            ₱{row.formula.sellingPricePerUnit.toFixed(2)} each
                          </div>
                          <div className="text-xs text-teal-800 font-medium">
                            +₱{row.econ.grossProfitPerUnit.toFixed(2)} profit/item
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <div className="font-semibold text-slate-900">
                            ₱{row.shelfSalesValue.toFixed(2)} sales
                          </div>
                          <div className="text-xs text-teal-800 font-medium">
                            +₱{row.shelfProfitValue.toFixed(2)} profit
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openFinishedStockModal(row.formula, 'sell')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
                              Record Sale (-)
                            </button>
                            <button
                              type="button"
                              onClick={() => openRunModalForFormula(row.formula.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              Make More (+)
                            </button>
                            <button
                              type="button"
                              onClick={() => openFinishedStockModal(row.formula, 'adjust')}
                              title="Fix exact shelf count"
                              aria-label={`Fix shelf count for ${row.formula.name}`}
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Finished Inventory Cards (Decluttered: Product Name, Ready to Sell, Price & Actions) */}
            <div className="md:hidden divide-y divide-slate-200">
              {finishedInventoryRows.map((row) => {
                const isOut = row.stockUnits <= 0;
                return (
                  <div key={row.formula.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900">
                          {row.formula.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          ₱{row.formula.sellingPricePerUnit.toFixed(2)} each
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div
                          className={`text-sm font-bold ${
                            isOut ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {row.stockUnits.toLocaleString()} × {row.formula.unitLabel}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isOut ? 'Out of stock' : 'Ready to Sell'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openFinishedStockModal(row.formula, 'sell')}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
                        Record Sale (-)
                      </button>
                      <button
                        type="button"
                        onClick={() => openRunModalForFormula(row.formula.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Make More (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => openFinishedStockModal(row.formula, 'adjust')}
                        aria-label={`Fix shelf count for ${row.formula.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      )}

      {/* SECTION 2: CUSTOMER SALES HISTORY & REALIZED PROFIT */}
      {activeSection === 'sales' && (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <ShoppingBag className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                2. Customer Sales History &amp; Real Profit Earned ({sales.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every sale you record appears here with who bought it, how much money you collected, and your exact take-home profit
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-mono text-slate-600">
              Total Collected:{' '}
              <strong className="text-slate-900">₱{salesTotals.totalCashCollected.toFixed(2)}</strong> ·
              Real Profit:{' '}
              <strong className="text-teal-800">+₱{salesTotals.totalRealizedProfit.toFixed(2)}</strong>
            </div>
            {sales.length > 0 && (
              <button
                type="button"
                onClick={() => exportSalesToCsv(sales, brandName)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Sales CSV</span>
              </button>
            )}
          </div>
        </div>

        {sales.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingBag className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-900 mt-2">
              No customer sales recorded yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Click <strong>&ldquo;Record Sale (-)&rdquo;</strong> on any product above whenever a customer buys from you.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Sales Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Date · Customer / Order · Notes</th>
                    <th className="py-3 px-4">Product Sold</th>
                    <th className="py-3 px-4 text-right">How Many Sold</th>
                    <th className="py-3 px-4 text-right">Sold Price (Cost)</th>
                    <th className="py-3 px-4 text-right">Cash Collected</th>
                    <th className="py-3 px-4 text-right">Real Profit Kept</th>
                    <th className="py-3 px-4 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{sale.customerName}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-teal-800 font-semibold">{formatDate(sale.createdAt, true, sale.notes)}</span>
                          {cleanDisplayNotes(sale.notes) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-xs">{cleanDisplayNotes(sale.notes)}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-900">{sale.formulaName}</div>
                        <div className="text-xs text-slate-500">{sale.productCategory}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {sale.quantitySold.toLocaleString()} × {sale.unitLabel}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-900 font-medium">
                          ₱{sale.sellingPricePerUnit.toFixed(2)} each
                        </div>
                        <div className="text-slate-500">Cost: ₱{sale.costPerUnit.toFixed(2)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        ₱{sale.totalRevenue.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-teal-800">
                          +₱{sale.totalProfit.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Cost was ₱{sale.totalCost.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            deleteProductSale(sale.id, {
                              formulaId: sale.formulaId,
                              quantity: sale.quantitySold,
                            })
                          }
                          aria-label={`Delete sale for ${sale.customerName} and restore stock`}
                          title="Delete sale (restores items back to shelf stock)"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Sales Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {sales.map((sale) => (
                <div key={sale.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900">
                        {sale.customerName}
                      </div>
                      <div className="text-[11px] font-mono text-teal-800 font-semibold">
                        {formatDate(sale.createdAt, true, sale.notes)}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 truncate">
                        {sale.formulaName} · {sale.quantitySold} × {sale.unitLabel}
                      </div>
                      {cleanDisplayNotes(sale.notes) && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{cleanDisplayNotes(sale.notes)}</div>
                      )}
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-sm font-bold text-teal-800">
                          +₱{sale.totalProfit.toFixed(2)} profit
                        </div>
                        <div className="text-xs text-slate-600">
                          ₱{sale.totalRevenue.toFixed(2)} cash
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          deleteProductSale(sale.id, {
                            formulaId: sale.formulaId,
                            quantity: sale.quantitySold,
                          })
                        }
                        aria-label={`Delete sale for ${sale.customerName} and restore stock`}
                        title="Delete sale (restores items back to shelf stock)"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      )}

      {/* SECTION 3: PRODUCTION BATCH HISTORY */}
      {activeSection === 'batches' && (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              History of Batches You Mixed ({batches.length})
            </h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Every time you make a batch, it records what supplies were used and adds the finished items above
            </p>
          </div>
          <div className="grid grid-cols-4 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'completed', 'in_progress', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`min-h-[34px] px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status === 'ALL'
                  ? `All (${batches.length})`
                  : status === 'completed'
                  ? 'Finished'
                  : status === 'in_progress'
                  ? 'Mixing Now'
                  : 'Cancelled'}
              </button>
            ))}
          </div>
        </div>

        {/* Production Batches (Desktop Table + Mobile Touch Cards) */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredBatches.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-900 mt-3">
                No batches recorded here yet
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Click &ldquo;Make a Batch (+)&rdquo; above whenever you mix and bottle a product.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Date · Product Made · Batch #</th>
                      <th className="py-3 px-4 text-right">How Many You Made</th>
                      <th className="py-3 px-4 text-right">Where the Money Went</th>
                      <th className="py-3 px-4 text-right">Total Cost (Cost for 1)</th>
                      <th className="py-3 px-4 text-right">Sales Value &amp; Profit</th>
                      <th className="py-3 px-4 text-right">Profit %</th>
                      <th className="py-3 px-4 text-right">Status / Next Step</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredBatches.map((batch) => {
                      const parentFormula = formulas.find((f) => f.id === batch.formulaId);
                      return (
                        <tr key={batch.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900">{batch.formulaName}</div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                              <span className="font-mono text-teal-800 font-semibold">{formatDate(batch.createdAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{batch.batchCode}</span>
                              <span aria-hidden="true">·</span>
                              <span>{batch.productCategory}</span>
                              {batch.notes && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-xs">{batch.notes}</span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            <div className="text-slate-900 font-medium">
                              {batch.unitsProduced.toLocaleString()} × {batch.unitLabel}
                            </div>
                            <div className="text-xs text-slate-500">{batch.batchMultiplier}x recipe size</div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                            <div>Supplies: ₱{batch.rawMaterialCost.toFixed(2)}</div>
                            <div>
                              Worker: ₱{batch.laborCost.toFixed(2)} · Misc: ₱{batch.overheadCost.toFixed(2)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            <div className="font-semibold text-slate-900">
                              ₱{batch.totalProductionCost.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500">
                              ₱{batch.costPerUnit.toFixed(2)} each
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            <div className="text-slate-900">₱{batch.projectedRevenue.toFixed(2)} sales</div>
                            <div className="text-xs font-medium text-teal-800">
                              +₱{batch.projectedProfit.toFixed(2)} profit
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            <span
                              className={`font-semibold ${
                                batch.profitMarginPercent >= 50
                                  ? 'text-emerald-700'
                                  : batch.profitMarginPercent >= 30
                                  ? 'text-slate-900'
                                  : 'text-amber-700'
                              }`}
                            >
                              {batch.profitMarginPercent.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            {batch.status === 'in_progress' ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    transitionBatchStatus(batch, parentFormula, 'completed')
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Mark Finished
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    transitionBatchStatus(
                                      batch,
                                      parentFormula,
                                      'cancelled',
                                      ingredients,
                                      materials
                                    )
                                  }
                                  aria-label="Cancel batch"
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600">
                                {batch.status === 'completed'
                                  ? 'Finished · Added to Stock'
                                  : 'Cancelled'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Touch Card List (Decluttered: Product Name, Date & Quantity Made, Total Cost & Status) */}
              <div className="md:hidden divide-y divide-slate-200">
                {filteredBatches.map((batch) => {
                  const parentFormula = formulas.find((f) => f.id === batch.formulaId);
                  return (
                    <div key={batch.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900">
                            {batch.formulaName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate">
                            <span className="font-mono text-teal-800 font-semibold">{formatDate(batch.createdAt)}</span> · Made{' '}
                            {batch.unitsProduced} × {batch.unitLabel}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-bold text-slate-900">
                            ₱{batch.totalProductionCost.toFixed(2)} cost
                          </div>
                          <div className="text-[11px] text-teal-800 font-medium">
                            +₱{batch.projectedProfit.toFixed(2)} profit
                          </div>
                        </div>
                      </div>

                      {batch.status === 'in_progress' ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              transitionBatchStatus(batch, parentFormula, 'completed')
                            }
                            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Finished &amp; Add to Stock
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              transitionBatchStatus(
                                batch,
                                parentFormula,
                                'cancelled',
                                ingredients,
                                materials
                              )
                            }
                            aria-label="Cancel batch"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 bg-slate-100 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                          <span className="truncate font-mono text-[11px]">{batch.batchCode}</span>
                          <span className="shrink-0 font-medium">
                            {batch.status === 'completed'
                              ? 'Finished · Added to Stock'
                              : 'Cancelled'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Finished Stock Sale / Adjustment Modal */}
      <FinishedStockModal
        ownerId={ownerId}
        isOpen={Boolean(stockModalFormula)}
        initialMode={stockModalMode}
        formula={stockModalFormula}
        ingredients={ingredients}
        materials={materials}
        onClose={() => setStockModalFormula(null)}
      />

      {/* Execute Production Batch Modal (Bottom Sheet on Mobile, Centered on Desktop) */}
      {isRunModalOpen && activeFormula && batchSimulation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-2xl w-full p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Make a Batch of Product
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Subtracts the ingredients you use from your shelf and adds the finished items to your stock
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRunModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRunBatch} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  {errorMsg}
                </div>
              )}

              {/* Essential Controls Upfront */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                  1. Which Product Are You Making Today?
                </label>
                <span className="block text-[11px] text-slate-500 mb-1">
                  Pick from your saved product recipes
                </span>
                <select
                  value={selectedFormulaId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedFormulaId(nextId);
                    const nextFormula = formulas.find((f) => f.id === nextId);
                    const mult = Math.max(0.1, parseFloat(batchMultiplier) || 1);
                    const yieldQty = nextFormula
                      ? String(Math.max(1, Math.round(nextFormula.batchYieldUnits * mult)))
                      : '100';
                    setBottleAllocations([
                      { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
                      { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: yieldQty },
                      { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
                      { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
                    ]);
                  }}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (1x batch = {f.batchYieldUnits} × {f.unitLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                  2. How Much Are You Making? (Batch Size)
                </label>
                <span className="block text-[11px] text-slate-500 mb-1.5">
                  1x = {activeFormula.batchYieldUnits} items · 2x = {activeFormula.batchYieldUnits * 2} items (Makes{' '}
                  <strong className="text-slate-900">{batchSimulation.unitsProduced} × {activeFormula.unitLabel}</strong>)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    required
                    value={batchMultiplier}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBatchMultiplier(val);
                      const mult = Math.max(0.1, parseFloat(val) || 1);
                      const newTotal = Math.max(1, Math.round(activeFormula.batchYieldUnits * mult));
                      if (!showMultiBottleSplit) {
                        setBottleAllocations([
                          { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
                          { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: String(newTotal) },
                          { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
                          { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
                        ]);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  {[
                    { val: '0.5', label: 'Half' },
                    { val: '1', label: '1x' },
                    { val: '2', label: '2x' },
                    { val: '5', label: '5x' },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        setBatchMultiplier(preset.val);
                        const mult = parseFloat(preset.val);
                        const newTotal = Math.max(1, Math.round(activeFormula.batchYieldUnits * mult));
                        if (!showMultiBottleSplit) {
                          setBottleAllocations([
                            { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
                            { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: String(newTotal) },
                            { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
                            { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
                          ]);
                        }
                      }}
                      className={`min-h-[38px] px-2.5 py-2 text-xs font-mono rounded-md border transition-colors cursor-pointer shrink-0 ${
                        batchMultiplier === preset.val
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Financial Summary Box (Always Visible Upfront) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 p-3.5 bg-teal-50/50 border border-teal-200 rounded-lg font-mono tabular-nums text-xs">
                <div>
                  <span className="text-slate-600 font-sans block text-[11px]">Total Batch Cost</span>
                  <strong className="text-sm text-slate-900">
                    ₱{batchSimulation.totalCost.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-600 font-sans block text-[11px]">Cost per 1 Item</span>
                  <strong className="text-sm text-slate-900">
                    ₱{batchSimulation.costPerUnit.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-600 font-sans block text-[11px]">Expected Profit</span>
                  <strong className="text-sm text-teal-800">
                    +₱{batchSimulation.profit.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-600 font-sans block text-[11px]">Profit Margin</span>
                  <strong className="text-sm text-emerald-700">
                    {batchSimulation.margin.toFixed(1)}%
                  </strong>
                </div>
              </div>

              {batchSimulation.hasAnyShortage && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Heads up: Some ingredients on your shelf are below the amount needed for this batch.
                  </span>
                </div>
              )}

              {/* Collapsible Multi-Bottle Size Bottling & Refill Plan */}
              <div className="border border-teal-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMultiBottleSplit((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 bg-teal-50/60 hover:bg-teal-50 flex items-center justify-between gap-2 text-left text-xs font-semibold text-slate-900 transition-colors cursor-pointer"
                >
                  <div>
                    <span className="block">
                      {showMultiBottleSplit
                        ? 'Hide Bottle Sizes & Refill Drum Split'
                        : '+ Split Batch Into Different Bottle Sizes / Refill Drum (Optional)'}
                    </span>
                    <span className="block text-[11px] font-normal text-slate-600 font-mono mt-0.5">
                      Current plan: {batchSimulation.totalBottlesCount} bottles ({batchSimulation.effectiveBottledLiters}L) · Refill Drum: {batchSimulation.refillUnits}L
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-teal-800 shrink-0">
                    {showMultiBottleSplit ? '▲ Hide' : '▼ Change'}
                  </span>
                </button>

                {showMultiBottleSplit && (
                  <div className="p-3.5 bg-teal-50/30 border-t border-teal-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-600">
                        Fill into 500mL, 1L, 1.5L, or 1 Gallon jugs — anything left stays in your drum for customer refills!
                      </span>
                      <div className="flex flex-wrap items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const total = batchSimulation.unitsProduced;
                            setBottleAllocations([
                              { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
                              { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: String(total) },
                              { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
                              { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
                            ]);
                          }}
                          className="px-2 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          All 1L
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const total = batchSimulation.unitsProduced;
                            const c500 = Math.floor((total * 0.15) / 0.5);
                            const c1l = Math.floor(total * 0.4);
                            const c15 = Math.floor((total * 0.15) / 1.5);
                            const cGal = Math.floor((total * 0.15) / 3.785);
                            setBottleAllocations([
                              { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: String(c500) },
                              { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: String(c1l) },
                              { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: String(c15) },
                              { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: String(cGal) },
                            ]);
                          }}
                          className="px-2 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          Mixed Sizes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const half = Math.floor(batchSimulation.unitsProduced / 2);
                            setBottleAllocations([
                              { id: '500ml', name: '500 mL Bottles', sizeLiters: 0.5, count: '0' },
                              { id: '1l', name: '1.0 Liter Bottles', sizeLiters: 1.0, count: String(half) },
                              { id: '1.5l', name: '1.5 Liter Bottles', sizeLiters: 1.5, count: '0' },
                              { id: '1gal', name: '1 Gallon Jugs (3.8L)', sizeLiters: 3.785, count: '0' },
                            ]);
                          }}
                          className="px-2 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          Half 1L / Half Drum
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBottleAllocations((prev) =>
                              prev.map((b) => ({ ...b, count: '0' }))
                            );
                          }}
                          className="px-2 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          100% Refill Drum
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 overflow-hidden">
                      {bottleAllocations.map((alloc) => {
                        const countNum = parseFloat(alloc.count) || 0;
                        const liters = Number((countNum * alloc.sizeLiters).toFixed(2));
                        const isCustom = !['500ml', '1l', '1.5l', '1gal'].includes(alloc.id);

                        return (
                          <div
                            key={alloc.id}
                            className="p-2 sm:px-3 sm:py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-slate-800">{alloc.name}</span>
                              <span className="text-[11px] text-slate-500 ml-1.5 font-mono">
                                ({alloc.sizeLiters}L)
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={alloc.count}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBottleAllocations((prev) =>
                                      prev.map((r) => (r.id === alloc.id ? { ...r, count: val } : r))
                                    );
                                  }}
                                  className="w-16 px-2 py-1 text-xs font-mono font-bold text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                                />
                                <span className="text-[11px] text-slate-500">pcs</span>
                              </div>

                              <div className="w-16 text-right font-mono font-medium text-slate-700 text-[11px]">
                                = {liters}L
                              </div>

                              {isCustom && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBottleAllocations((prev) =>
                                      prev.filter((r) => r.id !== alloc.id)
                                    );
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                  title="Remove bottle size"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {showAddCustomRow ? (
                      <div className="p-2.5 bg-white border border-teal-200 rounded-md flex flex-wrap items-center gap-2 text-xs">
                        <input
                          type="text"
                          placeholder="e.g. 250 mL Bottle, 2L Jug..."
                          value={customBottleName}
                          onChange={(e) => setCustomBottleName(e.target.value)}
                          className="flex-1 min-w-[140px] px-2.5 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">Holds:</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0.01"
                            value={customBottleSize}
                            onChange={(e) => setCustomBottleSize(e.target.value)}
                            className="w-16 px-2 py-1 text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
                          />
                          <span className="text-[11px] text-slate-500">Liters</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!customBottleName.trim()) return;
                            const vol = Math.max(0.01, parseFloat(customBottleSize) || 1);
                            setBottleAllocations((prev) => [
                              ...prev,
                              {
                                id: `custom-${Date.now()}`,
                                name: customBottleName.trim(),
                                sizeLiters: vol,
                                count: '0',
                              },
                            ]);
                            setCustomBottleName('');
                            setShowAddCustomRow(false);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded cursor-pointer"
                        >
                          + Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddCustomRow(false)}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddCustomRow(true)}
                        className="text-xs font-semibold text-teal-800 hover:text-teal-900 cursor-pointer py-0.5 inline-block"
                      >
                        + Add Another Bottle Size (e.g. 250mL, 2L, 5L)
                      </button>
                    )}

                    <div className="p-2.5 bg-white border border-teal-200 rounded-md space-y-1.5 text-xs font-mono">
                      {batchSimulation.totalBottledLiters > batchSimulation.unitsProduced && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 font-sans font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                          <span>
                            Wait! Your bottles add up to {batchSimulation.totalBottledLiters}L, but this batch only makes {batchSimulation.unitsProduced}L!
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                        <span>
                          Total Mixed: <strong className="text-slate-900">{batchSimulation.unitsProduced}L</strong>
                        </span>
                        <span>
                          Bottled: <strong className="text-slate-900">{batchSimulation.effectiveBottledLiters}L</strong>
                        </span>
                        <span className="text-teal-900 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                          Refill Drum: {batchSimulation.refillUnits}L
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Details Toggle (Batch Status, Ingredients Used, Batch ID & Notes) */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtraBatchFields((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>
                    {showExtraBatchFields
                      ? 'Hide Optional Details'
                      : '+ Optional Details (Batch Status, Ingredients List, Batch ID & Notes)'}
                  </span>
                  <span className="text-[11px] font-mono text-teal-700">
                    {showExtraBatchFields ? '▲ Hide' : '▼ Show'}
                  </span>
                </button>

                {showExtraBatchFields && (
                  <div className="p-3.5 bg-white border-t border-slate-200 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Is This Batch Already Finished?
                        </label>
                        <select
                          value={initialStatus}
                          onChange={(e) => setInitialStatus(e.target.value as BatchStatus)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          <option value="completed">
                            Yes — Finished &amp; ready to sell now
                          </option>
                          <option value="in_progress">
                            Not yet — Still mixing (add finished items later)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Batch ID # (Auto-filled)
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={batchCode}
                          onChange={(e) => setBatchCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    {/* Pre-flight Material Consumption Breakdown */}
                    <div className="border border-slate-200 rounded-md overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">
                          Ingredients &amp; Bottles Used ({batchSimulation.unitsProduced} × {activeFormula.unitLabel})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto divide-y divide-slate-200 text-xs">
                        {batchSimulation.scaledRequirements.map((req) => (
                          <div
                            key={req.ingredient.id}
                            className="px-3 py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="text-slate-800 truncate">{req.ingredient.materialName}</span>
                            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                              <span className="text-slate-600">
                                Uses <strong>{req.requiredQty}</strong> {req.ingredient.unit}
                              </span>
                              <span className="font-semibold text-slate-900 w-14 text-right">
                                ₱{req.lineCost.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                        Extra Notes About This Batch (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={batchNotes}
                        onChange={(e) => setBatchNotes(e.target.value)}
                        placeholder="e.g., Mixed by John, smells great, ready for delivery..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsRunModalOpen(false)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting ? 'Saving Batch...' : `Make ${batchSimulation.unitsProduced} Items Now`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
