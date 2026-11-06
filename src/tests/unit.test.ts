import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import {
  calculateFormulaEconomics,
  COMMON_CONTAINER_PRESETS,
  DEFAULT_WORKSPACE_SETTINGS,
  Formula,
  FormulaIngredient,
  isPackagingMaterial,
  RawMaterial,
  sanitizeCode,
  sanitizeString,
  VALIDATION_RULES,
} from '../types/domain';
import {
  cleanDisplayNotes,
  extractEffectiveDate,
  formatDate,
  formatMoney,
  parseDateValue,
} from '../utils/formatters';

const mockTimestamp = Timestamp.fromDate(new Date('2026-11-05T10:30:00.000Z'));

function runTestSuite() {
  let passed = 0;
  const test = (name: string, fn: () => void) => {
    try {
      fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (error) {
      console.error(`  FAIL  ${name}`);
      throw error;
    }
  };

  console.log('=== Make & Sell Unit Test Suite ===\n');

  // 1. Branding & Security Validation Rules
  test('1. Default workspace branding is Make & Sell with Philippine Peso (₱)', () => {
    assert.equal(DEFAULT_WORKSPACE_SETTINGS.brandName, 'Make & Sell');
    assert.equal(DEFAULT_WORKSPACE_SETTINGS.currencySymbol, '₱');
  });

  test('2. sanitizeCode produces valid SKU codes matching Firestore security regex', () => {
    const sku1 = sanitizeCode('  SLES 70% Paste / 1kg! ');
    assert.equal(sku1, 'SLES-70-Paste-1kg');
    assert.equal(VALIDATION_RULES.SKU_PATTERN.test(sku1), true);

    const emptyFallback = sanitizeCode('   !!!   ');
    assert.equal(emptyFallback, 'ITEM-01');
    assert.equal(VALIDATION_RULES.SKU_PATTERN.test(emptyFallback), true);

    const truncated = sanitizeCode('A'.repeat(100), VALIDATION_RULES.MAX_SKU_LENGTH);
    assert.equal(truncated.length, VALIDATION_RULES.MAX_SKU_LENGTH);
  });

  test('3. sanitizeString trims, enforces max length, and applies fallback when empty', () => {
    assert.equal(sanitizeString('  Lemon Dish Soap  ', 50, 'Default'), 'Lemon Dish Soap');
    assert.equal(sanitizeString('   ', 50, 'Fallback Name'), 'Fallback Name');
    assert.equal(sanitizeString('ABCDEFGHIJ', 5), 'ABCDE');
  });

  // 2. Packaging Detection Logic
  test('4. isPackagingMaterial accurately distinguishes bottles/containers from liquid ingredients', () => {
    assert.equal(
      isPackagingMaterial({
        category: 'Packaging & Container',
        unit: 'pcs',
        name: '1L PET Bottle & Flip Cap',
      }),
      true
    );
    assert.equal(
      isPackagingMaterial({
        category: 'Raw Ingredient & Base',
        unit: 'pcs',
        name: 'Trigger Sprayer Head',
      }),
      true
    );
    assert.equal(
      isPackagingMaterial(undefined, '1 Gallon HDPE Jug'),
      true
    );
    assert.equal(
      isPackagingMaterial({
        category: 'Surfactant',
        unit: 'kg',
        name: 'SLES 70% Surfactant',
      }),
      false
    );
    assert.equal(
      isPackagingMaterial({
        category: 'Fragrance & Essential Oil',
        unit: 'L',
        name: 'Kalamansi Fragrance Oil',
      }),
      false
    );
  });

  // 3. Formula Unit Economics & Refill Pricing Engine
  test('5. calculateFormulaEconomics computes full unit cost, liquid-only refill cost, packaging cost, and margin', () => {
    const materials: RawMaterial[] = [
      {
        id: 'mat-sles',
        ownerId: 'user-1',
        name: 'SLES 70%',
        sku: 'RM-SLES',
        category: 'Surfactant',
        unit: 'kg',
        stockQuantity: 30, // Enough for 3 batches (10 kg per batch)
        reorderPoint: 10,
        costPerUnit: 8.5, // ₱85 per batch
        supplierName: 'ChemSupplier',
        notes: '',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
      {
        id: 'mat-scent',
        ownerId: 'user-1',
        name: 'Lemon Scent Oil',
        sku: 'RM-LEMON',
        category: 'Fragrance & Essential Oil',
        unit: 'L',
        stockQuantity: 1.5, // Enough for 3 batches (0.5 L per batch)
        reorderPoint: 0.5,
        costPerUnit: 30, // ₱15 per batch
        supplierName: 'ScentCo',
        notes: '',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
      {
        id: 'mat-bottle',
        ownerId: 'user-1',
        name: '1L PET Bottle with Cap',
        sku: 'PK-1L',
        category: 'Packaging & Container',
        unit: 'pcs',
        stockQuantity: 150, // Only enough for 1.5 batches (100 pcs per batch) -> limiting material!
        reorderPoint: 100,
        costPerUnit: 0.5, // ₱50 per batch
        supplierName: 'PackCorp',
        notes: '',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
    ];

    const formula: Formula = {
      id: 'form-dish-1l',
      ownerId: 'user-1',
      name: 'Lemon Dishwashing Liquid',
      sku: 'FG-DISH-1L',
      productCategory: 'Liquid Dishwashing',
      batchYieldUnits: 100,
      unitLabel: '1L Bottle',
      laborCostPerBatch: 20,
      overheadCostPerBatch: 10,
      sellingPricePerUnit: 4.0,
      finishedStockUnits: 50,
      targetMarginPercent: 55,
      notes: '',
      createdAt: mockTimestamp,
      updatedAt: mockTimestamp,
    };

    const ingredients: FormulaIngredient[] = [
      {
        id: 'ing-1',
        ownerId: 'user-1',
        formulaId: 'form-dish-1l',
        materialId: 'mat-sles',
        materialName: 'SLES 70%',
        quantityRequired: 10, // 10 * 8.5 = ₱85
        unit: 'kg',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
      {
        id: 'ing-2',
        ownerId: 'user-1',
        formulaId: 'form-dish-1l',
        materialId: 'mat-scent',
        materialName: 'Lemon Scent Oil',
        quantityRequired: 0.5, // 0.5 * 30 = ₱15
        unit: 'L',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
      {
        id: 'ing-3',
        ownerId: 'user-1',
        formulaId: 'form-dish-1l',
        materialId: 'mat-bottle',
        materialName: '1L PET Bottle with Cap',
        quantityRequired: 100, // 100 * 0.5 = ₱50
        unit: 'pcs',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
    ];

    const econ = calculateFormulaEconomics(formula, ingredients, materials);

    // Liquid ingredients: 85 + 15 = 100
    assert.equal(econ.liquidIngredientsCostPerBatch, 100);
    // Packaging: 50
    assert.equal(econ.packagingCostPerBatch, 50);
    // Total raw materials: 150
    assert.equal(econ.rawMaterialCostPerBatch, 150);
    // Total batch cost (with labor 20 + overhead 10): 180
    assert.equal(econ.totalBatchCost, 180);
    // Cost per 1L bottled unit: 180 / 100 = 1.80
    assert.equal(econ.costPerUnit, 1.8);
    // Liquid-only cost per liter (with labor/overhead): (100 + 20 + 10) / 100 = 1.30
    assert.equal(econ.liquidOnlyCostPerUnit, 1.3);
    // Packaging cost per unit: 50 / 100 = 0.50
    assert.equal(econ.packagingCostPerUnit, 0.5);
    // Suggested refill price (BYOB): 4.00 - 0.50 = 3.50
    assert.equal(econ.suggestedRefillPricePerUnit, 3.5);
    // Gross profit per unit: 4.00 - 1.80 = 2.20
    assert.equal(econ.grossProfitPerUnit, 2.2);
    // Gross margin %: (2.20 / 4.00) * 100 = 55.0%
    assert.equal(econ.grossMarginPercent, 55.0);
    // Batch revenue & profit: 400 & 220
    assert.equal(econ.batchRevenue, 400);
    assert.equal(econ.batchGrossProfit, 220);
    // Limiting material is 1L PET Bottle with Cap at 1.5 batches
    assert.equal(econ.maxProducibleBatches, 1.5);
    assert.equal(econ.limitingMaterialName, '1L PET Bottle with Cap');
    assert.equal(econ.ingredientBreakdown.every((b) => !b.isShortage), true);
  });

  test('6. calculateFormulaEconomics detects ingredient shortages when stock is below 1 batch requirement', () => {
    const materials: RawMaterial[] = [
      {
        id: 'mat-1',
        ownerId: 'u1',
        name: 'Citric Acid',
        sku: 'RM-CIT',
        category: 'Builder & Buffer',
        unit: 'kg',
        stockQuantity: 0.4, // Need 2.0 kg -> shortage!
        reorderPoint: 2,
        costPerUnit: 5,
        supplierName: 'ChemCo',
        notes: '',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
    ];
    const formula: Formula = {
      id: 'f1',
      ownerId: 'u1',
      name: 'Test Formula',
      sku: 'FG-01',
      productCategory: 'Finished Product',
      batchYieldUnits: 50,
      unitLabel: 'Unit',
      laborCostPerBatch: 0,
      overheadCostPerBatch: 0,
      sellingPricePerUnit: 2,
      finishedStockUnits: 0,
      targetMarginPercent: 50,
      notes: '',
      createdAt: mockTimestamp,
      updatedAt: mockTimestamp,
    };
    const ingredients: FormulaIngredient[] = [
      {
        id: 'i1',
        ownerId: 'u1',
        formulaId: 'f1',
        materialId: 'mat-1',
        materialName: 'Citric Acid',
        quantityRequired: 2.0,
        unit: 'kg',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      },
    ];

    const econ = calculateFormulaEconomics(formula, ingredients, materials);
    assert.equal(econ.maxProducibleBatches, 0.2);
    assert.equal(econ.ingredientBreakdown[0].isShortage, true);
  });

  // 4. Date, Currency & Backdated Sale Note Formatting
  test('7. formatMoney formats Philippine Peso (₱) with 2 decimals and handles negative numbers', () => {
    assert.equal(formatMoney(1250.5), '₱1,250.50');
    assert.equal(formatMoney(0), '₱0.00');
    assert.equal(formatMoney(-45.2), '-₱45.20');
  });

  test('8. extractEffectiveDate and cleanDisplayNotes parse backdated [SaleDate: ...] tags while preserving Firestore createdAt rules', () => {
    const serverCreated = Timestamp.fromDate(new Date('2026-11-06T12:00:00.000Z'));
    const rawNotes = '[SaleDate: 2026-10-15T09:00:00.000Z] Paid via GCash (10% discount)';

    const effectiveDate = extractEffectiveDate(serverCreated, rawNotes);
    assert.ok(effectiveDate instanceof Date);
    assert.equal(effectiveDate.toISOString(), '2026-10-15T09:00:00.000Z');

    const cleaned = cleanDisplayNotes(rawNotes);
    assert.equal(cleaned, 'Paid via GCash (10% discount)');

    const formattedWithBackdate = formatDate(serverCreated, false, rawNotes);
    assert.equal(formattedWithBackdate.includes('Oct'), true);
    assert.equal(formattedWithBackdate.includes('2026'), true);

    const parsedFallback = parseDateValue(serverCreated);
    assert.equal(parsedFallback?.toISOString(), '2026-11-06T12:00:00.000Z');
  });

  // 5. Container Volume Scaling & Discount Math
  test('9. Container presets scale volumes and prices accurately (500mL, 1L, 1.5L, 1 Gallon 3.785L, 5 Gallon 18.925L)', () => {
    const baseLiquidPricePerLiter = 3.5;
    const baseLiquidCostPerLiter = 1.3;
    const bottleAddonPerPiece = 0.5;

    const p500ml = COMMON_CONTAINER_PRESETS.find((c) => c.id === '500ml')!;
    const p15l = COMMON_CONTAINER_PRESETS.find((c) => c.id === '1.5l')!;
    const p1gal = COMMON_CONTAINER_PRESETS.find((c) => c.id === '1gal')!;

    assert.equal(p500ml.volumeFactor, 0.5);
    assert.equal(p15l.volumeFactor, 1.5);
    assert.equal(p1gal.volumeFactor, 3.785);

    // 1.5L Refill Only (Customer Own Bottle): 1.5 * 3.50 = ₱5.25
    const refill15LPrice = Number((baseLiquidPricePerLiter * p15l.volumeFactor).toFixed(2));
    assert.equal(refill15LPrice, 5.25);

    // 1 Gallon With New Jug: (3.785 * 3.50) + 0.50 = 13.2475 + 0.50 = ₱13.75
    const galWithJugPrice = Number(
      (baseLiquidPricePerLiter * p1gal.volumeFactor + bottleAddonPerPiece).toFixed(2)
    );
    assert.equal(galWithJugPrice, 13.75);

    // 20% discount on 10 × 1.5L Refill (15 Liters total deducted from stock)
    const containersSold = 10;
    const totalLitersDeducted = Number((containersSold * p15l.volumeFactor).toFixed(2));
    assert.equal(totalLitersDeducted, 15.0);

    const discountedContainerPrice = Number((refill15LPrice * (1 - 20 / 100)).toFixed(2)); // 5.25 * 0.8 = 4.20
    assert.equal(discountedContainerPrice, 4.2);

    const totalRevenue = Number((discountedContainerPrice * containersSold).toFixed(2)); // ₱42.00
    const totalCost = Number((baseLiquidCostPerLiter * totalLitersDeducted).toFixed(2)); // 1.30 * 15 = ₱19.50
    const totalProfit = Number((totalRevenue - totalCost).toFixed(2)); // ₱22.50

    assert.equal(totalRevenue, 42.0);
    assert.equal(totalCost, 19.5);
    assert.equal(totalProfit, 22.5);
  });

  console.log(`\nAll ${passed} unit tests passed!`);
}

runTestSuite();
