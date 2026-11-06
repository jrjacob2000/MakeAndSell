import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  Edit3,
  Package,
  ShoppingBag,
  X,
} from 'lucide-react';
import {
  calculateFormulaEconomics,
  COMMON_CONTAINER_PRESETS,
  Formula,
  FormulaIngredient,
  RawMaterial,
} from '../types/domain';
import {
  recordProductSale,
  updateFinishedProductStock,
} from '../services/firestoreService';

export type FinishedStockModalMode = 'sell' | 'adjust';

interface FinishedStockModalProps {
  ownerId: string;
  isOpen: boolean;
  initialMode?: FinishedStockModalMode;
  formula: Formula | null;
  ingredients: FormulaIngredient[];
  materials: RawMaterial[];
  onClose: () => void;
}

export const FinishedStockModal: React.FC<FinishedStockModalProps> = ({
  ownerId,
  isOpen,
  initialMode = 'sell',
  formula,
  ingredients,
  materials,
  onClose,
}) => {
  const [mode, setMode] = useState<FinishedStockModalMode>(initialMode);
  const [isRefillSale, setIsRefillSale] = useState(false);

  // Container sizing state (supports 500mL, 1L, 1.5L, 1 Gallon, custom, etc.)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('1l');
  const [customContainerVolume, setCustomContainerVolume] = useState('1.5');
  const [containerCount, setContainerCount] = useState('1');

  // Flexible, non-fixed discount state
  // We keep the final cash total as the master editable input, and also let users adjust via % off or $ off
  const [totalCashPrice, setTotalCashPrice] = useState('0');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');

  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleDateTime, setSaleDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [exactStockQty, setExactStockQty] = useState('0');
  const [showExtraSaleFields, setShowExtraSaleFields] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const formulaIngredients = ingredients.filter((i) => i.formulaId === formula?.id);
  const econ = formula
    ? calculateFormulaEconomics(formula, formulaIngredients, materials)
    : null;

  // Compute container volume factor (1.0 = standard 1 unit / 1 Liter)
  const activePreset = COMMON_CONTAINER_PRESETS.find((p) => p.id === selectedPresetId);
  const volumePerContainer =
    selectedPresetId === 'custom'
      ? Math.max(0.01, parseFloat(customContainerVolume) || 1)
      : activePreset?.volumeFactor || 1;

  const parsedContainerCount = Math.max(0.1, parseFloat(containerCount) || 1);
  const totalVolumeToDeduct = Number((parsedContainerCount * volumePerContainer).toFixed(2));

  // Base price per liter/unit (regular price vs liquid-only refill price)
  const baseRatePerUnit = formula
    ? isRefillSale && econ
      ? econ.suggestedRefillPricePerUnit
      : formula.sellingPricePerUnit
    : 0;

  const baseCostPerUnit = formula
    ? isRefillSale && econ
      ? econ.liquidOnlyCostPerUnit
      : econ?.costPerUnit || 0
    : 0;

  // Regular price before any discount
  const regularTotalPrice = Number((totalVolumeToDeduct * baseRatePerUnit).toFixed(2));
  const totalLiquidCost = Number((totalVolumeToDeduct * baseCostPerUnit).toFixed(2));

  // Reset/Initialize form when opened
  useEffect(() => {
    if (isOpen && formula && econ) {
      setMode(initialMode);
      setIsRefillSale(false);
      setSelectedPresetId('1l');
      setCustomContainerVolume('1.5');
      setContainerCount('1');

      const regular = Number(formula.sellingPricePerUnit.toFixed(2));
      setTotalCashPrice(String(regular));
      setDiscountPercent('0');
      setDiscountAmount('0');

      setCustomerName('Walk-in Customer');
      setSaleNotes('');
      setExactStockQty(String(formula.finishedStockUnits));
      setShowExtraSaleFields(false);
      setErrorMsg(null);
    }
  }, [isOpen, initialMode, formula]);

  if (!isOpen || !formula || !econ) return null;

  const currentStock = formula.finishedStockUnits;

  // Helper to sync prices when container size, refill toggle, or count changes
  const recalculateFromNewBase = (
    newVolume: number,
    isRefill: boolean,
    keepDiscountPct = '0'
  ) => {
    const rate = isRefill ? econ.suggestedRefillPricePerUnit : formula.sellingPricePerUnit;
    const regular = Number((newVolume * rate).toFixed(2));
    const pct = Math.min(100, Math.max(0, parseFloat(keepDiscountPct) || 0));
    const discAmt = Number(((regular * pct) / 100).toFixed(2));
    const finalPrice = Math.max(0, Number((regular - discAmt).toFixed(2)));

    setTotalCashPrice(String(finalPrice));
    setDiscountPercent(String(pct));
    setDiscountAmount(String(discAmt));
  };

  const handleToggleRefillSale = (refill: boolean) => {
    setIsRefillSale(refill);
    recalculateFromNewBase(totalVolumeToDeduct, refill, discountPercent);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    let vol = 1;
    if (presetId === 'custom') {
      vol = Math.max(0.01, parseFloat(customContainerVolume) || 1);
    } else {
      const p = COMMON_CONTAINER_PRESETS.find((x) => x.id === presetId);
      vol = p?.volumeFactor || 1;
    }
    const newTotalVol = Number((parsedContainerCount * vol).toFixed(2));
    recalculateFromNewBase(newTotalVol, isRefillSale, discountPercent);
  };

  const handleCustomVolumeChange = (val: string) => {
    setCustomContainerVolume(val);
    const vol = Math.max(0.01, parseFloat(val) || 1);
    const newTotalVol = Number((parsedContainerCount * vol).toFixed(2));
    recalculateFromNewBase(newTotalVol, isRefillSale, discountPercent);
  };

  const handleContainerCountChange = (val: string) => {
    setContainerCount(val);
    const cnt = Math.max(0.1, parseFloat(val) || 1);
    const newTotalVol = Number((cnt * volumePerContainer).toFixed(2));
    recalculateFromNewBase(newTotalVol, isRefillSale, discountPercent);
  };

  // Discount adjustment handlers (two-way synchronized)
  const handleFinalPriceChange = (val: string) => {
    setTotalCashPrice(val);
    const finalPrice = Math.max(0, parseFloat(val) || 0);
    const savings = Math.max(0, Number((regularTotalPrice - finalPrice).toFixed(2)));
    setDiscountAmount(String(savings));
    const impliedPct =
      regularTotalPrice > 0 ? Number(((savings / regularTotalPrice) * 100).toFixed(1)) : 0;
    setDiscountPercent(String(impliedPct));
  };

  const handleDiscountPercentChange = (pctStr: string) => {
    setDiscountPercent(pctStr);
    const pct = Math.min(100, Math.max(0, parseFloat(pctStr) || 0));
    const discAmt = Number(((regularTotalPrice * pct) / 100).toFixed(2));
    const finalPrice = Math.max(0, Number((regularTotalPrice - discAmt).toFixed(2)));
    setDiscountAmount(String(discAmt));
    setTotalCashPrice(String(finalPrice));
  };

  const handleDiscountAmountChange = (amtStr: string) => {
    setDiscountAmount(amtStr);
    const amt = Math.min(regularTotalPrice, Math.max(0, parseFloat(amtStr) || 0));
    const finalPrice = Math.max(0, Number((regularTotalPrice - amt).toFixed(2)));
    setTotalCashPrice(String(finalPrice));
    const impliedPct =
      regularTotalPrice > 0 ? Number(((amt / regularTotalPrice) * 100).toFixed(1)) : 0;
    setDiscountPercent(String(impliedPct));
  };

  // Math summary values
  const parsedCollectedCash = Math.max(0, parseFloat(totalCashPrice) || 0);
  const parsedSavings = Math.max(0, Number((regularTotalPrice - parsedCollectedCash).toFixed(2)));
  const parsedDiscountPct =
    regularTotalPrice > 0
      ? Number(((parsedSavings / regularTotalPrice) * 100).toFixed(1))
      : 0;
  const realProfit = Number((parsedCollectedCash - totalLiquidCost).toFixed(2));
  const remainingStock = Math.max(0, Number((currentStock - totalVolumeToDeduct).toFixed(2)));
  const isSellingBelowCost = parsedCollectedCash < totalLiquidCost;

  const containerLabelText =
    selectedPresetId === 'custom'
      ? `${customContainerVolume}L Container`
      : activePreset?.name || 'Standard Container';

  // Exact stock adjust mode
  const parsedExactStock = Math.max(0, parseFloat(exactStockQty) || 0);
  const stockDifference = Number((parsedExactStock - currentStock).toFixed(2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'sell') {
      if (totalVolumeToDeduct <= 0) {
        setErrorMsg('Please enter a valid container size and quantity.');
        return;
      }
      if (totalVolumeToDeduct > currentStock) {
        setErrorMsg(
          `You only have ${currentStock} × ${formula.unitLabel} on your shelf right now. You are trying to sell ${totalVolumeToDeduct}. Please make a new batch first or fix your shelf count.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'sell') {
        const refillTag = isRefillSale
          ? `[REFILL ${parsedContainerCount}x ${containerLabelText} (${totalVolumeToDeduct}L)]`
          : `[BOTTLED ${parsedContainerCount}x ${containerLabelText} (${totalVolumeToDeduct}L)]`;

        const discountTag =
          parsedSavings > 0
            ? `[Discount: ₱${parsedSavings.toFixed(2)} OFF (${parsedDiscountPct}%)]`
            : '[No Discount]';

        const finalNote = `${refillTag} ${discountTag} ${saleNotes.trim()}`.trim();

        await recordProductSale(ownerId, formula, baseCostPerUnit, {
          customerName: customerName.trim() || 'Walk-in Customer',
          quantitySold: totalVolumeToDeduct,
          sellingPricePerUnit:
            totalVolumeToDeduct > 0
              ? Number((parsedCollectedCash / totalVolumeToDeduct).toFixed(4))
              : 0,
          notes: finalNote,
          customDate: saleDateTime ? new Date(saleDateTime) : undefined,
        });
      } else {
        await updateFinishedProductStock(formula.id, parsedExactStock);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update finished product stock');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
      <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-xl w-full p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {mode === 'sell' ? 'Record a Customer Sale or Refill' : 'Fix Shelf Stock Count'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {formula.name} · Currently{' '}
              <strong className="font-mono text-slate-800">
                {currentStock} × {formula.unitLabel}
              </strong>{' '}
              available in bulk shelf stock
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg mt-4">
          <button
            type="button"
            onClick={() => {
              setMode('sell');
              setErrorMsg(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'sell'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-teal-700" />
            <span>Record a Sale or Refill (-)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('adjust');
              setErrorMsg(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'adjust'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-600" />
            <span>Fix Exact Shelf Count</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {errorMsg && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {errorMsg}
            </div>
          )}

          {mode === 'sell' ? (
            <>
              {/* Step 1: Sale Type (Bottled vs Refill) */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  1. Sale Type: Bottled or Customer Refill?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleRefillSale(false)}
                    className={`p-2.5 sm:p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      !isRefillSale
                        ? 'bg-teal-50/70 border-teal-600 text-slate-900 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Package className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="truncate">With Bottle</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      ₱{formula.sellingPricePerUnit.toFixed(2)}/L
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleRefillSale(true)}
                    className={`p-2.5 sm:p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      isRefillSale
                        ? 'bg-teal-50/70 border-teal-600 text-slate-900 ring-1 ring-teal-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Droplets className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="truncate">Refill Only</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      ₱{econ.suggestedRefillPricePerUnit.toFixed(2)}/L (no bottle)
                    </div>
                  </button>
                </div>
              </div>

              {/* Step 2: Container Size & Volume Selection */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-900">
                    2. Container Size &amp; Quantity
                  </label>
                  <span className="text-[11px] font-mono text-teal-800 font-semibold">
                    Total: {totalVolumeToDeduct} Liters
                  </span>
                </div>

                {/* Quick Container Size Chips */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {COMMON_CONTAINER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      className={`px-2 py-1.5 text-xs font-mono rounded-md border text-center transition-colors cursor-pointer ${
                        selectedPresetId === p.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold truncate">{p.shortLabel}</div>
                      <div className="text-[10px] opacity-80">{p.volumeFactor}L</div>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('custom')}
                    className={`px-2 py-1.5 text-xs font-mono rounded-md border text-center transition-colors cursor-pointer ${
                      selectedPresetId === 'custom'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Custom</div>
                    <div className="text-[10px] opacity-80">Any L</div>
                  </button>
                </div>

                {/* Custom size input or container count */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200">
                  {selectedPresetId === 'custom' ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Size per Container (L)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        required
                        value={customContainerVolume}
                        onChange={(e) => handleCustomVolumeChange(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Selected Container
                      </label>
                      <div className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-800 truncate">
                        {activePreset?.shortLabel} ({volumePerContainer}L)
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      How Many Containers?
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="1000"
                      required
                      value={containerCount}
                      onChange={(e) => handleContainerCountChange(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Total Cash Price & Quick Discount */}
              <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-lg space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900">
                      3. Total Cash Price Customer Pays (₱)
                    </label>
                    <span className="block text-[11px] text-slate-600">
                      Regular for {totalVolumeToDeduct}L is <strong>₱{regularTotalPrice.toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="sm:w-44">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={totalCashPrice}
                      onChange={(e) => handleFinalPriceChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900"
                    />
                  </div>
                </div>

                {/* Quick percentage discount presets */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {['0', '5', '10', '15', '20'].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleDiscountPercentChange(pct)}
                        className={`px-2 py-1 text-[11px] font-mono font-semibold rounded border cursor-pointer ${
                          discountPercent === pct
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {pct === '0' ? 'No Disc' : `-${pct}%`}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-teal-900">
                    Profit: <strong className={realProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}>{realProfit >= 0 ? '+' : ''}₱{realProfit.toFixed(2)}</strong> · Left: <strong>{remainingStock}L</strong>
                  </span>
                </div>

                {isSellingBelowCost && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>
                      Careful! ₱{parsedCollectedCash.toFixed(2)} is below your ₱{totalLiquidCost.toFixed(2)} cost.
                    </span>
                  </div>
                )}
              </div>

              {/* Optional Customer Name, Custom Discount, Sale Date & Notes Toggle */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtraSaleFields((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>
                    {showExtraSaleFields
                      ? 'Hide Optional Sale Details'
                      : '+ Optional: Customer Name, Custom Discount, Date & Notes'}
                  </span>
                  <span className="text-[11px] font-mono text-teal-700">
                    {showExtraSaleFields ? '▲ Hide' : '▼ Show'}
                  </span>
                </button>

                {showExtraSaleFields && (
                  <div className="p-3.5 bg-white border-t border-slate-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-0.5">
                          Discount Peso Off (₱)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={discountAmount}
                          onChange={(e) => handleDiscountAmountChange(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-0.5">
                          Discount Percent (% Off)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          value={discountPercent}
                          onChange={(e) => handleDiscountPercentChange(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Customer / Buyer Store
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Walk-in Customer"
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Sale Date &amp; Time
                        </label>
                        <input
                          type="datetime-local"
                          value={saleDateTime}
                          onChange={(e) => setSaleDateTime(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                        Payment / Extra Notes (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={saleNotes}
                        onChange={(e) => setSaleNotes(e.target.value)}
                        placeholder="e.g., Paid GCash, 1.5L jug..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                  How Many Finished Items Are on Your Shelf Right Now? ({formula.unitLabel})
                </label>
                <span className="block text-[11px] text-slate-500 mb-1.5">
                  Type the exact number you counted on your shelf (replaces the old number)
                </span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  required
                  value={exactStockQty}
                  onChange={(e) => setExactStockQty(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Previous Shelf Count:</span>
                  <span className="font-mono text-slate-800">
                    {currentStock} × {formula.unitLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Change in Count:</span>
                  <span
                    className={`font-mono font-semibold ${
                      stockDifference > 0
                        ? 'text-emerald-700'
                        : stockDifference < 0
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {stockDifference > 0 ? `+${stockDifference}` : stockDifference} ×{' '}
                    {formula.unitLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="font-semibold text-slate-800">New Shelf Stock Value:</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₱{(parsedExactStock * formula.sellingPricePerUnit).toFixed(2)} sales value
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Saving...'
                  : mode === 'sell'
                  ? `Save ${isRefillSale ? 'Refill ' : ''}Sale (-${totalVolumeToDeduct}L)`
                  : `Save New Count (${parsedExactStock} ${formula.unitLabel})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
