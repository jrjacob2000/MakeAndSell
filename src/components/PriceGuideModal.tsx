import React, { useMemo, useState } from 'react';
import {
  Calculator,
  Download,
  Info,
  Package,
  Printer,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Formula,
  FormulaIngredient,
  RawMaterial,
  calculateFormulaEconomics,
} from '../types/domain';
import { exportPriceGuideToCsv } from '../utils/csvExport';

interface PriceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandName: string;
  formulas: Formula[];
  ingredients: FormulaIngredient[];
  materials: RawMaterial[];
}

type VolumeUnit = 'L' | 'mL' | 'gal' | 'fl_oz';

export const PriceGuideModal: React.FC<PriceGuideModalProps> = ({
  isOpen,
  onClose,
  brandName,
  formulas,
  ingredients,
  materials,
}) => {
  // Converter tool state
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(
    formulas[0]?.id || ''
  );
  const [converterInput, setConverterInput] = useState<string>('1.5');
  const [converterUnit, setConverterUnit] = useState<VolumeUnit>('L');
  const [converterUnitsCount, setConverterUnitsCount] = useState<number>(1);
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0);

  const activeConverterFormula = useMemo(() => {
    return formulas.find((f) => f.id === selectedFormulaId) || formulas[0] || null;
  }, [formulas, selectedFormulaId]);

  const activeEconomics = useMemo(() => {
    if (!activeConverterFormula) return null;
    const formulaIngs = ingredients.filter((i) => i.formulaId === activeConverterFormula.id);
    return calculateFormulaEconomics(activeConverterFormula, formulaIngs, materials);
  }, [activeConverterFormula, ingredients, materials]);

  // Convert input value to Liters
  const convertedVolumeInLiters = useMemo(() => {
    const val = parseFloat(converterInput) || 0;
    if (val <= 0) return 0;
    switch (converterUnit) {
      case 'L':
        return val;
      case 'mL':
        return val / 1000;
      case 'gal':
        return val * 3.78541;
      case 'fl_oz':
        return val * 0.0295735;
      default:
        return val;
    }
  }, [converterInput, converterUnit]);

  // Converter calculations
  const converterResults = useMemo(() => {
    if (!activeEconomics || convertedVolumeInLiters <= 0) {
      return {
        unitRefillPrice: 0,
        subtotal: 0,
        discount: 0,
        finalTotal: 0,
        liquidCost: 0,
        profit: 0,
      };
    }
    const unitPrice = activeEconomics.suggestedRefillPricePerUnit * convertedVolumeInLiters;
    const count = Math.max(1, converterUnitsCount);
    const subtotal = unitPrice * count;
    const discount = subtotal * (customDiscountPercent / 100);
    const finalTotal = Math.max(0, subtotal - discount);
    const liquidCost = activeEconomics.liquidOnlyCostPerUnit * convertedVolumeInLiters * count;
    const profit = Math.max(0, finalTotal - liquidCost);

    return {
      unitRefillPrice: unitPrice,
      subtotal,
      discount,
      finalTotal,
      liquidCost,
      profit,
    };
  }, [activeEconomics, convertedVolumeInLiters, converterUnitsCount, customDiscountPercent]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    exportPriceGuideToCsv(formulas, ingredients, materials, brandName);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:fixed-none">
      <div className="relative bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col print:border-none print:shadow-none print:max-h-none">
        
        {/* Modal Top Bar - Hidden on print */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-teal-100 text-teal-800 rounded-md">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Printable Refill &amp; Product Price Guide
              </h2>
              <p className="text-xs text-slate-500">
                Ready-to-print counter cheat sheet for cashiers, refill stations, and bulk buyer discounts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Content */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 print:p-2 print:overflow-visible">
          
          {/* Printable Brand Header */}
          <div className="border-b-2 border-teal-700 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-teal-800 uppercase">
                Official Retail &amp; Refill Station Price Card
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-sans tracking-tight">
                {brandName}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                Save money &amp; reduce plastic: bring your own container or buy pre-bottled fresh batches.
              </p>
            </div>
            <div className="text-right text-xs font-mono text-slate-500">
              Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          {/* SECTION: PRODUCT PRICE TABLE */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-teal-700" />
              Product Price Menu (Bottled vs. Refill)
            </h3>

            {formulas.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                No products configured yet. Create products in the &ldquo;2. Product Recipes&rdquo; tab.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 text-right">Standard Bottled</th>
                      <th className="py-2.5 px-2.5 text-right bg-teal-50/60 text-teal-900">
                        500 mL Refill
                      </th>
                      <th className="py-2.5 px-2.5 text-right bg-teal-50/60 text-teal-900">
                        1 Liter Refill
                      </th>
                      <th className="py-2.5 px-2.5 text-right bg-teal-50/60 text-teal-900">
                        1.5 L Jug Refill
                      </th>
                      <th className="py-2.5 px-2.5 text-right bg-teal-50/60 text-teal-900">
                        1 Gallon Refill (3.8L)
                      </th>
                      <th className="py-2.5 px-2.5 text-right bg-teal-50/60 text-teal-900">
                        5 Gal Drum (18.9L)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {formulas.map((f) => {
                      const formulaIngs = ingredients.filter((i) => i.formulaId === f.id);
                      const econ = calculateFormulaEconomics(f, formulaIngs, materials);
                      const refPerL = econ.suggestedRefillPricePerUnit;

                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                            {f.name}
                            <span className="block text-[10px] font-mono font-normal text-slate-400">
                              {f.sku} · {f.unitLabel || '1L Bottle'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            ₱{f.sellingPricePerUnit.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-teal-900 font-bold bg-teal-50/30">
                            ₱{(refPerL * 0.5).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-teal-900 font-bold bg-teal-50/30">
                            ₱{(refPerL * 1.0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-teal-900 font-bold bg-teal-50/30">
                            ₱{(refPerL * 1.5).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-teal-900 font-bold bg-teal-50/30">
                            ₱{(refPerL * 3.785).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-teal-900 font-bold bg-teal-50/30">
                            ₱{(refPerL * 18.9).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION: BULK BUYER DISCOUNT GUIDELINES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bulk Buyer Discount Tiers (Recommended)
              </h4>
              <p className="text-[11px] text-slate-600">
                Reward customers who purchase multiple refills or cases in a single visit:
              </p>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                  <span className="font-sans font-medium text-slate-700">Small Bulk (5 - 9 units):</span>
                  <strong className="text-teal-800">5% OFF Order</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                  <span className="font-sans font-medium text-slate-700">Medium Bulk (10 - 19 units):</span>
                  <strong className="text-teal-800">10% OFF Order</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                  <span className="font-sans font-medium text-slate-700">Commercial / Bulk (20+ units):</span>
                  <strong className="text-teal-800">15% OFF Order</strong>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Common Container Size Conversion Table
              </h4>
              <p className="text-[11px] text-slate-600">
                Quick conversion cheat sheet when customers bring non-metric jugs:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>1 US Gallon</strong> = 3.785 Liters (128 fl oz)
                </div>
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>1.5 Liters</strong> = 1,500 mL (50.7 fl oz)
                </div>
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>1.0 Liter</strong> = 1,000 mL (33.8 fl oz)
                </div>
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>500 mL</strong> = 0.5 Liters (16.9 fl oz)
                </div>
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>5 Gallon Jug</strong> = 18.9 Liters (640 fl oz)
                </div>
                <div className="p-1.5 bg-white rounded border border-slate-200">
                  <strong>1 fl oz</strong> ≈ 29.6 mL (0.0296 L)
                </div>
              </div>
            </div>
          </div>

          {/* SECTION: INTERACTIVE QUICK VOLUME & DISCOUNT CONVERTER (Hidden on print) */}
          <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-3.5 print:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950 uppercase tracking-wide">
                <Calculator className="w-4 h-4 text-teal-800" />
                Live Walk-in Refill Price &amp; Discount Calculator
              </div>
              <span className="text-[11px] text-teal-800 font-medium">
                Instant counter tool for custom containers
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Product</label>
                <select
                  value={selectedFormulaId}
                  onChange={(e) => setSelectedFormulaId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900 font-sans"
                >
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Container Size &amp; Unit</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={converterInput}
                    onChange={(e) => setConverterInput(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-900"
                    placeholder="1.5"
                  />
                  <select
                    value={converterUnit}
                    onChange={(e) => setConverterUnit(e.target.value as VolumeUnit)}
                    className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    <option value="L">Liters (L)</option>
                    <option value="mL">Milliliters (mL)</option>
                    <option value="gal">Gallons (US)</option>
                    <option value="fl_oz">Fluid Oz (fl oz)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Number of Containers</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={converterUnitsCount}
                  onChange={(e) => setConverterUnitsCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Bulk Discount (% Off)</label>
                <div className="flex gap-1">
                  {[0, 5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCustomDiscountPercent(pct)}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                        customDiscountPercent === pct
                          ? 'bg-teal-700 text-white'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pct === 0 ? '0%' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Computed Output Card */}
            <div className="bg-white border border-teal-200 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-teal-100 text-teal-800 rounded-full">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <div>
                  <div className="font-semibold text-slate-900">
                    Volume per jug: <span className="font-mono">{convertedVolumeInLiters.toFixed(3)} Liters</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {converterUnitsCount} × container(s) = {(convertedVolumeInLiters * converterUnitsCount).toFixed(2)} L total liquid dispensed
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                {converterResults.discount > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 block line-through">
                      ₱{converterResults.subtotal.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-amber-700 font-semibold">
                      -₱{converterResults.discount.toFixed(2)} ({customDiscountPercent}% off)
                    </span>
                  </div>
                )}
                <div className="bg-teal-700 text-white px-3 py-1.5 rounded-lg shadow-xs font-mono">
                  <span className="text-[10px] block font-sans uppercase font-medium text-teal-200">
                    Charge Customer
                  </span>
                  <strong className="text-base sm:text-lg font-bold">
                    ₱{converterResults.finalTotal.toFixed(2)}
                  </strong>
                </div>
                <div className="text-right hidden sm:block">
                  <span className="text-[10px] text-slate-500 block">Take-home Profit</span>
                  <strong className="text-teal-800 font-mono text-sm">
                    +₱{converterResults.profit.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer (Hidden on print) */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between print:hidden shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400" />
            <span>Refill prices exclude bottle packaging cost to reward eco-friendly customers.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
