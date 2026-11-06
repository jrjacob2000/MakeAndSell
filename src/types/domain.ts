import { Timestamp } from 'firebase/firestore';
import blueprint from '../../firebase-blueprint.json';

// Synchronized validation constants parsed directly from firebase-blueprint.json
export const VALIDATION_RULES = {
  ID_PATTERN: new RegExp(blueprint.entities.RawMaterial.properties.ownerId.pattern),
  SKU_PATTERN: new RegExp(blueprint.entities.RawMaterial.properties.sku.pattern),
  MAX_ID_LENGTH: blueprint.entities.RawMaterial.properties.ownerId.maxLength,
  MAX_NAME_LENGTH: blueprint.entities.RawMaterial.properties.name.maxLength,
  MAX_SKU_LENGTH: blueprint.entities.RawMaterial.properties.sku.maxLength,
  MAX_CATEGORY_LENGTH: blueprint.entities.RawMaterial.properties.category.maxLength,
  MAX_SUPPLIER_LENGTH: blueprint.entities.RawMaterial.properties.supplierName.maxLength,
  MAX_NOTES_LENGTH: blueprint.entities.RawMaterial.properties.notes.maxLength,
  MAX_UNIT_LABEL_LENGTH: blueprint.entities.Formula.properties.unitLabel.maxLength,
  MAX_BATCH_REF_LENGTH: blueprint.entities.PurchaseOrder.properties.batchReference.maxLength,
  MAX_BRAND_NAME_LENGTH: blueprint.entities.WorkspaceSettings.properties.brandName.maxLength,
  MAX_WORKSPACE_TITLE_LENGTH:
    blueprint.entities.WorkspaceSettings.properties.workspaceTitle.maxLength,
  MAX_WORKSPACE_SUBTITLE_LENGTH:
    blueprint.entities.WorkspaceSettings.properties.workspaceSubtitle.maxLength,
  MAX_INDUSTRY_LABEL_LENGTH:
    blueprint.entities.WorkspaceSettings.properties.industryLabel.maxLength,
};

export interface WorkspaceSettings {
  ownerId: string;
  brandName: string;
  workspaceTitle: string;
  workspaceSubtitle: string;
  industryLabel: string;
  currencySymbol?: string;
  updatedAt?: Timestamp;
}

export const DEFAULT_WORKSPACE_SETTINGS: Omit<WorkspaceSettings, 'ownerId' | 'updatedAt'> = {
  brandName: 'Make & Sell',
  workspaceTitle: 'Supplies, Recipes, Batches & Sales Tracker',
  workspaceSubtitle:
    'Track your raw supplies, product recipes, bottled and refill batches, and daily customer sales in one place.',
  industryLabel: 'Small Business Stock, Batch & Sales Tracker',
  currencySymbol: '₱',
};

