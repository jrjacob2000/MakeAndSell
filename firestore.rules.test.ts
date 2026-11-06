/**
 * Phase 0 Test Runner for Firestore Security Rules ("Dirty Dozen" Verification)
 * Verifies that all 12 adversarial payloads specified in security_spec.md return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on RawMaterial Create',
    collection: 'rawMaterials',
    docId: 'mat_01',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_victim',
      name: 'SLES 70%',
      sku: 'CHEM-SLES-70',
      category: 'Surfactant',
      unit: 'kg',
      stockQuantity: 100,
      reorderPoint: 20,
      costPerUnit: 2.5,
      supplierName: 'ChemCorp',
      notes: 'Standard surfactant'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Unverified Email Spoof Attack',
    collection: 'rawMaterials',
    docId: 'mat_02',
    operation: 'create',
    auth: { uid: 'uid_unverified', email: 'unverified@example.com', email_verified: false },
    payload: {
      ownerId: 'uid_unverified',
      name: 'LABSA 96%',
      sku: 'CHEM-LABSA-96',
      category: 'Surfactant',
      unit: 'kg',
      stockQuantity: 50,
      reorderPoint: 10,
      costPerUnit: 3.1,
      supplierName: 'ChemCorp',
      notes: ''
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Shadow Field Injection on RawMaterial Create',
    collection: 'rawMaterials',
    docId: 'mat_03',
    operation: 'create',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_owner',
      name: 'Citric Acid',
      sku: 'CHEM-CITRIC',
      category: 'Builder & Buffer',
      unit: 'kg',
      stockQuantity: 25,
      reorderPoint: 5,
      costPerUnit: 1.8,
      supplierName: 'BioSupply',
      notes: '',
      isApproved: true
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Update-Gap Value Poisoning on RawMaterial Update',
    collection: 'rawMaterials',
    docId: 'mat_01',
    operation: 'update',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      stockQuantity: -500
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'ID Poisoning / Resource Exhaustion',
    collection: 'rawMaterials',
    docId: 'invalid$id!with*spaces',
    operation: 'create',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_owner',
      name: 'Sodium Chloride',
      sku: 'CHEM-NACL',
      category: 'Thickener & Salt',
      unit: 'kg',
      stockQuantity: 100,
      reorderPoint: 20,
      costPerUnit: 0.4,
      supplierName: 'SaltWorks',
      notes: ''
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Cross-Tenant Orphaned PurchaseOrder Create',
    collection: 'purchaseOrders',
    docId: 'po_01',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_attacker',
      materialId: 'non_existent_or_victim_mat',
      materialName: 'SLES 70%',
      supplierName: 'ChemCorp',
      quantityPurchased: 50,
      unit: 'kg',
      unitCost: 2.4,
      totalCost: 120,
      batchReference: 'INV-2026-001'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Immutable Ledger Tampering on PurchaseOrder Update',
    collection: 'purchaseOrders',
    docId: 'po_01',
    operation: 'update',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      totalCost: 1
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Cross-Tenant FormulaIngredient Linking',
    collection: 'formulaIngredients',
    docId: 'ing_01',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_attacker',
      formulaId: 'victim_formula_id',
      materialId: 'victim_material_id',
      materialName: 'SLES 70%',
      quantityRequired: 12,
      unit: 'kg'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Immortal Field Mutation on Formula Update',
    collection: 'formulas',
    docId: 'form_01',
    operation: 'update',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_other_user'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Terminal State Bypass on ProductionBatch Update',
    collection: 'productionBatches',
    docId: 'batch_01',
    operation: 'update',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      status: 'in_progress',
      notes: 'Attempting to reopen a completed batch'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Client Timestamp Forgery',
    collection: 'formulas',
    docId: 'form_02',
    operation: 'create',
    auth: { uid: 'uid_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_owner',
      name: 'Dish Soap',
      sku: 'FG-DISH-01',
      productCategory: 'Liquid Dishwashing',
      batchYieldUnits: 100,
      unitLabel: '1L Bottle',
      laborCostPerBatch: 25,
      overheadCostPerBatch: 15,
      sellingPricePerUnit: 3.5,
      finishedStockUnits: 0,
      targetMarginPercent: 55,
      notes: '',
      createdAt: '2020-01-01T00:00:00Z'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Unauthorized List Scraping Without Tenant Filter',
    collection: 'productionBatches',
    docId: '*',
    operation: 'list',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED'
  }
];
