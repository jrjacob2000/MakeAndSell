import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleHelp,
  Database,
  Edit3,
  FlaskConical,
  Package,
  Play,
  RotateCcw,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  calculateFormulaEconomics,
  Formula,
  FormulaIngredient,
  ProductionBatch,
  ProductSale,
  PurchaseOrder,
  RawMaterial,
  WorkspaceSettings,
} from '../types/domain';
import {
  clearAllWorkspaceData,
  seedSampleManufacturingData,
} from '../services/firestoreService';
import { FinishedStockModal, FinishedStockModalMode } from './FinishedStockModal';
import { formatDate } from '../utils/formatters';

interface OverviewViewProps {
  ownerId: string;
  workspaceSettings: Omit<WorkspaceSettings, 'ownerId' | 'updatedAt'>;
  onOpenSettingsModal: () => void;
  materials: RawMaterial[];
  formulas: Formula[];
  ingredients: FormulaIngredient[];
  batches: ProductionBatch[];
  sales: ProductSale[];
  purchaseOrders: PurchaseOrder[];
  onNavigate: (
    tab: 'overview' | 'materials' | 'formulas' | 'batches' | 'simulator' | 'reports' | 'help'
  ) => void;
  onLaunchBatchModal: (formulaId: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  ownerId,
  workspaceSettings,
  onOpenSettingsModal,
  materials,
  formulas,
  ingredients,
  batches,
  sales,
  purchaseOrders,
  onNavigate,
  onLaunchBatchModal,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [stockModalFormula, setStockModalFormula] = useState<Formula | null>(null);
  const [stockModalMode, setStockModalMode] = useState<FinishedStockModalMode>('sell');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSeedData = async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedSampleManufacturingData(ownerId);
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Failed to load sample data');
    } finally {
      setSeeding(false);
    }
  };

  const handleResetAllData = async () => {
    setResetting(true);
    setSeedError(null);
    try {
      await clearAllWorkspaceData(ownerId);
      setIsResetModalOpen(false);
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Failed to clear workspace data');
    } finally {
      setResetting(false);
    }
  };

  const rawInventoryValue = useMemo(
    () => materials.reduce((sum, m) => sum + m.stockQuantity * m.costPerUnit, 0),
    [materials]
  );

  const lowStockMaterials = useMemo(
    () => materials.filter((m) => m.stockQuantity <= m.reorderPoint),
    [materials]
  );

  const formulaRows = useMemo(() => {
    return formulas.map((formula) => {
      const fIngs = ingredients.filter((i) => i.formulaId === formula.id);
      const econ = calculateFormulaEconomics(formula, fIngs, materials);
      return {
        formula,
        econ,
      };
    });
  }, [formulas, ingredients, materials]);

  const finishedInventoryMetrics = useMemo(() => {
    let totalUnits = 0;
    let retailValue = 0;
    let costValue = 0;
    for (const row of formulaRows) {
      const units = row.formula.finishedStockUnits;
      totalUnits += units;
      retailValue += units * row.formula.sellingPricePerUnit;
      costValue += units * row.econ.costPerUnit;
    }
    return {
      totalUnits,
      retailValue,
      embeddedProfit: retailValue - costValue,
    };
  }, [formulaRows]);

  const salesSummary = useMemo(() => {
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.totalProfit, 0);
    const totalUnitsSold = sales.reduce((sum, s) => sum + s.quantitySold, 0);
    return {
      count: sales.length,
      totalRevenue,
      totalProfit,
      totalUnitsSold,
    };
  }, [sales]);

  const isEmptyWorkspace = materials.length === 0 && formulas.length === 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Beginner Help Callout Strip (Always visible on desktop, or on mobile when workspace is empty) */}
      <div
        className={`${
          isEmptyWorkspace ? 'flex' : 'hidden sm:flex'
        } bg-teal-50/80 border border-teal-200 rounded-lg px-4 py-3 flex-col sm:flex-row sm:items-center justify-between gap-3`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <CircleHelp className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
          <p className="text-xs text-slate-800">
            <strong className="font-semibold text-slate-900">
              Not sure how this app works?
            </strong>{' '}
            Read our plain-English 3-step guide (like baking a cake: Ingredients → Recipe → Batch).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('help')}
          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[32px] px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Open Beginner Help Guide</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Configurable Hero / Operation Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-500">
              {workspaceSettings.industryLabel}
            </p>
            <span className="text-xs text-slate-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={onOpenSettingsModal}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline cursor-pointer py-0.5"
            >
              <Edit3 className="w-3 h-3" />
              Edit Title & Industry
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1 text-balance">
            {workspaceSettings.workspaceTitle}
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            {workspaceSettings.workspaceSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span className="truncate">Monthly Report</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">Title</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('help')}
            className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CircleHelp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">How It Works</span>
          </button>
        </div>
      </div>

      {seedError && (
        <div className="p-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {seedError}
        </div>
      )}

      {/* Onboarding Empty State Banner */}
      {isEmptyWorkspace && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Initialize Your Production & Inventory Workspace
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              Customize your business name, title, and product categories for any industry (cosmetics, food &amp; beverage, candles, soaps, or household cleaners). Add your own raw materials from scratch, or load a ready-to-explore sample manufacturing dataset.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 mt-5">
              <button
                type="button"
                onClick={() => onNavigate('help')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
              >
                <CircleHelp className="w-4 h-4 shrink-0" />
                <span>Read Step-by-Step Beginner Guide</span>
              </button>
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedData}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[38px] px-4 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4 shrink-0" />
                <span>{seeding ? 'Populating Sample Data...' : 'Load Sample Manufacturing Dataset'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                <span>Add Raw Materials Manually</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive 2x2 Mobile / 4-Column Desktop KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Money in Unused Supplies
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₱{rawInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span className="truncate">{materials.length} items on shelf</span>
            <span className="shrink-0">{purchaseOrders.length} buys</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Products Ready to Sell
          </span>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            ₱{finishedInventoryMetrics.retailValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono tabular-nums">
            <span className="truncate">{finishedInventoryMetrics.totalUnits.toLocaleString()} items</span>
            <span className="text-teal-800 font-medium shrink-0">
              +₱{finishedInventoryMetrics.embeddedProfit.toFixed(0)} profit
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Actual Sales &amp; Profit Earned
          </span>
          <div className="text-lg sm:text-2xl font-bold text-teal-800 font-mono tabular-nums mt-1">
            +₱{salesSummary.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono tabular-nums">
            <span className="truncate">₱{salesSummary.totalRevenue.toFixed(2)} sales</span>
            <button
              type="button"
              onClick={() => onNavigate('batches')}
              className="text-teal-700 hover:underline font-sans font-medium shrink-0 cursor-pointer"
            >
              {salesSummary.totalUnitsSold} sold →
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Supplies Running Low
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-lg sm:text-2xl font-bold font-mono tabular-nums ${
                lowStockMaterials.length > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {lowStockMaterials.length}
            </span>
            <span className="text-[11px] text-slate-500 truncate">need restock</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span className="truncate">{formulas.length} recipes</span>
            <button
              type="button"
              onClick={() => onNavigate('materials')}
              className="text-teal-700 hover:underline font-medium cursor-pointer shrink-0"
            >
              Buy More →
            </button>
          </div>
        </div>
      </div>

      {/* Product Line Profitability & Unit Economics (Desktop Table + Mobile Cards) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-900">
              Your Products: Cost to Make vs. Profit You Keep
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically calculated from the current prices of your ingredients and bottles
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap cursor-pointer py-1"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Test Prices in Profit Calculator
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {formulaRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No product recipes created yet. Add your recipes or click &ldquo;Load Sample Manufacturing Dataset&rdquo; above.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Product Name · Group</th>
                    <th className="py-3 px-4 text-right">1 Batch Makes</th>
                    <th className="py-3 px-4 text-right">Supplies Cost (1 Batch)</th>
                    <th className="py-3 px-4 text-right">Worker + Misc</th>
                    <th className="py-3 px-4 text-right">Cost to Make 1</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Profit You Keep</th>
                    <th className="py-3 px-4 text-right">Ready to Sell</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {formulaRows.map(({ formula, econ }) => {
                    const meetsTarget = econ.grossMarginPercent >= formula.targetMarginPercent;
                    return (
                      <tr key={formula.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900">{formula.name}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">{formula.sku}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formula.productCategory}</span>
                            <span aria-hidden="true">·</span>
                            <span>Can make {econ.maxProducibleBatches} batches now</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                          {formula.batchYieldUnits} × {formula.unitLabel}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          ₱{econ.rawMaterialCostPerBatch.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          ₱{(formula.laborCostPerBatch + formula.overheadCostPerBatch).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          ₱{econ.costPerUnit.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                          ₱{formula.sellingPricePerUnit.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <div className="font-semibold text-teal-800">
                            +₱{econ.grossProfitPerUnit.toFixed(2)} each
                          </div>
                          <div
                            className={`text-xs ${
                              meetsTarget ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {econ.grossMarginPercent.toFixed(1)}% (Goal {formula.targetMarginPercent}%)
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                          <div className="font-semibold">
                            {formula.finishedStockUnits.toLocaleString()} × {formula.unitLabel}
                          </div>
                          <div className="text-xs text-slate-500">
                            ₱{(formula.finishedStockUnits * formula.sellingPricePerUnit).toFixed(2)} value
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setStockModalFormula(formula);
                                setStockModalMode('sell');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <ShoppingBag className="w-3 h-3 text-teal-700" />
                              Record Sale (-)
                            </button>
                            <button
                              type="button"
                              onClick={() => onLaunchBatchModal(formula.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              Make Batch (+)
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (Decluttered: Product Name, Ready to Sell, Selling Price & Actions) */}
            <div className="md:hidden divide-y divide-slate-200">
              {formulaRows.map(({ formula }) => {
                const isOut = formula.finishedStockUnits <= 0;
                return (
                  <div key={formula.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900">{formula.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          ₱{formula.sellingPricePerUnit.toFixed(2)} each
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div
                          className={`text-sm font-bold ${
                            isOut ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {formula.finishedStockUnits.toLocaleString()} × {formula.unitLabel}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isOut ? 'Out of stock' : 'Ready to Sell'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setStockModalFormula(formula);
                          setStockModalMode('sell');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
                        Record Sale (-)
                      </button>
                      <button
                        type="button"
                        onClick={() => onLaunchBatchModal(formula.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Make Batch (+)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <FinishedStockModal
        ownerId={ownerId}
        isOpen={Boolean(stockModalFormula)}
        initialMode={stockModalMode}
        formula={stockModalFormula}
        ingredients={ingredients}
        materials={materials}
        onClose={() => setStockModalFormula(null)}
      />


      {/* Bottom 2-Column Split: Low Stock Alerts & Recent Production Runs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Low Stock Materials (Hidden on mobile when 0 items are low so mobile stays uncluttered) */}
        <div
          className={`${
            lowStockMaterials.length === 0 ? 'hidden lg:flex' : 'flex'
          } bg-white border border-slate-200 rounded-lg overflow-hidden flex-col justify-between`}
        >
          <div>
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Supplies Running Low on Your Shelf
                </h3>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  Ingredients and bottles that dropped below your warning level
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="text-xs font-medium text-teal-700 hover:underline cursor-pointer py-1"
              >
                See All Supplies
              </button>
            </div>

            {lowStockMaterials.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                All of your ingredients and bottles have plenty of stock right now.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {lowStockMaterials.slice(0, 5).map((mat) => (
                  <div
                    key={mat.id}
                    className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">{mat.name}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5 truncate">
                        {mat.category} · {mat.supplierName}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-semibold text-amber-700">
                        Only {mat.stockQuantity} {mat.unit} left
                      </div>
                      <div className="text-slate-500">
                        Warn below {mat.reorderPoint} {mat.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Production Batches */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Recent Batches You Made
                </h3>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  Latest products mixed and how much profit they made
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('batches')}
                className="text-xs font-medium text-teal-700 hover:underline cursor-pointer py-1"
              >
                See All Batches
              </button>
            </div>

            {batches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No batches made yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {batches.slice(0, 3).map((batch) => (
                  <div
                    key={batch.id}
                    className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{batch.formulaName}</div>
                      <div className="text-slate-500 mt-0.5 truncate text-[11px]">
                        <span className="font-mono text-slate-600">{formatDate(batch.createdAt)}</span> · Made{' '}
                        {batch.unitsProduced} × {batch.unitLabel}
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
      </div>

      {/* Reset / Clear Sample Data to Start Live Footer Card */}
      {!isEmptyWorkspace && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Ready to switch from Sample Data to your real Live Business?
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Wipe all sample supplies, recipes, batches, and sales so you can start with a clean slate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear All Data &amp; Start Fresh
          </button>
        </div>
      )}

      {/* Safe Confirmation Modal for Resetting All Data */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-md w-full p-5 sm:p-6 shadow-xl">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Clear All Data &amp; Start Live?
                  </h3>
                  <p className="text-xs text-slate-500">
                    This will wipe your workspace clean
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                This will permanently delete all current items in your workspace:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 font-medium">
                <li>{materials.length} Supplies &amp; Raw Materials ({purchaseOrders.length} past purchases)</li>
                <li>{formulas.length} Product Recipes</li>
                <li>{batches.length} Batches Mixed &amp; {sales.length} Customer Sales</li>
              </ul>
              <p className="text-slate-500 pt-1">
                Once cleared, your workspace will be completely empty and ready for your real live supplies and recipes.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setIsResetModalOpen(false)}
                className="min-h-[42px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetAllData}
                className="min-h-[42px] sm:min-h-[36px] px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                {resetting ? 'Clearing All Data...' : 'Yes, Clear Everything & Start Live'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