export interface IndustryPreset {
  id: string;
  label: string;
  brandName: string;
  workspaceTitle: string;
  workspaceSubtitle: string;
  industryLabel: string;
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: 'general',
    label: 'General Small Business (Any Product or Refill)',
    brandName: 'Make & Sell',
    workspaceTitle: 'Supplies, Recipes, Batches & Sales Tracker',
    workspaceSubtitle:
      'Track your raw supplies, product recipes, bottled and refill batches, and daily customer sales in one place.',
    industryLabel: 'Small Business Stock, Batch & Sales Tracker',
  },
  {
    id: 'cleaning',
    label: 'Household & Cleaning Products (Dishwashing, Detergent, FabCon)',
    brandName: 'ChemCraft Ledger',
    workspaceTitle: 'Chemical Formulation, Inventory & Profit Ledger',
    workspaceSubtitle:
      'Real-time unit economics across your raw surfactants, fragrance oils, packaging bottles, dishwashing liquids, detergents, and fabric conditioners.',
    industryLabel: 'Household & Commercial Chemical Manufacturing',
  },
  {
    id: 'cosmetics',
    label: 'Cosmetics, Skincare & Artisan Soap',
    brandName: 'Botanica Studio',
    workspaceTitle: 'Skincare Formulation, Ingredient Stock & Batch Costing',
    workspaceSubtitle:
      'Manage botanical oils, active ingredients, essential oils, jars, and batch unit margins across serums, lotions, and soaps.',
    industryLabel: 'Cosmetics & Personal Care Manufacturing',
  },
  {
    id: 'food',
    label: 'Food, Beverage & Artisan Bakery',
    brandName: 'BatchKitchen',
    workspaceTitle: 'Recipe Costing, Raw Ingredient Stock & Margin Tracker',
    workspaceSubtitle:
      'Monitor bulk ingredients, packaging containers, batch yields, kitchen labor, and gross margins across food and beverage products.',
    industryLabel: 'Food & Beverage Production',
  },
  {
    id: 'candles',
    label: 'Candles, Wax Melts & Home Fragrance',
    brandName: 'Atelier Wax',
    workspaceTitle: 'Candle Formulation, Wax & Vessel Inventory & Profit Ledger',
    workspaceSubtitle:
      'Track soy and coconut waxes, fragrance loads, wicks, vessels, pour batches, and wholesale vs. retail profit margins.',
    industryLabel: 'Home Fragrance & Candle Production',
  },
];

export type MaterialUnit = 'kg' | 'g' | 'L' | 'mL' | 'pcs' | 'oz' | 'lb' | 'gal' | 'pack';

export const MATERIAL_UNITS: MaterialUnit[] = [
  'kg',
  'g',
  'L',
  'mL',
  'pcs',
  'oz',
  'lb',
  'gal',
  'pack',
];

export type MaterialCategory = string;

export const MATERIAL_CATEGORIES: string[] = [
  'Raw Ingredient & Base',
  'Active Component',
  'Surfactant',
  'Builder & Buffer',
  'Thickener & Salt',
  'Conditioning Agent',
  'Botanical Oil & Butter',
  'Wax & Base Medium',
  'Dry Goods & Spice',
  'Fragrance & Essential Oil',
  'Colorant & Dye',
  'Preservative & Stabilizer',
  'Solvent & Water',
  'Packaging & Container',
  'Label & Seal',
];

export type ProductCategory = string;

export const PRODUCT_CATEGORIES: string[] = [
  'Finished Product',
  'Liquid Dishwashing',
  'Liquid Detergent',
  'Fabric Conditioner',
  'Multi-Surface Cleaner',
  'Hand Soap & Sanitizer',
  'Skincare & Body Care',
  'Candle & Home Fragrance',
  'Food & Bottled Beverage',
  'Bakery & Confectionery',
  'Industrial & Commercial',
];

export type BatchStatus = 'in_progress' | 'completed' | 'cancelled';

