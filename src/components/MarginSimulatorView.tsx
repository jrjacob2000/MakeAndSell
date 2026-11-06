import React, { useMemo, useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';
import {
  calculateFormulaEconomics,
  Formula,
  FormulaIngredient,
  RawMaterial,
} from '../types/domain';
import { updateFormulaDetails } from '../services/firestoreService';

interface MarginSimulatorViewProps {
  formulas: Formula[];
  ingredients: FormulaIngredient[];
  materials: RawMaterial[];
}

export const MarginSimulatorView: React.FC<MarginSimulatorViewProps> = ({
  formulas,
  ingredients,
  materials,
}) => {
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    formulas[0]?.id || ''
  );
  const [rawMaterialInflationPct, setRawMaterialInflationPct] = useState<number>(0);
  const [simulatedSellingPrice, setSimulatedSellingPrice] = useState<number | null>(null);
  const [simulatedBatchScale, setSimulatedBatchScale] = useState<number>(1);
  const [wholesaleDiscountPct, setWholesaleDiscountPct] = useState<number>(15);
  const [monthlyFixedRentOverhead, setMonthlyFixedRentOverhead] = useState<number>(1200);
  const [savingPrice, setSavingPrice] = useState(false);
  const [showAdvancedSimControls, setShowAdvancedSimControls] = useState(false);

  const activeFormula = useMemo(
    () => formulas.find((f) => f.id === selectedFormulaId) || formulas[0] || null,
    [formulas, selectedFormulaId]
  );

  const activeIngredients = useMemo(() => {
    if (!activeFormula) return [];
    return ingredients.filter((i) => i.formulaId === activeFormula.id);
  }, [activeFormula, ingredients]);

  const baseEconomics = useMemo(() => {
    if (!activeFormula) return null;
    return calculateFormulaEconomics(activeFormula, activeIngredients, materials);
  }, [activeFormula, activeIngredients, materials]);

  const effectiveSellingPrice =
    simulatedSellingPrice !== null
      ? simulatedSellingPrice
      : activeFormula?.sellingPricePerUnit || 0;

  const simulation = useMemo(() => {
    if (!activeFormula || !baseEconomics) return null;

    const rawMatMultiplier = 1 + rawMaterialInflationPct / 100;
    const adjustedRawMatPerBatch =
      baseEconomics.rawMaterialCostPerBatch * rawMatMultiplier * simulatedBatchScale;

    // Larger batches enjoy partial labor efficiency (e.g. 2x batch takes 1.75x labor)
    const laborEfficiencyFactor =
      simulatedBatchScale > 1 ? Math.pow(simulatedBatchScale, 0.85) : simulatedBatchScale;
    const adjustedLabor = activeFormula.laborCostPerBatch * laborEfficiencyFactor;
    const adjustedOverhead = activeFormula.overheadCostPerBatch * simulatedBatchScale;

    const totalBatchCost = adjustedRawMatPerBatch + adjustedLabor + adjustedOverhead;
    const totalUnits = Math.max(1, Math.round(activeFormula.batchYieldUnits * simulatedBatchScale));
    const unitCost = totalBatchCost / totalUnits;

    // Retail channel economics
    const retailUnitProfit = effectiveSellingPrice - unitCost;
    const retailMarginPct =
      effectiveSellingPrice > 0 ? (retailUnitProfit / effectiveSellingPrice) * 100 : 0;
    const retailBatchProfit = retailUnitProfit * totalUnits;

    // Wholesale / Distributor channel economics
    const wholesalePrice = effectiveSellingPrice * (1 - wholesaleDiscountPct / 100);
    const wholesaleUnitProfit = wholesalePrice - unitCost;
    const wholesaleMarginPct =
      wholesalePrice > 0 ? (wholesaleUnitProfit / wholesalePrice) * 100 : 0;

    // Recommended price to hit formula's targetMarginPercent
    const targetMarginRatio = Math.min(0.95, Math.max(0.05, activeFormula.targetMarginPercent / 100));
    const recommendedPriceForTargetMargin = unitCost / (1 - targetMarginRatio);

    // Monthly break-even units to cover fixed plant rent/utilities
    const breakEvenUnitsRetail =
      retailUnitProfit > 0 ? Math.ceil(monthlyFixedRentOverhead / retailUnitProfit) : null;

    return {
      adjustedRawMatPerBatch,
      adjustedLabor,
      adjustedOverhead,
      totalBatchCost,
      totalUnits,
      unitCost,
      retailUnitProfit,
      retailMarginPct,
      retailBatchProfit,
      wholesalePrice,
      wholesaleUnitProfit,
      wholesaleMarginPct,
      recommendedPriceForTargetMargin,
      breakEvenUnitsRetail,
    };
  }, [
    activeFormula,
    baseEconomics,
    rawMaterialInflationPct,
    simulatedBatchScale,
    effectiveSellingPrice,
    wholesaleDiscountPct,
    monthlyFixedRentOverhead,
  ]);

  const handleApplySellingPrice = async (newPrice: number) => {
    if (!activeFormula) return;
    setSavingPrice(true);
    try {
      await updateFormulaDetails(activeFormula.id, {
        name: activeFormula.name,
        sku: activeFormula.sku,
        productCategory: activeFormula.productCategory,
        batchYieldUnits: activeFormula.batchYieldUnits,
        unitLabel: activeFormula.unitLabel,
        laborCostPerBatch: activeFormula.laborCostPerBatch,
        overheadCostPerBatch: activeFormula.overheadCostPerBatch,
        sellingPricePerUnit: Number(newPrice.toFixed(2)),
        finishedStockUnits: activeFormula.finishedStockUnits,
        targetMarginPercent: activeFormula.targetMarginPercent,
        notes: activeFormula.notes,
      });
      setSimulatedSellingPrice(null);
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Test Different Prices Before You Change Anything
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1">
            Simple Price &amp; Profit Calculator
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            Pick a product and slide the selling price to see how much profit you keep per item.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setRawMaterialInflationPct(0);
            setSimulatedSellingPrice(null);
            setSimulatedBatchScale(1);
            setWholesaleDiscountPct(15);
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Calculator
        </button>
      </div>

      {!activeFormula || !baseEconomics || !simulation ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 sm:p-12 text-center">
          <Calculator className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-900 mt-3">
            Create a product recipe first to test prices and profits
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Controls Column (2 Essential Steps Upfront + Optional Advanced Toggle) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4 sm:p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                1. Pick a Product Recipe to Test
              </label>
              <select
                value={activeFormula.id}
                onChange={(e) => {
                  setSelectedFormulaId(e.target.value);
                  setSimulatedSellingPrice(null);
                }}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {formulas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.unitLabel})
                  </option>
                ))}
              </select>
            </div>

            {/* Control 1: Simulated Selling Price */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="font-semibold text-slate-800">
                  2. Test a Selling Price for 1 {activeFormula.unitLabel}
                </label>
                <span className="font-mono text-sm font-bold text-teal-800">
                  ₱{effectiveSellingPrice.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={Math.max(0.5, Number((baseEconomics.costPerUnit * 0.8).toFixed(2)))}
                max={Math.max(10, Number((baseEconomics.costPerUnit * 4).toFixed(2)))}
                step="0.05"
                value={effectiveSellingPrice}
                onChange={(e) => setSimulatedSellingPrice(parseFloat(e.target.value))}
                className="w-full h-2 accent-teal-700 cursor-pointer mt-2"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
                <span>Current Price: ₱{activeFormula.sellingPricePerUnit.toFixed(2)}</span>
                <span>
                  Suggested ({activeFormula.targetMarginPercent}%): ₱
                  {simulation.recommendedPriceForTargetMargin.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Optional Advanced What-If Controls */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAdvancedSimControls((v) => !v)}
                className="w-full py-2 px-3 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>
                  {showAdvancedSimControls
                    ? 'Hide Extra "What-If" Options'
                    : '+ More "What-If" Options (Reseller Discount, Ingredient Cost, Bills)'}
                </span>
                <span className="text-[11px] text-teal-700 font-semibold">
                  {showAdvancedSimControls ? 'Hide' : 'Show'}
                </span>
              </button>

              {showAdvancedSimControls && (
                <div className="mt-4 space-y-5 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                  {/* Control 2: Raw Material Price Shock */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label className="font-semibold text-slate-800">
                        What If Supplier Ingredient Prices Change?
                      </label>
                      <span className="font-mono font-semibold text-slate-900">
                        {rawMaterialInflationPct > 0
                          ? `+${rawMaterialInflationPct}%`
                          : `${rawMaterialInflationPct}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-25"
                      max="50"
                      step="1"
                      value={rawMaterialInflationPct}
                      onChange={(e) => setRawMaterialInflationPct(parseInt(e.target.value, 10))}
                      className="w-full h-2 accent-teal-700 cursor-pointer mt-1"
                    />
                    <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                      <span>25% Cheaper</span>
                      <span>0%</span>
                      <span>50% Pricier</span>
                    </div>
                  </div>

                  {/* Control 3: Batch Scale Multiplier */}
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <label className="font-semibold text-slate-800">
                        How Big Is Your Batch? ({simulation.totalUnits} items)
                      </label>
                      <span className="font-mono font-semibold text-slate-900">
                        {simulatedBatchScale}x Recipe
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 5, 10].map((scale) => (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => setSimulatedBatchScale(scale)}
                          className={`min-h-[38px] py-1.5 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                            simulatedBatchScale === scale
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {scale}x ({scale * activeFormula.batchYieldUnits})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Control 4: Wholesale Discount & Monthly Overhead */}
                  <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Reseller Discount (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={wholesaleDiscountPct}
                        onChange={(e) =>
                          setWholesaleDiscountPct(Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Monthly Rent &amp; Bills (₱)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={monthlyFixedRentOverhead}
                        onChange={(e) =>
                          setMonthlyFixedRentOverhead(Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Simulated Unit Economics Comparison */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">
                Your Profit Per Item (At ₱{effectiveSellingPrice.toFixed(2)})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Shows your cost to make 1 item vs. how much profit you keep
              </p>

              <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-4 pt-4 border-t border-slate-200">
                <div>
                  <span className="text-[11px] sm:text-xs text-slate-500 block">Cost to Make 1</span>
                  <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    ₱{simulation.unitCost.toFixed(2)}
                  </div>
                  <p className="hidden sm:block text-xs text-slate-500 mt-1 font-mono">
                    1 batch: ₱{simulation.totalBatchCost.toFixed(2)}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] sm:text-xs text-slate-500 block">Selling Price</span>
                  <div className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    ₱{effectiveSellingPrice.toFixed(2)}
                  </div>
                  <p className="hidden sm:block text-xs text-slate-500 mt-1 font-mono">
                    Saved: ₱{activeFormula.sellingPricePerUnit.toFixed(2)}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] sm:text-xs text-slate-500 block">Profit You Keep</span>
                  <div
                    className={`text-lg sm:text-2xl font-bold font-mono tabular-nums mt-1 ${
                      simulation.retailMarginPct >= activeFormula.targetMarginPercent
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    +₱{simulation.retailUnitProfit.toFixed(2)}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-1 font-mono">
                    {simulation.retailMarginPct.toFixed(1)}% margin
                  </p>
                </div>
              </div>

              {/* Actionable Price Update Recommendation */}
              <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="text-xs text-slate-600 leading-relaxed">
                  Profit from 1 full batch ({simulation.totalUnits} × {activeFormula.unitLabel}):{' '}
                  <strong className="font-mono text-teal-800">
                    +₱{simulation.retailBatchProfit.toFixed(2)}
                  </strong>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  {simulatedSellingPrice !== null && (
                    <button
                      type="button"
                      disabled={savingPrice}
                      onClick={() => handleApplySellingPrice(effectiveSellingPrice)}
                      className="min-h-[42px] sm:min-h-[36px] px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {savingPrice
                        ? 'Saving...'
                        : `Save ₱${effectiveSellingPrice.toFixed(2)} as New Price`}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingPrice}
                    onClick={() =>
                      handleApplySellingPrice(simulation.recommendedPriceForTargetMargin)
                    }
                    className="min-h-[42px] sm:min-h-[36px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Use Suggested Price (₱{simulation.recommendedPriceForTargetMargin.toFixed(2)})
                  </button>
                </div>
              </div>
            </div>

            {/* Extra Break-Even & Wholesale Details (Shown when Advanced Options are open) */}
            {showAdvancedSimControls && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-slate-900">
                  Reseller Profit &amp; Monthly Break-Even
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-3 pt-3 border-t border-slate-200 text-xs">
                  <div className="p-3.5 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block">
                      Reseller Profit (-{wholesaleDiscountPct}%)
                    </span>
                    <strong className="text-base font-mono text-slate-900 mt-0.5 block">
                      +₱{simulation.wholesaleUnitProfit.toFixed(2)} / item
                    </strong>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Sold at ₱{simulation.wholesalePrice.toFixed(2)} ({simulation.wholesaleMarginPct.toFixed(1)}%)
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block">Items to Sell to Pay Bills</span>
                    <strong className="text-base font-mono text-slate-900 mt-0.5 block">
                      {simulation.breakEvenUnitsRetail !== null
                        ? `${simulation.breakEvenUnitsRetail.toLocaleString()} items / mo`
                        : 'Losing money per item'}
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      To cover ₱{monthlyFixedRentOverhead.toLocaleString()} monthly bills
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-slate-500 block">
                      Cost to Make {simulatedBatchScale}x Batch
                    </span>
                    <strong className="text-base font-mono text-slate-900 mt-0.5 block">
                      ₱{simulation.totalBatchCost.toFixed(2)}
                    </strong>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Makes {simulation.totalUnits.toLocaleString()} × {activeFormula.unitLabel}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
