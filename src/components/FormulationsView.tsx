import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FlaskConical,
  Play,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import {
  calculateFormulaEconomics,
  Formula,
  FormulaIngredient,
  MaterialUnit,
  PRODUCT_CATEGORIES,
  ProductCategory,
  RawMaterial,
} from '../types/domain';
import {
  addIngredientToFormula,
  createFormulaWithIngredients,
  deleteFormulaAndIngredients,
  removeFormulaIngredient,
  updateFormulaDetails,
} from '../services/firestoreService';

interface FormulationsViewProps {
  ownerId: string;
  formulas: Formula[];
  ingredients: FormulaIngredient[];
  materials: RawMaterial[];
  onLaunchBatchModal: (formulaId: string) => void;
  onOpenPriceGuide?: () => void;
}

export const FormulationsView: React.FC<FormulationsViewProps> = ({
  ownerId,
  formulas,
  ingredients,
  materials,
  onLaunchBatchModal,
  onOpenPriceGuide,
}) => {
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(
    formulas[0]?.id || null
  );
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showExtraFormulaFields, setShowExtraFormulaFields] = useState(false);
  const [showMobileWholesaleGuide, setShowMobileWholesaleGuide] = useState(false);

  // Formula Form State
  const [fName, setFName] = useState('');
  const [fSku, setFSku] = useState('');
  const [fCategory, setFCategory] = useState<ProductCategory>('Finished Product');
  const [fYield, setFYield] = useState('100');
  const [fUnitLabel, setFUnitLabel] = useState('1L Bottle');
  const [fLabor, setFLabor] = useState('0');
  const [fOverhead, setFOverhead] = useState('0');
  const [fSellingPrice, setFSellingPrice] = useState('3.00');
  const [fFinishedStock, setFFinishedStock] = useState('0');
  const [fTargetMargin, setFTargetMargin] = useState('55');
  const [fNotes, setFNotes] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<
    { materialId: string; quantityRequired: string }[]
  >([{ materialId: '', quantityRequired: '10' }]);

  // Add single ingredient to existing formula state
  const [newIngMaterialId, setNewIngMaterialId] = useState('');
  const [newIngQty, setNewIngQty] = useState('1');

  const activeFormula = useMemo(() => {
    if (formulas.length === 0) return null;
    return formulas.find((f) => f.id === selectedFormulaId) || formulas[0];
  }, [formulas, selectedFormulaId]);

  const activeFormulaIngredients = useMemo(() => {
    if (!activeFormula) return [];
    return ingredients.filter((i) => i.formulaId === activeFormula.id);
  }, [activeFormula, ingredients]);

  const activeEconomics = useMemo(() => {
    if (!activeFormula) return null;
    return calculateFormulaEconomics(activeFormula, activeFormulaIngredients, materials);
  }, [activeFormula, activeFormulaIngredients, materials]);

  const openNewFormulaModal = () => {
    setErrorMsg(null);
    setEditingFormula(null);
    setShowExtraFormulaFields(false);
    setFName('');
    setFSku(`FG-${Math.floor(100 + Math.random() * 900)}`);
    setFCategory('Finished Product');
    setFYield('100');
    setFUnitLabel('1L Bottle');
    setFLabor('0');
    setFOverhead('0');
    setFSellingPrice('3.10');
    setFFinishedStock('0');
    setFTargetMargin('55');
    setFNotes('');
    setDraftIngredients([
      { materialId: materials[0]?.id || '', quantityRequired: '10' },
    ]);
    setIsFormulaModalOpen(true);
  };

  const openEditFormulaModal = (formula: Formula) => {
    setErrorMsg(null);
    setEditingFormula(formula);
    setShowExtraFormulaFields(false);
    setFName(formula.name);
    setFSku(formula.sku);
    setFCategory(formula.productCategory);
    setFYield(String(formula.batchYieldUnits));
    setFUnitLabel(formula.unitLabel);
    setFLabor(String(formula.laborCostPerBatch));
    setFOverhead(String(formula.overheadCostPerBatch));
    setFSellingPrice(String(formula.sellingPricePerUnit));
    setFFinishedStock(String(formula.finishedStockUnits));
    setFTargetMargin(String(formula.targetMarginPercent));
    setFNotes(formula.notes);
    setIsFormulaModalOpen(true);
  };

  const handleSaveFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fName.trim()) {
      setErrorMsg('Please enter a product formula name.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        name: fName,
        sku: fSku,
        productCategory: fCategory || 'Finished Product',
        batchYieldUnits: Math.max(1, parseFloat(fYield) || 100),
        unitLabel: fUnitLabel || 'Unit',
        laborCostPerBatch: Math.max(0, parseFloat(fLabor) || 0),
        overheadCostPerBatch: Math.max(0, parseFloat(fOverhead) || 0),
        sellingPricePerUnit: Math.max(0, parseFloat(fSellingPrice) || 0),
        finishedStockUnits: Math.max(0, parseFloat(fFinishedStock) || 0),
        targetMarginPercent: Math.min(100, Math.max(0, parseFloat(fTargetMargin) || 50)),
        notes: fNotes,
      };

      if (editingFormula) {
        await updateFormulaDetails(editingFormula.id, payload);
      } else {
        const materialMap = new Map(materials.map((m) => [m.id, m]));
        const formattedIngs = draftIngredients
          .map((d) => {
            const mat = materialMap.get(d.materialId);
            if (!mat) return null;
            return {
              materialId: mat.id,
              materialName: mat.name,
              quantityRequired: Math.max(0.001, parseFloat(d.quantityRequired) || 0),
              unit: mat.unit as MaterialUnit,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null && x.quantityRequired > 0);

        // If user did not expand optional details to enter a custom selling price, auto-calculate a sensible default price from ingredient costs + target margin
        if (!showExtraFormulaFields && fSellingPrice === '3.10' && formattedIngs.length > 0) {
          const totalIngCost = formattedIngs.reduce((sum, ing) => {
            const mat = materialMap.get(ing.materialId);
            return sum + (mat ? mat.costPerUnit * ing.quantityRequired : 0);
          }, 0);
          const costPerUnit =
            (totalIngCost + payload.laborCostPerBatch + payload.overheadCostPerBatch) /
            payload.batchYieldUnits;
          const marginFraction = Math.min(0.9, Math.max(0.1, payload.targetMarginPercent / 100));
          const suggestedPrice = costPerUnit / (1 - marginFraction);
          if (suggestedPrice > 0) {
            payload.sellingPricePerUnit = Number(suggestedPrice.toFixed(2));
          }
        }

        const newId = await createFormulaWithIngredients(ownerId, payload, formattedIngs);
        setSelectedFormulaId(newId);
      }
      setIsFormulaModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save formula');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddIngredientLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFormula || !newIngMaterialId) return;
    const mat = materials.find((m) => m.id === newIngMaterialId);
    const qty = parseFloat(newIngQty);
    if (!mat || !qty || qty <= 0) return;

    setSubmitting(true);
    try {
      await addIngredientToFormula(
        ownerId,
        activeFormula.id,
        mat,
        qty,
        activeFormulaIngredients
      );
      setNewIngQty('1');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Step 2 of 3 · Your Product Recipes (What to Mix for 1 Batch)
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1">
            Product Recipes
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            List the ingredients and bottles needed to make 1 normal batch of each product.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewFormulaModal}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create New Product Recipe
        </button>
      </div>

      {formulas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 sm:p-12 text-center">
          <FlaskConical className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900 mt-3">
            No Product Recipes Created Yet
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Create your first product recipe by picking which ingredients go into 1 batch.
          </p>
          <button
            type="button"
            onClick={openNewFormulaModal}
            className="mt-4 inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Your First Product Recipe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* Mobile Quick Formula Selector Dropdown */}
          <div className="lg:hidden bg-white border border-slate-200 rounded-lg p-3.5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Choose a Product Recipe ({formulas.length})
            </label>
            <select
              value={activeFormula?.id || ''}
              onChange={(e) => setSelectedFormulaId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {formulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (1 Batch = {f.batchYieldUnits} × {f.unitLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Left Column (Desktop): Clean Formula Selector List */}
          <div className="hidden lg:block lg:col-span-4 space-y-2.5">
            <h2 className="text-xs font-semibold text-slate-500 px-1">
              Your Product Recipes ({formulas.length})
            </h2>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
              {formulas.map((f) => {
                const fIngs = ingredients.filter((i) => i.formulaId === f.id);
                const isSelected = activeFormula?.id === f.id;

                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFormulaId(f.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedFormulaId(f.id);
                    }}
                    className={`p-3.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900 truncate">
                        {f.name}
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {fIngs.length} {fIngs.length === 1 ? 'ingredient' : 'ingredients'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5">
                      <span>
                        1 Batch makes:{' '}
                        <strong className="font-mono text-slate-800">
                          {f.batchYieldUnits} × {f.unitLabel}
                        </strong>
                      </span>
                      <span>
                        In Stock:{' '}
                        <strong className="font-mono text-slate-800">
                          {f.finishedStockUnits}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Pure Recipe Header + Ingredients List */}
          {activeFormula && activeEconomics && (
            <div className="lg:col-span-8 space-y-4 sm:space-y-5">
              {/* Compact Recipe Header Card */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-teal-800 font-medium">
                      <span>
                        1 Batch Makes:{' '}
                        <strong className="font-mono">
                          {activeFormula.batchYieldUnits} × {activeFormula.unitLabel}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-600">
                        Can mix{' '}
                        <strong className="font-mono text-slate-900">
                          {activeEconomics.maxProducibleBatches} batches
                        </strong>{' '}
                        from current shelf supplies
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                      {activeFormula.name}
                    </h2>
                    {activeFormula.notes && (
                      <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                        {activeFormula.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLaunchBatchModal(activeFormula.id)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Make a Batch
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditFormulaModal(activeFormula)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteFormulaAndIngredients(activeFormula.id, activeFormulaIngredients)
                      }
                      aria-label="Delete formula"
                      className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Recipe Ingredients List (The Core Focus of This Page) */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Ingredients Needed for 1 Batch ({activeFormula.batchYieldUnits} ×{' '}
                      {activeFormula.unitLabel})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add or adjust the ingredients and bottles used when mixing 1 batch
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-600 shrink-0">
                    {activeEconomics.ingredientBreakdown.length} items
                  </span>
                </div>

                {activeEconomics.ingredientBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No ingredients added to this recipe yet. Use the box below to add ingredients from your shelf.
                  </div>
                ) : (
                  <>
                    {/* Desktop BOM Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                            <th className="py-2.5 px-4">Ingredient or Bottle</th>
                            <th className="py-2.5 px-4 text-right">Amount for 1 Batch</th>
                            <th className="py-2.5 px-4 text-right">On Your Shelf Now</th>
                            <th className="py-2.5 px-4 text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs">
                          {activeEconomics.ingredientBreakdown.map((row) => (
                            <tr key={row.ingredient.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4 font-medium text-slate-900">
                                {row.ingredient.materialName}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                                {row.ingredient.quantityRequired} {row.ingredient.unit}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {row.isShortage ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Low ({row.availableStock} {row.ingredient.unit} left)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {row.availableStock} {row.ingredient.unit} available
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeFormulaIngredient(row.ingredient.id)}
                                  aria-label={`Remove ${row.ingredient.materialName}`}
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

                    {/* Mobile BOM Cards */}
                    <div className="sm:hidden divide-y divide-slate-200 text-xs">
                      {activeEconomics.ingredientBreakdown.map((row) => (
                        <div key={row.ingredient.id} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {row.ingredient.materialName}
                            </div>
                            <div className="font-mono text-slate-700 mt-0.5">
                              Use <strong>{row.ingredient.quantityRequired} {row.ingredient.unit}</strong> per batch
                            </div>
                            <div className="mt-0.5">
                              {row.isShortage ? (
                                <span className="inline-flex items-center gap-1 text-red-600 font-medium text-[11px]">
                                  <AlertCircle className="w-3 h-3" />
                                  Not enough ({row.availableStock} {row.ingredient.unit} on shelf)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px]">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {row.availableStock} {row.ingredient.unit} on shelf
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFormulaIngredient(row.ingredient.id)}
                            aria-label={`Remove ${row.ingredient.materialName}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 bg-slate-50 rounded-lg shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Add Ingredient to Active Formula Footer Bar */}
                <form
                  onSubmit={handleAddIngredientLine}
                  className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 sm:gap-3"
                >
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      1. Pick an Ingredient or Bottle from Your Shelf
                    </label>
                    <select
                      value={newIngMaterialId}
                      onChange={(e) => setNewIngMaterialId(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="">Choose an item from your supplies...</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (On Shelf: {m.stockQuantity} {m.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-40">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      2. Amount for 1 Batch
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={newIngQty}
                      onChange={(e) => setNewIngQty(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !newIngMaterialId}
                    className="min-h-[40px] sm:min-h-[36px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Add to Recipe
                  </button>
                </form>
              </div>

              {/* Optional Collapsed Drawer for Cost, Selling Price, Profit & Price Guide */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMobileWholesaleGuide((prev) => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">
                      {showMobileWholesaleGuide
                        ? 'Hide Cost, Selling Price & Price Guide'
                        : '+ View Cost to Make, Profit & Refill Price Guide (Optional)'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      1 Batch Cost: ₱{activeEconomics.totalBatchCost.toFixed(2)} (₱{activeEconomics.costPerUnit.toFixed(2)} per {activeFormula.unitLabel})
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-800 bg-white border border-slate-200 rounded-md shrink-0">
                    {showMobileWholesaleGuide ? (
                      <>
                        <span>Hide</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Show</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </span>
                </button>

                {showMobileWholesaleGuide && (
                  <div className="p-4 border-t border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <span className="font-sans text-[11px] text-slate-500 block">Cost to Make 1</span>
                        <strong className="text-sm text-slate-900">₱{activeEconomics.costPerUnit.toFixed(2)}</strong>
                        {activeEconomics.packagingCostPerUnit > 0 && (
                          <span className="block text-[10px] text-teal-800 mt-0.5">
                            Refill cost: ₱{activeEconomics.liquidOnlyCostPerUnit.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <span className="font-sans text-[11px] text-slate-500 block">Selling Price</span>
                        <strong className="text-sm text-slate-900">₱{activeFormula.sellingPricePerUnit.toFixed(2)}</strong>
                        {activeEconomics.packagingCostPerUnit > 0 && (
                          <span className="block text-[10px] text-teal-800 mt-0.5">
                            Refill: ₱{activeEconomics.suggestedRefillPricePerUnit.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <span className="font-sans text-[11px] text-slate-500 block">Profit per 1</span>
                        <strong className="text-sm text-teal-800">+₱{activeEconomics.grossProfitPerUnit.toFixed(2)}</strong>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <span className="font-sans text-[11px] text-slate-500 block">Margin %</span>
                        <strong className="text-sm text-emerald-700">{activeEconomics.grossMarginPercent.toFixed(1)}%</strong>
                      </div>
                    </div>

                    {onOpenPriceGuide && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={onOpenPriceGuide}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-md cursor-pointer transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Open Printable Bulk &amp; Refill Price Guide</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Formula Modal (Bottom Sheet on Mobile, Centered on Desktop) */}
      {isFormulaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-2xl w-full p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {editingFormula ? 'Edit Product Recipe' : 'Create a New Product Recipe'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Just name your product, how much 1 batch makes, and pick its ingredients
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormulaModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFormula} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  {errorMsg}
                </div>
              )}

              {/* ESSENTIAL FIELD 1: Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  1. Product Name (What are you making?)
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g., Lemon Dishwashing Liquid"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* ESSENTIAL FIELD 2: Batch Yield & Unit Label */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    2. 1 Batch Makes
                  </label>
                  <span className="block text-[10px] text-slate-500 mb-1">
                    How many items/liters?
                  </span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={fYield}
                    onChange={(e) => setFYield(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    Unit / Bottle Size
                  </label>
                  <span className="block text-[10px] text-slate-500 mb-1">
                    e.g. 1L Bottle, Liter
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={fUnitLabel}
                    onChange={(e) => setFUnitLabel(e.target.value)}
                    placeholder="1L Bottle"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              {/* ESSENTIAL FIELD 3: Ingredients Used in 1 Batch (When creating new recipe) */}
              {!editingFormula && materials.length > 0 && (
                <div className="border-t border-slate-200 pt-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800">
                        3. Ingredients for 1 Batch ({fYield || '100'} × {fUnitLabel || 'items'})
                      </label>
                      <span className="block text-[11px] text-slate-500">
                        Pick each supply from your shelf and type the amount needed
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftIngredients((prev) => [
                          ...prev,
                          { materialId: materials[0]?.id || '', quantityRequired: '1' },
                        ])
                      }
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer py-1 shrink-0"
                    >
                      + Add Row
                    </button>
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {draftIngredients.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.materialId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftIngredients((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, materialId: val } : r))
                            );
                          }}
                          className="flex-1 min-w-0 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md"
                        >
                          <option value="">Choose ingredient or bottle...</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.quantityRequired}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftIngredients((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, quantityRequired: val } : r
                              )
                            );
                          }}
                          placeholder="Qty"
                          className="w-20 sm:w-28 px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraftIngredients((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* COLLAPSIBLE OPTIONAL / EXTRA SETTINGS */}
              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowExtraFormulaFields((prev) => !prev)}
                  className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>
                    {showExtraFormulaFields
                      ? 'Hide Optional Details'
                      : '+ Optional Details (Selling Price, Worker Pay, Starting Stock, Notes)'}
                  </span>
                  {showExtraFormulaFields ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>

                {showExtraFormulaFields && (
                  <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Regular Selling Price (₱)
                        </label>
                        <span className="block text-[10px] text-slate-500 mb-1">
                          Price for 1 {fUnitLabel || 'item'}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fSellingPrice}
                          onChange={(e) => setFSellingPrice(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Already on Shelf Now
                        </label>
                        <span className="block text-[10px] text-slate-500 mb-1">
                          Finished {fUnitLabel || 'items'} ready now
                        </span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={fFinishedStock}
                          onChange={(e) => setFFinishedStock(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Worker Pay / 1 Batch (₱)
                        </label>
                        <span className="block text-[10px] text-slate-500 mb-1">
                          Put 0 if you mix it yourself
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fLabor}
                          onChange={(e) => setFLabor(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Electricity &amp; Water / Batch (₱)
                        </label>
                        <span className="block text-[10px] text-slate-500 mb-1">
                          Other shop overhead (or 0)
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fOverhead}
                          onChange={(e) => setFOverhead(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          Product Category
                        </label>
                        <input
                          type="text"
                          list="product-category-options"
                          maxLength={60}
                          value={fCategory}
                          onChange={(e) => setFCategory(e.target.value)}
                          placeholder="e.g., Dishwashing"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                        <datalist id="product-category-options">
                          {PRODUCT_CATEGORIES.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          Short Code (Auto-filled)
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={fSku}
                          onChange={(e) => setFSku(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Mixing Instructions / Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={fNotes}
                        onChange={(e) => setFNotes(e.target.value)}
                        placeholder="Write simple steps so you remember how to mix this recipe..."
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormulaModalOpen(false)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : editingFormula
                    ? 'Save Recipe Changes'
                    : 'Save Product Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
