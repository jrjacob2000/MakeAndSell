import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  BatchStatus,
  Formula,
  FormulaIngredient,
  isPackagingMaterial,
  MaterialCategory,
  MaterialUnit,
  ProductCategory,
  ProductionBatch,
  RawMaterial,
  sanitizeCode,
  sanitizeString,
  VALIDATION_RULES,
  WorkspaceSettings,
} from '../types/domain';

export async function saveWorkspaceSettings(
  ownerId: string,
  input: Omit<WorkspaceSettings, 'ownerId' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, 'workspaceSettings', ownerId);
  const path = `workspaceSettings/${ownerId}`;
  try {
    await setDoc(ref, {
      ownerId,
      brandName: sanitizeString(
        input.brandName,
        VALIDATION_RULES.MAX_BRAND_NAME_LENGTH,
        'Make & Sell'
      ),
      workspaceTitle: sanitizeString(
        input.workspaceTitle,
        VALIDATION_RULES.MAX_WORKSPACE_TITLE_LENGTH,
        'Supplies, Recipes, Batches & Sales Tracker'
      ),
      workspaceSubtitle: sanitizeString(
        input.workspaceSubtitle,
        VALIDATION_RULES.MAX_WORKSPACE_SUBTITLE_LENGTH,
        'Track your raw supplies, product recipes, bottled and refill batches, and daily customer sales in one place.'
      ),
      industryLabel: sanitizeString(
        input.industryLabel,
        VALIDATION_RULES.MAX_INDUSTRY_LABEL_LENGTH,
        'Small Business Stock, Batch & Sales Tracker'
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createRawMaterial(
  ownerId: string,
  input: {
    name: string;
    sku: string;
    category: MaterialCategory;
    unit: MaterialUnit;
    stockQuantity: number;
    reorderPoint: number;
    costPerUnit: number;
    supplierName: string;
    notes: string;
  }
): Promise<string> {
  const ref = doc(collection(db, 'rawMaterials'));
  const path = `rawMaterials/${ref.id}`;
  try {
    await setDoc(ref, {
      ownerId,
      name: sanitizeString(input.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Unnamed Material'),
      sku: sanitizeCode(input.sku, VALIDATION_RULES.MAX_SKU_LENGTH),
      category: input.category,
      unit: input.unit,
      stockQuantity: Math.max(0, Number(input.stockQuantity) || 0),
      reorderPoint: Math.max(0, Number(input.reorderPoint) || 0),
      costPerUnit: Math.max(0, Number(input.costPerUnit) || 0),
      supplierName: sanitizeString(
        input.supplierName,
        VALIDATION_RULES.MAX_SUPPLIER_LENGTH,
        'General Supplier'
      ),
      notes: sanitizeString(input.notes, VALIDATION_RULES.MAX_NOTES_LENGTH),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRawMaterialSpec(
  materialId: string,
  input: {
    name: string;
    sku: string;
    category: MaterialCategory;
    unit: MaterialUnit;
    stockQuantity: number;
    reorderPoint: number;
    costPerUnit: number;
    supplierName: string;
    notes: string;
  },
  ownerId?: string
): Promise<void> {
  const ref = doc(db, 'rawMaterials', materialId);
  const path = `rawMaterials/${materialId}`;
  const cleanName = sanitizeString(
    input.name,
    VALIDATION_RULES.MAX_NAME_LENGTH,
    'Unnamed Material'
  );
  try {
    await updateDoc(ref, {
      name: cleanName,
      sku: sanitizeCode(input.sku, VALIDATION_RULES.MAX_SKU_LENGTH),
      category: input.category,
      unit: input.unit,
      stockQuantity: Math.max(0, Number(input.stockQuantity) || 0),
      reorderPoint: Math.max(0, Number(input.reorderPoint) || 0),
      costPerUnit: Math.max(0, Number(input.costPerUnit) || 0),
      supplierName: sanitizeString(
        input.supplierName,
        VALIDATION_RULES.MAX_SUPPLIER_LENGTH,
        'General Supplier'
      ),
      notes: sanitizeString(input.notes, VALIDATION_RULES.MAX_NOTES_LENGTH),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  // Sync cached materialName and unit on any formulaIngredients referencing this material
  if (ownerId) {
    try {
      const q = query(
        collection(db, 'formulaIngredients'),
        where('ownerId', '==', ownerId)
      );
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as FormulaIngredient;
        if (
          data.materialId === materialId &&
          (data.materialName !== cleanName || data.unit !== input.unit)
        ) {
          await updateDoc(doc(db, 'formulaIngredients', docSnap.id), {
            quantityRequired: data.quantityRequired,
            materialName: cleanName,
            unit: input.unit,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Non-fatal if background ingredient label sync fails
    }
  }
}

export async function deleteRawMaterial(materialId: string): Promise<void> {
  const ref = doc(db, 'rawMaterials', materialId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rawMaterials/${materialId}`);
  }
}

export async function recordPurchaseOrderAndRestock(
  ownerId: string,
  material: RawMaterial,
  input: {
    quantityPurchased: number;
    unitCost: number;
    supplierName: string;
    batchReference: string;
  }
): Promise<void> {
  const qty = Math.max(0.01, Number(input.quantityPurchased) || 0);
  const unitCost = Math.max(0, Number(input.unitCost) || 0);
  const totalCost = Number((qty * unitCost).toFixed(2));

  // Compute weighted average unit cost
  const existingValue = material.stockQuantity * material.costPerUnit;
  const newStockQuantity = Number((material.stockQuantity + qty).toFixed(4));
  const weightedCostPerUnit =
    newStockQuantity > 0
      ? Number(((existingValue + totalCost) / newStockQuantity).toFixed(4))
      : unitCost;

  const matRef = doc(db, 'rawMaterials', material.id);
  try {
    await updateDoc(matRef, {
      stockQuantity: newStockQuantity,
      costPerUnit: weightedCostPerUnit,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rawMaterials/${material.id}`);
  }

  const poRef = doc(collection(db, 'purchaseOrders'));
  try {
    await setDoc(poRef, {
      ownerId,
      materialId: material.id,
      materialName: sanitizeString(material.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Material'),
      supplierName: sanitizeString(
        input.supplierName || material.supplierName,
        VALIDATION_RULES.MAX_SUPPLIER_LENGTH,
        'Supplier'
      ),
      quantityPurchased: qty,
      unit: material.unit,
      unitCost,
      totalCost,
      batchReference: sanitizeCode(input.batchReference, VALIDATION_RULES.MAX_BATCH_REF_LENGTH),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `purchaseOrders/${poRef.id}`);
  }
}

export async function createFormulaWithIngredients(
  ownerId: string,
  formulaInput: {
    name: string;
    sku: string;
    productCategory: ProductCategory;
    batchYieldUnits: number;
    unitLabel: string;
    laborCostPerBatch: number;
    overheadCostPerBatch: number;
    sellingPricePerUnit: number;
    finishedStockUnits: number;
    targetMarginPercent: number;
    notes: string;
  },
  ingredientInputs: {
    materialId: string;
    materialName: string;
    quantityRequired: number;
    unit: MaterialUnit;
  }[]
): Promise<string> {
  const formulaRef = doc(collection(db, 'formulas'));
  const formulaPath = `formulas/${formulaRef.id}`;

  try {
    await setDoc(formulaRef, {
      ownerId,
      name: sanitizeString(formulaInput.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'New Formula'),
      sku: sanitizeCode(formulaInput.sku, VALIDATION_RULES.MAX_SKU_LENGTH),
      productCategory: formulaInput.productCategory,
      batchYieldUnits: Math.max(1, Number(formulaInput.batchYieldUnits) || 100),
      unitLabel: sanitizeString(
        formulaInput.unitLabel,
        VALIDATION_RULES.MAX_UNIT_LABEL_LENGTH,
        '1L Bottle'
      ),
      laborCostPerBatch: Math.max(0, Number(formulaInput.laborCostPerBatch) || 0),
      overheadCostPerBatch: Math.max(0, Number(formulaInput.overheadCostPerBatch) || 0),
      sellingPricePerUnit: Math.max(0, Number(formulaInput.sellingPricePerUnit) || 0),
      finishedStockUnits: Math.max(0, Number(formulaInput.finishedStockUnits) || 0),
      targetMarginPercent: Math.min(
        100,
        Math.max(0, Number(formulaInput.targetMarginPercent) || 50)
      ),
      notes: sanitizeString(formulaInput.notes, VALIDATION_RULES.MAX_NOTES_LENGTH),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, formulaPath);
  }

  // Deduplicate/merge ingredient inputs by materialId before creating FormulaIngredient documents
  const mergedMap = new Map<
    string,
    {
      materialId: string;
      materialName: string;
      quantityRequired: number;
      unit: MaterialUnit;
    }
  >();
  for (const ing of ingredientInputs) {
    if (!ing.materialId || ing.quantityRequired <= 0) continue;
    const prev = mergedMap.get(ing.materialId);
    if (prev) {
      prev.quantityRequired = Number(
        (prev.quantityRequired + (Number(ing.quantityRequired) || 0)).toFixed(4)
      );
    } else {
      mergedMap.set(ing.materialId, {
        materialId: ing.materialId,
        materialName: ing.materialName,
        quantityRequired: Math.max(0.001, Number(ing.quantityRequired) || 1),
        unit: ing.unit,
      });
    }
  }

  // Create relational FormulaIngredient documents after the parent Formula document exists
  for (const ing of mergedMap.values()) {
    const ingRef = doc(collection(db, 'formulaIngredients'));
    try {
      await setDoc(ingRef, {
        ownerId,
        formulaId: formulaRef.id,
        materialId: ing.materialId,
        materialName: sanitizeString(ing.materialName, VALIDATION_RULES.MAX_NAME_LENGTH, 'Material'),
        quantityRequired: Math.max(0.001, Number(ing.quantityRequired) || 1),
        unit: ing.unit,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `formulaIngredients/${ingRef.id}`);
    }
  }

  return formulaRef.id;
}

export async function updateFormulaDetails(
  formulaId: string,
  input: {
    name: string;
    sku: string;
    productCategory: ProductCategory;
    batchYieldUnits: number;
    unitLabel: string;
    laborCostPerBatch: number;
    overheadCostPerBatch: number;
    sellingPricePerUnit: number;
    finishedStockUnits: number;
    targetMarginPercent: number;
    notes: string;
  }
): Promise<void> {
  const ref = doc(db, 'formulas', formulaId);
  try {
    await updateDoc(ref, {
      name: sanitizeString(input.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Formula'),
      sku: sanitizeCode(input.sku, VALIDATION_RULES.MAX_SKU_LENGTH),
      productCategory: input.productCategory,
      batchYieldUnits: Math.max(1, Number(input.batchYieldUnits) || 100),
      unitLabel: sanitizeString(
        input.unitLabel,
        VALIDATION_RULES.MAX_UNIT_LABEL_LENGTH,
        '1L Bottle'
      ),
      laborCostPerBatch: Math.max(0, Number(input.laborCostPerBatch) || 0),
      overheadCostPerBatch: Math.max(0, Number(input.overheadCostPerBatch) || 0),
      sellingPricePerUnit: Math.max(0, Number(input.sellingPricePerUnit) || 0),
      finishedStockUnits: Math.max(0, Number(input.finishedStockUnits) || 0),
      targetMarginPercent: Math.min(100, Math.max(0, Number(input.targetMarginPercent) || 50)),
      notes: sanitizeString(input.notes, VALIDATION_RULES.MAX_NOTES_LENGTH),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `formulas/${formulaId}`);
  }
}

export async function updateFinishedProductStock(
  formulaId: string,
  newFinishedStockUnits: number
): Promise<void> {
  const ref = doc(db, 'formulas', formulaId);
  const clampedStock = Math.min(
    100000000,
    Math.max(0, Number(Number(newFinishedStockUnits).toFixed(2)) || 0)
  );
  try {
    await updateDoc(ref, {
      finishedStockUnits: clampedStock,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `formulas/${formulaId}`);
  }
}

export async function recordProductSale(
  ownerId: string,
  formula: Formula,
  costPerUnit: number,
  input: {
    customerName: string;
    quantitySold: number;
    sellingPricePerUnit: number;
    notes: string;
    customDate?: string | Date;
  }
): Promise<string> {
  const qty = Math.min(
    100000000,
    Math.max(0.01, Number(Number(input.quantitySold).toFixed(2)) || 1)
  );
  const sellPrice = Math.min(
    100000000,
    Math.max(0, Number(Number(input.sellingPricePerUnit).toFixed(2)) || 0)
  );
  const unitCost = Math.min(
    100000000,
    Math.max(0, Number(Number(costPerUnit).toFixed(2)) || 0)
  );
  const totalRevenue = Number((qty * sellPrice).toFixed(2));
  const totalCost = Number((qty * unitCost).toFixed(2));
  const totalProfit = Number((totalRevenue - totalCost).toFixed(2));

  // 1. Subtract sold items from finished product inventory
  const remainingStock = Math.max(
    0,
    Number((formula.finishedStockUnits - qty).toFixed(2))
  );
  const formulaRef = doc(db, 'formulas', formula.id);
  try {
    await updateDoc(formulaRef, {
      finishedStockUnits: remainingStock,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `formulas/${formula.id}`);
  }

  // 2. Create permanent ProductSale record in /productSales
  // Note: Firestore rules strictly enforce incoming().createdAt == request.time (serverTimestamp()).
  // Any custom backdated sale date is stored as [SaleDate: ISO] in notes and parsed by extractEffectiveDate().
  const saleRef = doc(collection(db, 'productSales'));
  let customDatePrefix = '';
  if (input.customDate) {
    const d = typeof input.customDate === 'string' ? new Date(input.customDate) : input.customDate;
    if (!isNaN(d.getTime())) {
      const diffMinutes = Math.abs(Date.now() - d.getTime()) / 60000;
      if (diffMinutes > 15) {
        customDatePrefix = `[SaleDate: ${d.toISOString()}] `;
      }
    }
  }

  try {
    await setDoc(saleRef, {
      ownerId,
      formulaId: formula.id,
      formulaName: sanitizeString(formula.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Product'),
      productCategory: sanitizeString(
        formula.productCategory,
        VALIDATION_RULES.MAX_CATEGORY_LENGTH,
        'Finished Product'
      ),
      customerName: sanitizeString(
        input.customerName,
        VALIDATION_RULES.MAX_NAME_LENGTH,
        'Walk-in Customer'
      ),
      quantitySold: qty,
      unitLabel: sanitizeString(
        formula.unitLabel,
        VALIDATION_RULES.MAX_UNIT_LABEL_LENGTH,
        'Unit'
      ),
      sellingPricePerUnit: sellPrice,
      costPerUnit: unitCost,
      totalRevenue,
      totalCost,
      totalProfit,
      notes: sanitizeString(
        `${customDatePrefix}${input.notes || ''}`.trim(),
        VALIDATION_RULES.MAX_NOTES_LENGTH
      ),
      createdAt: serverTimestamp(),
    });
    return saleRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `productSales/${saleRef.id}`);
  }
}

export async function deleteProductSale(
  saleId: string,
  restoreStock?: { formulaId: string; quantity: number }
): Promise<void> {
  const ref = doc(db, 'productSales', saleId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `productSales/${saleId}`);
  }

  // Restore finished product stock if requested
  if (restoreStock && restoreStock.formulaId && restoreStock.quantity > 0) {
    const formulaRef = doc(db, 'formulas', restoreStock.formulaId);
    try {
      const snap = await getDoc(formulaRef);
      if (snap.exists()) {
        const currentStock = Number(snap.data()?.finishedStockUnits) || 0;
        const restored = Number((currentStock + restoreStock.quantity).toFixed(2));
        await updateDoc(formulaRef, {
          finishedStockUnits: restored,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal if formula was already deleted
    }
  }
}


export async function addIngredientToFormula(
  ownerId: string,
  formulaId: string,
  material: RawMaterial,
  quantityRequired: number,
  existingIngredients?: FormulaIngredient[]
): Promise<void> {
  const cleanQty = Math.max(0.001, Number(quantityRequired) || 1);
  const cleanName = sanitizeString(material.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Material');

  // If this ingredient already exists in the formula, increment its quantityRequired instead of duplicating
  const duplicate = existingIngredients?.find(
    (ing) => ing.formulaId === formulaId && ing.materialId === material.id
  );
  if (duplicate) {
    const updatedQty = Number((duplicate.quantityRequired + cleanQty).toFixed(4));
    const dupRef = doc(db, 'formulaIngredients', duplicate.id);
    try {
      await updateDoc(dupRef, {
        quantityRequired: updatedQty,
        materialName: cleanName,
        unit: material.unit,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `formulaIngredients/${duplicate.id}`);
    }
  }

  const ingRef = doc(collection(db, 'formulaIngredients'));
  try {
    await setDoc(ingRef, {
      ownerId,
      formulaId,
      materialId: material.id,
      materialName: cleanName,
      quantityRequired: cleanQty,
      unit: material.unit,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `formulaIngredients/${ingRef.id}`);
  }
}

export async function removeFormulaIngredient(ingredientId: string): Promise<void> {
  const ref = doc(db, 'formulaIngredients', ingredientId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `formulaIngredients/${ingredientId}`);
  }
}

export async function deleteFormulaAndIngredients(
  formulaId: string,
  ingredients: FormulaIngredient[]
): Promise<void> {
  for (const ing of ingredients) {
    if (ing.formulaId === formulaId) {
      await removeFormulaIngredient(ing.id);
    }
  }
  const ref = doc(db, 'formulas', formulaId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `formulas/${formulaId}`);
  }
}

export async function executeProductionBatch(
  ownerId: string,
  formula: Formula,
  ingredients: FormulaIngredient[],
  materials: RawMaterial[],
  input: {
    batchCode: string;
    batchMultiplier: number;
    refillUnitsNoBottle?: number;
    bottlingBreakdownNote?: string;
    status: BatchStatus;
    notes: string;
  }
): Promise<string> {
  const multiplier = Math.max(0.1, Number(input.batchMultiplier) || 1);
  const unitsProduced = Math.max(1, Math.round(formula.batchYieldUnits * multiplier));
  const refillUnits = Math.min(
    unitsProduced,
    Math.max(0, Number((Number(input.refillUnitsNoBottle) || 0).toFixed(2)))
  );
  const bottledUnits = Math.max(0, Number((unitsProduced - refillUnits).toFixed(2)));
  const bottledFraction = unitsProduced > 0 ? bottledUnits / unitsProduced : 1;

  const materialMap = new Map(materials.map((m) => [m.id, m]));

  let rawMaterialCost = 0;

  // 1. Deduct raw materials from inventory (packaging/bottles only deducted for bottledUnits)
  for (const ing of ingredients) {
    const mat = materialMap.get(ing.materialId);
    if (!mat) continue;
    const isPkg = isPackagingMaterial(mat, ing.materialName);
    const effectiveFactor = isPkg ? multiplier * bottledFraction : multiplier;
    const consumedQty = Number((ing.quantityRequired * effectiveFactor).toFixed(4));
    rawMaterialCost += consumedQty * mat.costPerUnit;

    if (consumedQty > 0) {
      const updatedStock = Math.max(0, Number((mat.stockQuantity - consumedQty).toFixed(4)));
      const matRef = doc(db, 'rawMaterials', mat.id);
      try {
        await updateDoc(matRef, {
          stockQuantity: updatedStock,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `rawMaterials/${mat.id}`);
      }
    }
  }

  rawMaterialCost = Number(rawMaterialCost.toFixed(2));
  const laborCost = Number((formula.laborCostPerBatch * multiplier).toFixed(2));
  const overheadCost = Number((formula.overheadCostPerBatch * multiplier).toFixed(2));
  const totalProductionCost = Number((rawMaterialCost + laborCost + overheadCost).toFixed(2));
  const costPerUnit = Number((totalProductionCost / unitsProduced).toFixed(2));
  const sellingPricePerUnit = formula.sellingPricePerUnit;
  const projectedRevenue = Number((sellingPricePerUnit * unitsProduced).toFixed(2));
  const projectedProfit = Number((projectedRevenue - totalProductionCost).toFixed(2));
  const profitMarginPercent =
    projectedRevenue > 0
      ? Math.min(
          100,
          Math.max(-10000, Number(((projectedProfit / projectedRevenue) * 100).toFixed(1)))
        )
      : 0;

  // 2. If batch is immediately marked completed, add finished units to Formula stock
  if (input.status === 'completed') {
    const formulaRef = doc(db, 'formulas', formula.id);
    try {
      await updateDoc(formulaRef, {
        finishedStockUnits: Number((formula.finishedStockUnits + unitsProduced).toFixed(2)),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `formulas/${formula.id}`);
    }
  }

  const splitPrefix = input.bottlingBreakdownNote
    ? `${input.bottlingBreakdownNote} `
    : refillUnits > 0
    ? `[Bottled: ${bottledUnits}, Refill No-Bottle: ${refillUnits}] `
    : '';
  const combinedNotes = sanitizeString(
    `${splitPrefix}${input.notes || ''}`.trim(),
    VALIDATION_RULES.MAX_NOTES_LENGTH
  );

  // 3. Create ProductionBatch record
  const batchRef = doc(collection(db, 'productionBatches'));
  try {
    await setDoc(batchRef, {
      ownerId,
      formulaId: formula.id,
      formulaName: sanitizeString(formula.name, VALIDATION_RULES.MAX_NAME_LENGTH, 'Formula'),
      productCategory: formula.productCategory,
      batchCode: sanitizeCode(input.batchCode, VALIDATION_RULES.MAX_SKU_LENGTH),
      batchMultiplier: multiplier,
      unitsProduced,
      unitLabel: sanitizeString(formula.unitLabel, VALIDATION_RULES.MAX_UNIT_LABEL_LENGTH, 'Unit'),
      rawMaterialCost,
      laborCost,
      overheadCost,
      totalProductionCost,
      costPerUnit,
      sellingPricePerUnit,
      projectedRevenue,
      projectedProfit,
      profitMarginPercent,
      status: input.status,
      notes: sanitizeString(combinedNotes, VALIDATION_RULES.MAX_NOTES_LENGTH),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return batchRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `productionBatches/${batchRef.id}`);
  }
}

export async function transitionBatchStatus(
  batch: ProductionBatch,
  formula: Formula | undefined,
  newStatus: 'completed' | 'cancelled',
  ingredients?: FormulaIngredient[],
  materials?: RawMaterial[]
): Promise<void> {
  const batchRef = doc(db, 'productionBatches', batch.id);
  try {
    await updateDoc(batchRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `productionBatches/${batch.id}`);
  }

  if (newStatus === 'completed' && formula) {
    const formulaRef = doc(db, 'formulas', formula.id);
    try {
      await updateDoc(formulaRef, {
        finishedStockUnits: Number((formula.finishedStockUnits + batch.unitsProduced).toFixed(2)),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `formulas/${formula.id}`);
    }
  } else if (newStatus === 'cancelled' && ingredients && materials) {
    // Restore raw materials consumed when the in_progress batch was started
    const formulaIngs = ingredients.filter((i) => i.formulaId === batch.formulaId);
    const materialMap = new Map(materials.map((m) => [m.id, m]));
    for (const ing of formulaIngs) {
      const mat = materialMap.get(ing.materialId);
      if (!mat) continue;
      const restoredQty = Number((ing.quantityRequired * batch.batchMultiplier).toFixed(4));
      if (restoredQty > 0) {
        const updatedStock = Number((mat.stockQuantity + restoredQty).toFixed(4));
        try {
          await updateDoc(doc(db, 'rawMaterials', mat.id), {
            stockQuantity: updatedStock,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal if material was deleted
        }
      }
    }
  }
}

export async function seedSampleManufacturingData(ownerId: string): Promise<void> {
  // 1. Seed Raw Chemicals & Packaging
  const rawMaterialSpecs: {
    key: string;
    name: string;
    sku: string;
    category: MaterialCategory;
    unit: MaterialUnit;
    stockQuantity: number;
    reorderPoint: number;
    costPerUnit: number;
    supplierName: string;
    notes: string;
  }[] = [
    {
      key: 'sles',
      name: 'SLES 70% (Sodium Laureth Sulfate)',
      sku: 'CHEM-SLES-70',
      category: 'Surfactant',
      unit: 'kg',
      stockQuantity: 220,
      reorderPoint: 50,
      costPerUnit: 2.35,
      supplierName: 'Pacific Surfactants Co.',
      notes: 'Primary anionic surfactant paste for dishwashing and laundry detergent.',
    },
    {
      key: 'labsa',
      name: 'LABSA 96% (Linear Alkylbenzene Sulfonic Acid)',
      sku: 'CHEM-LABSA-96',
      category: 'Surfactant',
      unit: 'kg',
      stockQuantity: 115,
      reorderPoint: 35,
      costPerUnit: 2.8,
      supplierName: 'Pacific Surfactants Co.',
      notes: 'High-active grease cutting surfactant; neutralize to pH 7.0 with NaOH/soda ash.',
    },
    {
      key: 'cdea',
      name: 'CDEA 85% (Cocamide DEA Foam Booster)',
      sku: 'CHEM-CDEA-85',
      category: 'Surfactant',
      unit: 'kg',
      stockQuantity: 75,
      reorderPoint: 20,
      costPerUnit: 3.45,
      supplierName: 'OleoChem Solutions',
      notes: 'Non-ionic foam stabilizer and viscosity builder.',
    },
    {
      key: 'esterquat',
      name: 'Esterquat 90% Conditioning Paste',
      sku: 'CHEM-ESTQ-90',
      category: 'Conditioning Agent',
      unit: 'kg',
      stockQuantity: 64,
      reorderPoint: 25,
      costPerUnit: 4.15,
      supplierName: 'OleoChem Solutions',
      notes: 'Biodegradable cationic fabric softening active dispersed in warm water (55C).',
    },
    {
      key: 'nacl',
      name: 'Sodium Chloride (Industrial Refined NaCl)',
      sku: 'CHEM-NACL-99',
      category: 'Thickener & Salt',
      unit: 'kg',
      stockQuantity: 310,
      reorderPoint: 75,
      costPerUnit: 0.35,
      supplierName: 'Delta Minerals Ltd.',
      notes: 'Electrolyte viscosity modifier for SLES/LABSA surfactant systems.',
    },
    {
      key: 'citric',
      name: 'Citric Acid Anhydrous (USP Grade)',
      sku: 'CHEM-CITR-USP',
      category: 'Builder & Buffer',
      unit: 'kg',
      stockQuantity: 14,
      reorderPoint: 20,
      costPerUnit: 1.9,
      supplierName: 'Delta Minerals Ltd.',
      notes: 'pH adjuster and water softener chelating builder.',
    },
    {
      key: 'edta',
      name: 'Tetrasodium EDTA Chelating Agent',
      sku: 'CHEM-EDTA-4NA',
      category: 'Preservative',
      unit: 'kg',
      stockQuantity: 18,
      reorderPoint: 10,
      costPerUnit: 4.6,
      supplierName: 'Apex Chemical Supply',
      notes: 'Prevents hard water mineral precipitation and improves shelf stability.',
    },
    {
      key: 'scent_lemon',
      name: ' Sicilian Lemon Zest Fragrance Oil',
      sku: 'FRAG-LEMON-01',
      category: 'Fragrance & Essential Oil',
      unit: 'L',
      stockQuantity: 15,
      reorderPoint: 5,
      costPerUnit: 18.5,
      supplierName: 'AromaCraft Essences',
      notes: 'High-impact citrus fragrance for dishwashing liquid.',
    },
    {
      key: 'scent_lavender',
      name: 'Micro-Encapsulated Velvet Lavender Scent',
      sku: 'FRAG-LAV-ENC',
      category: 'Fragrance & Essential Oil',
      unit: 'L',
      stockQuantity: 11,
      reorderPoint: 4,
      costPerUnit: 24.0,
      supplierName: 'AromaCraft Essences',
      notes: 'Long-lasting encapsulated fragrance beads for fabric conditioner and laundry.',
    },
    {
      key: 'bottle_1l',
      name: 'HDPE 1L Bottle with Flip-Top Cap',
      sku: 'PKG-HDPE-1L',
      category: 'Packaging & Container',
      unit: 'pcs',
      stockQuantity: 1450,
      reorderPoint: 400,
      costPerUnit: 0.28,
      supplierName: 'PolyPack Containers',
      notes: 'Standard 1-liter container with waterproof label.',
    },
    {
      key: 'jug_2l',
      name: 'HDPE 2L Heavy-Duty Handle Jug',
      sku: 'PKG-HDPE-2L',
      category: 'Packaging & Container',
      unit: 'pcs',
      stockQuantity: 680,
      reorderPoint: 200,
      costPerUnit: 0.54,
      supplierName: 'PolyPack Containers',
      notes: '2-liter ergonomic handle jug with measuring cap.',
    },
  ];

  const materialIds: Record<string, string> = {};
  for (const spec of rawMaterialSpecs) {
    const id = await createRawMaterial(ownerId, spec);
    materialIds[spec.key] = id;
  }

  // 2. Seed Purchase Orders
  const samplePOs = [
    {
      key: 'sles',
      name: 'SLES 70% (Sodium Laureth Sulfate)',
      supplier: 'Pacific Surfactants Co.',
      qty: 200,
      unit: 'kg' as MaterialUnit,
      unitCost: 2.35,
      ref: 'PO-2026-1041',
    },
    {
      key: 'esterquat',
      name: 'Esterquat 90% Conditioning Paste',
      supplier: 'OleoChem Solutions',
      qty: 60,
      unit: 'kg' as MaterialUnit,
      unitCost: 4.15,
      ref: 'PO-2026-1042',
    },
    {
      key: 'bottle_1l',
      name: 'HDPE 1L Bottle with Flip-Top Cap',
      supplier: 'PolyPack Containers',
      qty: 1500,
      unit: 'pcs' as MaterialUnit,
      unitCost: 0.28,
      ref: 'PO-2026-1045',
    },
  ];

  for (const po of samplePOs) {
    const poRef = doc(collection(db, 'purchaseOrders'));
    await setDoc(poRef, {
      ownerId,
      materialId: materialIds[po.key],
      materialName: po.name,
      supplierName: po.supplier,
      quantityPurchased: po.qty,
      unit: po.unit,
      unitCost: po.unitCost,
      totalCost: Number((po.qty * po.unitCost).toFixed(2)),
      batchReference: po.ref,
      createdAt: serverTimestamp(),
    });
  }

  // 3. Seed Product Formulas & Ingredients
  const dishFormulaId = await createFormulaWithIngredients(
    ownerId,
    {
      name: 'Citrus Shield Liquid Dishwashing (1L)',
      sku: 'FG-DISH-1L',
      productCategory: 'Liquid Dishwashing',
      batchYieldUnits: 100,
      unitLabel: '1L Bottle',
      laborCostPerBatch: 22,
      overheadCostPerBatch: 12,
      sellingPricePerUnit: 2.85,
      finishedStockUnits: 240,
      targetMarginPercent: 58,
      notes: 'Dissolve SLES & LABSA in deionized water, neutralize pH to 7.2, add CDEA, fragrance, and thicken with NaCl.',
    },
    [
      {
        materialId: materialIds.sles,
        materialName: 'SLES 70% (Sodium Laureth Sulfate)',
        quantityRequired: 11,
        unit: 'kg',
      },
      {
        materialId: materialIds.labsa,
        materialName: 'LABSA 96% (Linear Alkylbenzene Sulfonic Acid)',
        quantityRequired: 3.5,
        unit: 'kg',
      },
      {
        materialId: materialIds.cdea,
        materialName: 'CDEA 85% (Cocamide DEA Foam Booster)',
        quantityRequired: 2,
        unit: 'kg',
      },
      {
        materialId: materialIds.nacl,
        materialName: 'Sodium Chloride (Industrial Refined NaCl)',
        quantityRequired: 3,
        unit: 'kg',
      },
      {
        materialId: materialIds.citric,
        materialName: 'Citric Acid Anhydrous (USP Grade)',
        quantityRequired: 0.4,
        unit: 'kg',
      },
      {
        materialId: materialIds.scent_lemon,
        materialName: 'Sicilian Lemon Zest Fragrance Oil',
        quantityRequired: 0.35,
        unit: 'L',
      },
      {
        materialId: materialIds.bottle_1l,
        materialName: 'HDPE 1L Bottle with Flip-Top Cap',
        quantityRequired: 100,
        unit: 'pcs',
      },
    ]
  );

  const fabconFormulaId = await createFormulaWithIngredients(
    ownerId,
    {
      name: 'Velvet Cloud Fabric Conditioner (1L)',
      sku: 'FG-FABC-1L',
      productCategory: 'Fabric Conditioner',
      batchYieldUnits: 100,
      unitLabel: '1L Bottle',
      laborCostPerBatch: 18,
      overheadCostPerBatch: 11,
      sellingPricePerUnit: 3.2,
      finishedStockUnits: 180,
      targetMarginPercent: 60,
      notes: 'Emulsify Esterquat at 55C with high-shear mixer, cool to 35C before adding encapsulated lavender fragrance.',
    },
    [
      {
        materialId: materialIds.esterquat,
        materialName: 'Esterquat 90% Conditioning Paste',
        quantityRequired: 7.5,
        unit: 'kg',
      },
      {
        materialId: materialIds.citric,
        materialName: 'Citric Acid Anhydrous (USP Grade)',
        quantityRequired: 0.25,
        unit: 'kg',
      },
      {
        materialId: materialIds.edta,
        materialName: 'Tetrasodium EDTA Chelating Agent',
        quantityRequired: 0.15,
        unit: 'kg',
      },
      {
        materialId: materialIds.scent_lavender,
        materialName: 'Micro-Encapsulated Velvet Lavender Scent',
        quantityRequired: 0.55,
        unit: 'L',
      },
      {
        materialId: materialIds.bottle_1l,
        materialName: 'HDPE 1L Bottle with Flip-Top Cap',
        quantityRequired: 100,
        unit: 'pcs',
      },
    ]
  );

  const detergentFormulaId = await createFormulaWithIngredients(
    ownerId,
    {
      name: 'OxyCleanse Heavy-Duty Liquid Detergent (2L)',
      sku: 'FG-DETG-2L',
      productCategory: 'Liquid Detergent',
      batchYieldUnits: 50,
      unitLabel: '2L Jug',
      laborCostPerBatch: 25,
      overheadCostPerBatch: 15,
      sellingPricePerUnit: 6.5,
      finishedStockUnits: 95,
      targetMarginPercent: 54,
      notes: 'High-active laundry detergent for top and front load machines. Target viscosity 450 cPs.',
    },
    [
      {
        materialId: materialIds.sles,
        materialName: 'SLES 70% (Sodium Laureth Sulfate)',
        quantityRequired: 13,
        unit: 'kg',
      },
      {
        materialId: materialIds.labsa,
        materialName: 'LABSA 96% (Linear Alkylbenzene Sulfonic Acid)',
        quantityRequired: 5.5,
        unit: 'kg',
      },
      {
        materialId: materialIds.cdea,
        materialName: 'CDEA 85% (Cocamide DEA Foam Booster)',
        quantityRequired: 2.5,
        unit: 'kg',
      },
      {
        materialId: materialIds.edta,
        materialName: 'Tetrasodium EDTA Chelating Agent',
        quantityRequired: 0.3,
        unit: 'kg',
      },
      {
        materialId: materialIds.nacl,
        materialName: 'Sodium Chloride (Industrial Refined NaCl)',
        quantityRequired: 2.2,
        unit: 'kg',
      },
      {
        materialId: materialIds.scent_lavender,
        materialName: 'Micro-Encapsulated Velvet Lavender Scent',
        quantityRequired: 0.45,
        unit: 'L',
      },
      {
        materialId: materialIds.jug_2l,
        materialName: 'HDPE 2L Heavy-Duty Handle Jug',
        quantityRequired: 50,
        unit: 'pcs',
      },
    ]
  );

  // 4. Seed Sample Production Batches
  const sampleBatches = [
    {
      formulaId: dishFormulaId,
      formulaName: 'Citrus Shield Liquid Dishwashing (1L)',
      productCategory: 'Liquid Dishwashing' as ProductCategory,
      batchCode: 'LOT-2026-D101',
      batchMultiplier: 2,
      unitsProduced: 200,
      unitLabel: '1L Bottle',
      rawMaterialCost: 158.97,
      laborCost: 44,
      overheadCost: 24,
      totalProductionCost: 226.97,
      costPerUnit: 1.13,
      sellingPricePerUnit: 2.85,
      projectedRevenue: 570,
      projectedProfit: 343.03,
      profitMarginPercent: 60.2,
      status: 'completed' as BatchStatus,
      notes: 'QC Passed: pH 7.15, Viscosity 520 cPs, crystal clear yellow appearance.',
    },
    {
      formulaId: fabconFormulaId,
      formulaName: 'Velvet Cloud Fabric Conditioner (1L)',
      productCategory: 'Fabric Conditioner' as ProductCategory,
      batchCode: 'LOT-2026-F102',
      batchMultiplier: 1.5,
      unitsProduced: 150,
      unitLabel: '1L Bottle',
      rawMaterialCost: 110.22,
      laborCost: 27,
      overheadCost: 16.5,
      totalProductionCost: 153.72,
      costPerUnit: 1.02,
      sellingPricePerUnit: 3.2,
      projectedRevenue: 480,
      projectedProfit: 326.28,
      profitMarginPercent: 68.0,
      status: 'completed' as BatchStatus,
      notes: 'QC Passed: Homogeneous pearlescent dispersion, dispersion stability verified.',
    },
    {
      formulaId: detergentFormulaId,
      formulaName: 'OxyCleanse Heavy-Duty Liquid Detergent (2L)',
      productCategory: 'Liquid Detergent' as ProductCategory,
      batchCode: 'LOT-2026-L103',
      batchMultiplier: 1,
      unitsProduced: 50,
      unitLabel: '2L Jug',
      rawMaterialCost: 94.13,
      laborCost: 25,
      overheadCost: 15,
      totalProductionCost: 134.13,
      costPerUnit: 2.68,
      sellingPricePerUnit: 6.5,
      projectedRevenue: 325,
      projectedProfit: 190.87,
      profitMarginPercent: 58.7,
      status: 'in_progress' as BatchStatus,
      notes: 'Currently in Tank B deaeration phase prior to 2L jug filling.',
    },
  ];

  for (const b of sampleBatches) {
    const batchRef = doc(collection(db, 'productionBatches'));
    await setDoc(batchRef, {
      ownerId,
      ...b,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 5. Seed Sample Customer Sales
  const sampleSales = [
    {
      formulaId: dishFormulaId,
      formulaName: 'Citrus Shield Liquid Dishwashing (1L)',
      productCategory: 'Liquid Dishwashing',
      customerName: 'Sunrise Mini-Mart (Wholesale Order)',
      quantitySold: 40,
      unitLabel: '1L Bottle',
      sellingPricePerUnit: 2.85,
      costPerUnit: 1.13,
      totalRevenue: 114.0,
      totalCost: 45.2,
      totalProfit: 68.8,
      notes: 'Paid in full via bank transfer · Delivered 2 boxes',
    },
    {
      formulaId: fabconFormulaId,
      formulaName: 'Velvet Cloud Fabric Conditioner (1L)',
      productCategory: 'Fabric Conditioner',
      customerName: 'FreshSpin Laundry Shop',
      quantitySold: 25,
      unitLabel: '1L Bottle',
      sellingPricePerUnit: 3.2,
      costPerUnit: 1.02,
      totalRevenue: 80.0,
      totalCost: 25.5,
      totalProfit: 54.5,
      notes: 'Regular weekly laundry shop restock',
    },
  ];

  for (const s of sampleSales) {
    const saleRef = doc(collection(db, 'productSales'));
    await setDoc(saleRef, {
      ownerId,
      ...s,
      createdAt: serverTimestamp(),
    });
  }
}

export async function clearAllWorkspaceData(ownerId: string): Promise<void> {
  const collectionsToClear = [
    'productSales',
    'productionBatches',
    'formulaIngredients',
    'formulas',
    'purchaseOrders',
    'rawMaterials',
  ] as const;

  for (const colName of collectionsToClear) {
    try {
      const q = query(collection(db, colName), where('ownerId', '==', ownerId));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, colName, docSnap.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colName);
    }
  }
}