export interface RawMaterial {
  id: string;
  ownerId: string;
  name: string;
  sku: string;
  category: string;
  unit: MaterialUnit;
  stockQuantity: number;
  reorderPoint: number;
  costPerUnit: number;
  supplierName: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PurchaseOrder {
  id: string;
  ownerId: string;
  materialId: string;
  materialName: string;
  supplierName: string;
  quantityPurchased: number;
  unit: MaterialUnit;
  unitCost: number;
  totalCost: number;
  batchReference: string;
  createdAt: Timestamp;
}

export interface Formula {
  id: string;
  ownerId: string;
  name: string;
  sku: string;
  productCategory: string;
  batchYieldUnits: number;
  unitLabel: string;
  laborCostPerBatch: number;
  overheadCostPerBatch: number;
  sellingPricePerUnit: number;
  finishedStockUnits: number;
  targetMarginPercent: number;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FormulaIngredient {
  id: string;
  ownerId: string;
  formulaId: string;
  materialId: string;
  materialName: string;
  quantityRequired: number;
  unit: MaterialUnit;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductionBatch {
  id: string;
  ownerId: string;
  formulaId: string;
  formulaName: string;
  productCategory: string;
  batchCode: string;
  batchMultiplier: number;
  unitsProduced: number;
  unitLabel: string;
  rawMaterialCost: number;
  laborCost: number;
  overheadCost: number;
  totalProductionCost: number;
  costPerUnit: number;
  sellingPricePerUnit: number;
  projectedRevenue: number;
  projectedProfit: number;
  profitMarginPercent: number;
  status: BatchStatus;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductSale {
  id: string;
  ownerId: string;
  formulaId: string;
  formulaName: string;
  productCategory: string;
  customerName: string;
  quantitySold: number;
  unitLabel: string;
  sellingPricePerUnit: number;
  costPerUnit: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  notes: string;
  createdAt: Timestamp;
}


export interface ContainerPreset {
  id: string;
  name: string;
  shortLabel: string;
  volumeFactor: number; // in base units (e.g. 1L base: 500mL = 0.5, 1.5L = 1.5, 1 Gal = 3.785)
}

export const COMMON_CONTAINER_PRESETS: ContainerPreset[] = [
  { id: '500ml', name: '500 mL Bottle', shortLabel: '500mL', volumeFactor: 0.5 },
  { id: '1l', name: '1.0 Liter Bottle', shortLabel: '1.0L', volumeFactor: 1.0 },
  { id: '1.5l', name: '1.5 Liters (Large Bottle)', shortLabel: '1.5L', volumeFactor: 1.5 },
  { id: '1gal', name: '1 Gallon Jug (3.785L)', shortLabel: '1 Gal (3.8L)', volumeFactor: 3.785 },
  { id: '2l', name: '2.0 Liters Jug', shortLabel: '2.0L', volumeFactor: 2.0 },
  { id: '5l', name: '5.0 Liters Container', shortLabel: '5.0L', volumeFactor: 5.0 },
  { id: '5gal', name: '5 Gallons Carboy (18.9L)', shortLabel: '5 Gal (18.9L)', volumeFactor: 18.925 },
];

export interface FormulaEconomics {
  rawMaterialCostPerBatch: number;
  liquidIngredientsCostPerBatch: number;
  packagingCostPerBatch: number;
  totalBatchCost: number;
  costPerUnit: number;
  liquidOnlyCostPerUnit: number;
  packagingCostPerUnit: number;
  suggestedRefillPricePerUnit: number;
  grossProfitPerUnit: number;
  grossMarginPercent: number;
  batchRevenue: number;
  batchGrossProfit: number;
  maxProducibleBatches: number;
  limitingMaterialName: string | null;
  ingredientBreakdown: {
    ingredient: FormulaIngredient;
    currentCostPerUnit: number;
    lineCost: number;
    availableStock: number;
    isShortage: boolean;
    isPackaging: boolean;
  }[];
}

export function isPackagingMaterial(
  mat?: Pick<RawMaterial, 'category' | 'unit' | 'name'>,
  fallbackName = ''
): boolean {
  const cat = (mat?.category || '').toLowerCase();
  const name = (mat?.name || fallbackName).toLowerCase();
  if (
    cat.includes('packaging') ||
    cat.includes('container') ||
    cat.includes('label') ||
    cat.includes('bottle')
  ) {
    return true;
  }
  if (mat?.unit === 'pcs') {
    return true;
  }
  return /\b(bottle|bottles|jug|jugs|jar|jars|container|cap|caps|pouch|label|labels)\b/i.test(
    name
  );
}

export function sanitizeCode(input: string, maxLength = 40): string {
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (cleaned || 'ITEM-01').slice(0, maxLength);
}

export function sanitizeString(input: string, maxLength: number, fallback = ''): string {
  const trimmed = input.trim();
  if (!trimmed && fallback) return fallback.slice(0, maxLength);
  return trimmed.slice(0, maxLength);
}

export function calculateFormulaEconomics(
  formula: Formula,
  ingredients: FormulaIngredient[],
  materials: RawMaterial[]
): FormulaEconomics {
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  let rawMaterialCostPerBatch = 0;
  let liquidIngredientsCostPerBatch = 0;
  let packagingCostPerBatch = 0;
  let maxProducibleBatches = ingredients.length > 0 ? Number.POSITIVE_INFINITY : 0;
  let limitingMaterialName: string | null = null;

  const ingredientBreakdown = ingredients.map((ing) => {
    const mat = materialMap.get(ing.materialId);
    const currentCostPerUnit = mat ? mat.costPerUnit : 0;
    const availableStock = mat ? mat.stockQuantity : 0;
    const lineCost = Number((ing.quantityRequired * currentCostPerUnit).toFixed(4));
    const isPackaging = isPackagingMaterial(mat, ing.materialName);

    rawMaterialCostPerBatch += lineCost;
    if (isPackaging) {
      packagingCostPerBatch += lineCost;
    } else {
      liquidIngredientsCostPerBatch += lineCost;
    }

    const possibleBatches =
      ing.quantityRequired > 0 ? Math.floor((availableStock / ing.quantityRequired) * 10) / 10 : 0;
    if (possibleBatches < maxProducibleBatches) {
      maxProducibleBatches = possibleBatches;
      limitingMaterialName = ing.materialName;
    }

    return {
      ingredient: ing,
      currentCostPerUnit,
      lineCost,
      availableStock,
      isShortage: availableStock < ing.quantityRequired,
      isPackaging,
    };
  });

  if (!Number.isFinite(maxProducibleBatches)) {
    maxProducibleBatches = 0;
  }

  const totalBatchCost = Number(
    (rawMaterialCostPerBatch + formula.laborCostPerBatch + formula.overheadCostPerBatch).toFixed(2)
  );
  const liquidBatchCostWithLabor = Number(
    (
      liquidIngredientsCostPerBatch +
      formula.laborCostPerBatch +
      formula.overheadCostPerBatch
    ).toFixed(2)
  );
  const yieldUnits = Math.max(formula.batchYieldUnits, 1);
  const costPerUnit = Number((totalBatchCost / yieldUnits).toFixed(2));
  const liquidOnlyCostPerUnit = Number((liquidBatchCostWithLabor / yieldUnits).toFixed(2));
  const packagingCostPerUnit = Number((packagingCostPerBatch / yieldUnits).toFixed(2));
  const suggestedRefillPricePerUnit = Number(
    Math.max(0, formula.sellingPricePerUnit - packagingCostPerUnit).toFixed(2)
  );

  const grossProfitPerUnit = Number((formula.sellingPricePerUnit - costPerUnit).toFixed(2));
  const grossMarginPercent =
    formula.sellingPricePerUnit > 0
      ? Number(((grossProfitPerUnit / formula.sellingPricePerUnit) * 100).toFixed(1))
      : 0;
  const batchRevenue = Number((formula.sellingPricePerUnit * yieldUnits).toFixed(2));
  const batchGrossProfit = Number((batchRevenue - totalBatchCost).toFixed(2));

  return {
    rawMaterialCostPerBatch: Number(rawMaterialCostPerBatch.toFixed(2)),
    liquidIngredientsCostPerBatch: Number(liquidIngredientsCostPerBatch.toFixed(2)),
    packagingCostPerBatch: Number(packagingCostPerBatch.toFixed(2)),
    totalBatchCost,
    costPerUnit,
    liquidOnlyCostPerUnit,
    packagingCostPerUnit,
    suggestedRefillPricePerUnit,
    grossProfitPerUnit,
    grossMarginPercent,
    batchRevenue,
    batchGrossProfit,
    maxProducibleBatches,
    limitingMaterialName,
    ingredientBreakdown,
  };
}

