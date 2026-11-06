import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  Download,
  Edit3,
  PackagePlus,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  Formula,
  FormulaIngredient,
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  MaterialCategory,
  MaterialUnit,
  PurchaseOrder,
  RawMaterial,
} from '../types/domain';
import {
  createRawMaterial,
  deleteRawMaterial,
  recordPurchaseOrderAndRestock,
  updateRawMaterialSpec,
} from '../services/firestoreService';
import { exportMaterialsToCsv } from '../utils/csvExport';
import { formatDate } from '../utils/formatters';

interface RawMaterialsViewProps {
  ownerId: string;
  materials: RawMaterial[];
  purchaseOrders: PurchaseOrder[];
  formulas?: Formula[];
  ingredients?: FormulaIngredient[];
  brandName?: string;
}

export const RawMaterialsView: React.FC<RawMaterialsViewProps> = ({
  ownerId,
  materials,
  purchaseOrders,
  formulas = [],
  ingredients = [],
  brandName = 'Business',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'stock'>('name');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [restockingMaterial, setRestockingMaterial] = useState<RawMaterial | null>(null);
  const [deleteTargetMaterial, setDeleteTargetMaterial] = useState<RawMaterial | null>(null);
  const [blockingRecipes, setBlockingRecipes] = useState<Formula[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'shelf' | 'history'>('shelf');
  const [expandedMobileMatId, setExpandedMobileMatId] = useState<string | null>(null);

  const handleRequestDelete = (mat: RawMaterial) => {
    const usedInFormulas = formulas.filter((f) =>
      ingredients.some((ing) => ing.formulaId === f.id && ing.materialId === mat.id)
    );
    setBlockingRecipes(usedInFormulas);
    setDeleteTargetMaterial(mat);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetMaterial) return;
    setIsDeleting(true);
    try {
      await deleteRawMaterial(deleteTargetMaterial.id);
      setDeleteTargetMaterial(null);
      setBlockingRecipes([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete supply item');
    } finally {
      setIsDeleting(false);
    }
  };

  // Add / Edit Material Form State
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formCategory, setFormCategory] = useState<MaterialCategory>('Raw Ingredient & Base');
  const [formUnit, setFormUnit] = useState<MaterialUnit>('kg');
  const [formStock, setFormStock] = useState('0');
  const [formReorder, setFormReorder] = useState('20');
  const [formCost, setFormCost] = useState('0');
  const [formSupplier, setFormSupplier] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [showExtraMaterialFields, setShowExtraMaterialFields] = useState(false);

  // Restock Form State
  const [poQuantity, setPoQuantity] = useState('50');
  const [poUnitCost, setPoUnitCost] = useState('0');
  const [poSupplier, setPoSupplier] = useState('');
  const [poBatchRef, setPoBatchRef] = useState('');
  const [showExtraRestockFields, setShowExtraRestockFields] = useState(false);

  const openAddModal = () => {
    setErrorMsg(null);
    setEditingMaterial(null);
    setFormName('');
    setFormSku(`MAT-${Math.floor(100 + Math.random() * 900)}`);
    setFormCategory('Raw Ingredient & Base');
    setFormUnit('kg');
    setFormStock('50');
    setFormReorder('15');
    setFormCost('2.50');
    setFormSupplier('');
    setFormNotes('');
    setShowExtraMaterialFields(false);
    setIsAddModalOpen(true);
  };

  const openEditModal = (mat: RawMaterial) => {
    setErrorMsg(null);
    setEditingMaterial(mat);
    setFormName(mat.name);
    setFormSku(mat.sku);
    setFormCategory(mat.category);
    setFormUnit(mat.unit);
    setFormStock(String(mat.stockQuantity));
    setFormReorder(String(mat.reorderPoint));
    setFormCost(String(mat.costPerUnit));
    setFormSupplier(mat.supplierName);
    setFormNotes(mat.notes);
    setShowExtraMaterialFields(false);
    setIsAddModalOpen(true);
  };

  const openRestockModal = (mat: RawMaterial) => {
    setErrorMsg(null);
    setRestockingMaterial(mat);
    setPoQuantity('50');
    setPoUnitCost(String(mat.costPerUnit));
    setPoSupplier(mat.supplierName);
    setPoBatchRef(`PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setShowExtraRestockFields(false);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMsg('Please enter a raw material or ingredient name.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        name: formName,
        sku: formSku,
        category: formCategory || 'Raw Ingredient & Base',
        unit: formUnit,
        stockQuantity: Math.max(0, parseFloat(formStock) || 0),
        reorderPoint: Math.max(0, parseFloat(formReorder) || 0),
        costPerUnit: Math.max(0, parseFloat(formCost) || 0),
        supplierName: formSupplier || 'Standard Supplier',
        notes: formNotes,
      };
      if (editingMaterial) {
        await updateRawMaterialSpec(editingMaterial.id, payload, ownerId);
      } else {
        await createRawMaterial(ownerId, payload);
      }
      setIsAddModalOpen(false);
      setEditingMaterial(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save material');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockingMaterial) return;
    const qty = parseFloat(poQuantity);
    const cost = parseFloat(poUnitCost);
    if (!qty || qty <= 0) {
      setErrorMsg('Quantity purchased must be greater than zero.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await recordPurchaseOrderAndRestock(ownerId, restockingMaterial, {
        quantityPurchased: qty,
        unitCost: Math.max(0, cost || 0),
        supplierName: poSupplier || restockingMaterial.supplierName,
        batchReference: poBatchRef || 'PO-DIRECT',
      });
      setRestockingMaterial(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  const availableCategories = useMemo(() => {
    const set = new Set<string>(MATERIAL_CATEGORIES);
    for (const m of materials) {
      if (m.category) set.add(m.category);
    }
    return Array.from(set);
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials
      .filter((m) => {
        const matchesQuery =
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.supplierName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCat = selectedCategory === 'ALL' || m.category === selectedCategory;
        const matchesStock =
          stockFilter === 'ALL' || m.stockQuantity <= m.reorderPoint;
        return matchesQuery && matchesCat && matchesStock;
      })
      .sort((a, b) => {
        if (sortBy === 'value') {
          return b.stockQuantity * b.costPerUnit - a.stockQuantity * a.costPerUnit;
        }
        if (sortBy === 'stock') {
          return a.stockQuantity - b.stockQuantity;
        }
        return a.name.localeCompare(b.name);
      });
  }, [materials, searchQuery, selectedCategory, stockFilter, sortBy]);

  const totalInventoryValue = useMemo(
    () => materials.reduce((sum, m) => sum + m.stockQuantity * m.costPerUnit, 0),
    [materials]
  );

  const lowStockCount = useMemo(
    () => materials.filter((m) => m.stockQuantity <= m.reorderPoint).length,
    [materials]
  );

  const restockPreview = useMemo(() => {
    if (!restockingMaterial) return null;
    const qty = Math.max(0, parseFloat(poQuantity) || 0);
    const unitCost = Math.max(0, parseFloat(poUnitCost) || 0);
    const totalOrderCost = qty * unitCost;
    const currentVal = restockingMaterial.stockQuantity * restockingMaterial.costPerUnit;
    const newTotalStock = restockingMaterial.stockQuantity + qty;
    const newWeightedCost =
      newTotalStock > 0 ? (currentVal + totalOrderCost) / newTotalStock : unitCost;
    return {
      totalOrderCost,
      newTotalStock,
      newWeightedCost,
    };
  }, [restockingMaterial, poQuantity, poUnitCost]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Summary Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-800">
            Step 1 of 3 · Things You Buy to Make Your Products
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5 sm:mt-1">
            Ingredients, Raw Materials &amp; Packaging
          </h1>
          <p className="hidden sm:block text-sm text-slate-600 mt-1 max-w-2xl">
            List everything you buy from suppliers (raw chemicals, liquids, scents, empty bottles, caps, labels). Whenever you buy more stock, the app automatically updates your average cost.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportMaterialsToCsv(materials, brandName)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[38px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[42px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Ingredient / Supply
          </button>
        </div>
      </div>

      {/* KPI Summary Grid (Compact 3-col on mobile, spacious on desktop) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Shelf Value
          </span>
          <div className="text-sm sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-0.5 sm:mt-1 truncate">
            ₱{totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">
            Total value of {materials.length} ingredients &amp; packaging items on your shelf
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Running Low
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5 sm:mt-1">
            <span className={`text-sm sm:text-2xl font-bold font-mono tabular-nums ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {lowStockCount}
            </span>
            <span className="hidden sm:inline text-xs text-slate-500">
              {lowStockCount === 1 ? 'item low' : 'items low'}
            </span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">
            Warns you when your shelf stock drops below your warning level
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-5">
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 block truncate">
            Deliveries
          </span>
          <div className="text-sm sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-0.5 sm:mt-1">
            {purchaseOrders.length}
          </div>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">
            Total Spent Restocking: ₱
            {purchaseOrders
              .reduce((acc, po) => acc + po.totalCost, 0)
              .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Section Switcher: Shelf Stock vs Restock History */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-lg w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveSection('shelf')}
          className={`flex-1 sm:flex-initial min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeSection === 'shelf'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          1. Supplies on Shelf ({materials.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('history')}
          className={`flex-1 sm:flex-initial min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeSection === 'history'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          2. Past Purchases ({purchaseOrders.length})
        </button>
      </div>

      {activeSection === 'shelf' ? (
        <>
          {/* Filter & Search Bar (Simplified on Mobile) */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4 bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search item name..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* All vs Running Low */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStockFilter('ALL')}
                  className={`flex-1 sm:flex-initial min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stockFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({materials.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('LOW')}
                  className={`flex-1 sm:flex-initial min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stockFilter === 'LOW'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Running Low ({lowStockCount})
                </button>
              </div>

              {/* Desktop-only Category & Sort Filters */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter by material category"
                className="hidden sm:block min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="ALL">All Item Types</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  setSortBy((prev) =>
                    prev === 'name' ? 'value' : prev === 'value' ? 'stock' : 'name'
                  )
                }
                className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />
                Sort: {sortBy === 'name' ? 'Name (A-Z)' : sortBy === 'value' ? 'Highest Value' : 'Lowest Stock'}
              </button>
            </div>
          </div>

          {/* Raw Materials Data (Desktop Table + Decluttered Mobile Cards) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {filteredMaterials.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <p className="text-sm font-medium text-slate-900">No ingredients or supplies found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Add the raw ingredients, bottles, or labels you buy so you can build product recipes.
                </p>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="mt-4 inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Your First Ingredient or Supply
                </button>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4">Item Name &amp; Notes</th>
                        <th className="py-3 px-4">Item Type · Supplier Store</th>
                        <th className="py-3 px-4 text-right">How Much You Have Left</th>
                        <th className="py-3 px-4 text-right">Warn Me When Below</th>
                        <th className="py-3 px-4 text-right">Cost for 1 Unit</th>
                        <th className="py-3 px-4 text-right">Total Value on Shelf</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredMaterials.map((mat) => {
                        const isLow = mat.stockQuantity <= mat.reorderPoint;
                        const totalValue = mat.stockQuantity * mat.costPerUnit;
                        return (
                          <tr key={mat.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{mat.name}</div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className="font-mono">{mat.sku}</span>
                                {mat.notes && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate max-w-xs">{mat.notes}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-xs text-slate-700">{mat.category}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{mat.supplierName}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {isLow && (
                                  <AlertTriangle
                                    className="w-3.5 h-3.5 text-amber-600 shrink-0"
                                    aria-label="Low stock alert"
                                  />
                                )}
                                <span className={isLow ? 'font-semibold text-amber-700' : 'text-slate-900'}>
                                  {mat.stockQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} {mat.unit}
                                </span>
                              </div>
                              {isLow && (
                                <div className="text-[11px] text-amber-700 font-sans">Running low — buy more</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                              {mat.reorderPoint.toLocaleString('en-US', { maximumFractionDigits: 2 })} {mat.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                              ₱{mat.costPerUnit.toFixed(2)} per {mat.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                              ₱{totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openRestockModal(mat)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <PackagePlus className="w-3.5 h-3.5" />
                                  + Buy More
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(mat)}
                                  aria-label={`Edit ${mat.name}`}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDelete(mat)}
                                  aria-label={`Delete ${mat.name}`}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Tap-to-Expand Mobile Supply Rows (Option 1: Compact Single Row, Tap to Show Actions) */}
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredMaterials.map((mat) => {
                    const isLow = mat.stockQuantity <= mat.reorderPoint;
                    const isExpanded = expandedMobileMatId === mat.id;
                    const totalValue = mat.stockQuantity * mat.costPerUnit;
                    return (
                      <div
                        key={mat.id}
                        className={`transition-colors ${isExpanded ? 'bg-slate-50/70' : 'bg-white'}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMobileMatId((prev) => (prev === mat.id ? null : mat.id))
                          }
                          className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 truncate">
                              {mat.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mt-0.5">
                              <span>₱{mat.costPerUnit.toFixed(2)}/{mat.unit}</span>
                              {isLow && (
                                <span className="inline-flex items-center gap-1 font-sans text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Low
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="text-right font-mono tabular-nums">
                              <div
                                className={`text-sm font-bold ${
                                  isLow ? 'text-amber-700' : 'text-slate-900'
                                }`}
                              >
                                {mat.stockQuantity.toLocaleString('en-US', {
                                  maximumFractionDigits: 2,
                                })}{' '}
                                {mat.unit}
                              </div>
                              <div className="text-[10px] font-sans text-slate-400">
                                {isExpanded ? 'Tap to close' : 'Tap for options'}
                              </div>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                                isExpanded ? 'rotate-180 text-teal-700' : ''
                              }`}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-slate-200/70">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1.5">
                              <span className="truncate">
                                {mat.category} · {mat.supplierName || 'Standard Supplier'}
                              </span>
                              <span className="font-mono text-slate-700 font-medium shrink-0">
                                Shelf Value: ₱{totalValue.toFixed(2)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openRestockModal(mat)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                              >
                                <PackagePlus className="w-3.5 h-3.5" />
                                + Buy More Stock
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(mat)}
                                aria-label={`Edit ${mat.name}`}
                                className="inline-flex items-center justify-center gap-1 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRequestDelete(mat)}
                                aria-label={`Delete ${mat.name}`}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        </>
      ) : (
        /* Procurement / Purchase Order Ledger */
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                History of Supplies You Bought ({purchaseOrders.length})
              </h2>
            </div>
          </div>
          {purchaseOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No restock purchases logged yet. Click &ldquo;+ Buy More&rdquo; on any supply item whenever you buy more stock.
            </div>
          ) : (
            <>
              {/* Desktop PO Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4">Date · Receipt #</th>
                      <th className="py-2.5 px-4">Item Bought</th>
                      <th className="py-2.5 px-4">Supplier Store</th>
                      <th className="py-2.5 px-4 text-right">Amount Bought</th>
                      <th className="py-2.5 px-4 text-right">Price per Unit</th>
                      <th className="py-2.5 px-4 text-right">Total Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {purchaseOrders.slice(0, 15).map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-mono">
                          <div className="text-[11px] font-semibold text-teal-800">{formatDate(po.createdAt)}</div>
                          <div className="text-slate-700">{po.batchReference}</div>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">{po.materialName}</td>
                        <td className="py-2.5 px-4 text-slate-600">{po.supplierName}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                          +{po.quantityPurchased.toLocaleString('en-US', { maximumFractionDigits: 2 })} {po.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                          ₱{po.unitCost.toFixed(2)} per {po.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          ₱{po.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile PO List */}
              <div className="md:hidden divide-y divide-slate-200 text-xs">
                {purchaseOrders.slice(0, 15).map((po) => (
                  <div key={po.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{po.materialName}</div>
                      <div className="text-slate-500 mt-0.5 truncate">
                        <span className="font-mono text-teal-800 font-semibold">{formatDate(po.createdAt)}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-semibold text-slate-900">₱{po.totalCost.toFixed(2)}</div>
                      <div className="text-slate-500">
                        +{po.quantityPurchased} {po.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add / Edit Raw Material Modal (Bottom Sheet on Mobile, Centered on Desktop) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-lg w-full p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {editingMaterial ? 'Edit Ingredient or Supply Item' : 'Add a New Ingredient or Supply Item'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter an ingredient, chemical, fragrance, bottle, or label you buy
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  {errorMsg}
                </div>
              )}

              {/* 4 Essential Fields Upfront */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                  1. Item Name (What did you buy?)
                </label>
                <span className="block text-[11px] text-slate-500 mb-1">
                  Example: SLES 70%, Lemon Scent, Empty 1L Bottle
                </span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., SLES 70%, Shea Butter, 1L Empty Bottle"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    2. Unit of Measure
                  </label>
                  <span className="block text-[11px] text-slate-500 mb-1">
                    Weight, liquid, or pcs
                  </span>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as MaterialUnit)}
                    className="w-full px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="g">g (Grams)</option>
                    <option value="L">L (Liters)</option>
                    <option value="mL">mL (Milliliters)</option>
                    <option value="pcs">pcs (Bottles/Caps)</option>
                    <option value="oz">oz (Ounces)</option>
                    <option value="lb">lb (Pounds)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    3. Stock on Shelf ({formUnit})
                  </label>
                  <span className="block text-[11px] text-slate-500 mb-1">
                    How much you have now
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-900">
                    4. Cost per 1 {formUnit} (₱)
                  </label>
                  <span className="block text-[11px] text-slate-600">
                    How much do you pay for 1 {formUnit} of this item?
                  </span>
                </div>
                <div className="sm:w-44">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-teal-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900"
                  />
                </div>
              </div>

              {/* Optional / Advanced Details Toggle */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtraMaterialFields((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>
                    {showExtraMaterialFields
                      ? 'Hide Optional Details'
                      : '+ Optional Details (Supplier Name, Low-Stock Alert, Category, Notes)'}
                  </span>
                  <span className="text-[11px] font-mono text-teal-700">
                    {showExtraMaterialFields ? '▲ Hide' : '▼ Show'}
                  </span>
                </button>

                {showExtraMaterialFields && (
                  <div className="p-3.5 bg-white border-t border-slate-200 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Who Do You Buy This From? (Supplier)
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          value={formSupplier}
                          onChange={(e) => setFormSupplier(e.target.value)}
                          placeholder="e.g., Pacific Chemical Supply"
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Warn Me When Below ({formUnit})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formReorder}
                          onChange={(e) => setFormReorder(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Item Category / Type
                        </label>
                        <input
                          type="text"
                          list="material-category-options"
                          maxLength={60}
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          placeholder="e.g., Base Ingredient, Packaging..."
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                        <datalist id="material-category-options">
                          {MATERIAL_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                          Short Code (Auto-filled)
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={formSku}
                          onChange={(e) => setFormSku(e.target.value)}
                          placeholder="MAT-001"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                        Extra Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Any helpful reminder (e.g., 'Buy in 25kg blue drum')..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingMaterial ? 'Save Changes' : 'Save Item to Shelf'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock / Purchase Order Modal (Bottom Sheet on Mobile, Centered on Desktop) */}
      {restockingMaterial && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-md w-full p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Buy More Stock (Add to Your Shelf)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{restockingMaterial.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setRestockingMaterial(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    How Much Bought? ({restockingMaterial.unit})
                  </label>
                  <span className="block text-[11px] text-slate-500 mb-1">
                    Amount to add
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={poQuantity}
                    onChange={(e) => setPoQuantity(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                    Price per 1 {restockingMaterial.unit} (₱)
                  </label>
                  <span className="block text-[11px] text-slate-500 mb-1">
                    Cost per {restockingMaterial.unit}
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={poUnitCost}
                    onChange={(e) => setPoUnitCost(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              {restockPreview && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Paid for This Purchase:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      ₱{restockPreview.totalOrderCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>New Total Amount on Your Shelf:</span>
                    <span className="font-mono text-slate-900">
                      {restockPreview.newTotalStock.toFixed(2)} {restockingMaterial.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>New Average Cost per 1 {restockingMaterial.unit}:</span>
                    <span className="font-mono font-semibold text-teal-800">
                      ₱{restockPreview.newWeightedCost.toFixed(4)}/{restockingMaterial.unit}
                    </span>
                  </div>
                </div>
              )}

              {/* Optional Supplier / Receipt # Toggle */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtraRestockFields((prev) => !prev)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>
                    {showExtraRestockFields
                      ? 'Hide Supplier & Receipt #'
                      : '+ Optional: Change Supplier or Receipt #'}
                  </span>
                  <span className="text-[11px] font-mono text-teal-700">
                    {showExtraRestockFields ? '▲' : '▼'}
                  </span>
                </button>
                {showExtraRestockFields && (
                  <div className="p-3 bg-white border-t border-slate-200 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Supplier / Store Name
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={poSupplier}
                        onChange={(e) => setPoSupplier(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Receipt # (Auto-filled)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={poBatchRef}
                        onChange={(e) => setPoBatchRef(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRestockingMaterial(null)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Add Stock to Shelf'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation / Recipe Dependency Guard Modal */}
      {deleteTargetMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4">
            {blockingRecipes.length > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-amber-100 text-amber-800 rounded-full shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Cannot Delete &ldquo;{deleteTargetMaterial.name}&rdquo;
                    </h3>
                    <p className="text-xs text-amber-800 font-semibold mt-0.5">
                      Supply actively used in {blockingRecipes.length} recipe{blockingRecipes.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs space-y-2">
                  <p className="text-slate-700 leading-relaxed">
                    This supply item is required in the following product recipe{blockingRecipes.length > 1 ? 's' : ''}:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 font-semibold text-slate-900">
                    {blockingRecipes.map((f) => (
                      <li key={f.id}>
                        {f.name} ({f.unitLabel || '1L Bottle'})
                      </li>
                    ))}
                  </ul>
                  <p className="text-slate-600 text-[11px] pt-1">
                    Deleting this supply now would break those recipe costings and cause missing ingredient errors during production runs.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  <strong className="text-slate-800 block mb-0.5">How to delete this item safely:</strong>
                  Go to the <strong>&ldquo;2. Product Recipes&rdquo;</strong> tab, edit the recipes listed above, and either replace or remove this ingredient. Once no recipes need it, you can delete it here.
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTargetMaterial(null);
                      setBlockingRecipes([]);
                    }}
                    className="min-h-[40px] px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Got It, Keep Supply Safe
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-red-100 text-red-700 rounded-full shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Delete &ldquo;{deleteTargetMaterial.name}&rdquo;?
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Confirm permanent removal of this supply item
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 text-slate-600">
                  <p>
                    Are you sure you want to permanently delete <strong>{deleteTargetMaterial.name}</strong> (<span className="font-mono">{deleteTargetMaterial.sku}</span>)?
                  </p>
                  <div className="font-mono text-slate-800 text-[11px]">
                    Current shelf stock: <strong>{deleteTargetMaterial.stockQuantity} {deleteTargetMaterial.unit}</strong> (₱{(deleteTargetMaterial.stockQuantity * deleteTargetMaterial.costPerUnit).toFixed(2)} value)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    This item is not used in any active recipes, so it is safe to delete.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDeleteTargetMaterial(null)}
                    disabled={isDeleting}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete Item'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
