# FormuLab Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Global Default-Deny & Verified Identity**:
   - All unlisted paths default to `allow read, write: if false;`.
   - Every write operation (`create`, `update`, `delete`) across all collections requires an authenticated user with a verified email (`request.auth != null && request.auth.token.email_verified == true`).
2. **Tenant Isolation & No Blanket Reads**:
   - Every document in `/rawMaterials`, `/purchaseOrders`, `/formulas`, `/formulaIngredients`, `/productionBatches`, and `/productSales` contains an `ownerId` field that must strictly match `request.auth.uid`.
   - `allow get` and `allow list` strictly evaluate `resource.data.ownerId == request.auth.uid`. Blanket `isSignedIn()` reads are forbidden.
3. **Path Variable Hardening (ID Poisoning Guard)**:
   - All single-document operations (`get`, `create`, `update`, `delete`) validate document ID path variables with `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Relational Integrity (Master Gate & Global Consistency Invariant)**:
   - A `PurchaseOrder` cannot be created unless `/rawMaterials/$(incoming().materialId)` exists and its `ownerId == request.auth.uid`.
   - A `FormulaIngredient` cannot be created unless both `/formulas/$(incoming().formulaId)` and `/rawMaterials/$(incoming().materialId)` exist and belong to `request.auth.uid`.
   - A `ProductionBatch` cannot be created unless `/formulas/$(incoming().formulaId)` exists and belongs to `request.auth.uid`.
   - A `ProductSale` cannot be created unless `/formulas/$(incoming().formulaId)` exists and belongs to `request.auth.uid`.
5. **Immutability & Temporal Integrity**:
   - `ownerId` and `createdAt` are immutable across all collections (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
   - On `create`, `createdAt == request.time` (and `updatedAt == request.time` where present).
   - On `update`, `updatedAt == request.time`.
   - `PurchaseOrder` and `ProductSale` records are strictly append-only financial audit ledgers (`allow update: if false;`).
6. **Terminal State Locking**:
   - In `/productionBatches/{batchId}`, once `existing().status` reaches a terminal value (`'completed'` or `'cancelled'`), all subsequent updates are denied (`existing().status == 'in_progress'`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Identity Spoofing on RawMaterial Create**:
   - Collection: `/rawMaterials/mat_01`
   - Attack: Authenticated user `uid_attacker` submits `ownerId: "uid_victim"`.
   - Expected Result: `PERMISSION_DENIED` (`data.ownerId == request.auth.uid` fails).
2. **Payload 2 — Unverified Email Spoof Attack**:
   - Collection: `/rawMaterials/mat_02`
   - Attack: User with `email_verified: false` attempts to create a valid `RawMaterial`.
   - Expected Result: `PERMISSION_DENIED` (`isVerifiedUser()` fails).
3. **Payload 3 — Shadow Field Injection on RawMaterial Create**:
   - Collection: `/rawMaterials/mat_03`
   - Attack: Includes all valid fields plus an undeclared ghost property `"isApproved": true`.
   - Expected Result: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` fails).
4. **Payload 4 — Update-Gap Value Poisoning on RawMaterial Update**:
   - Collection: `/rawMaterials/mat_01`
   - Attack: Updates whitelisted key `stockQuantity` with a negative number (`-50`) or string `"1000"`.
   - Expected Result: `PERMISSION_DENIED` (`isValidRawMaterial(incoming())` wraps the update block and rejects negative/non-numeric stock).
5. **Payload 5 — ID Poisoning / Resource Exhaustion**:
   - Collection: `/rawMaterials/invalid$id!with*spaces`
   - Attack: Document ID contains illegal characters outside `^[a-zA-Z0-9_\-]+$`.
   - Expected Result: `PERMISSION_DENIED` (`isValidId(materialId)` fails).
6. **Payload 6 — Cross-Tenant Orphaned PurchaseOrder Create**:
   - Collection: `/purchaseOrders/po_01`
   - Attack: References a `materialId` that either does not exist or belongs to another user.
   - Expected Result: `PERMISSION_DENIED` (`exists(...) && get(...).data.ownerId == request.auth.uid` fails).
7. **Payload 7 — Immutable Ledger Tampering on PurchaseOrder Update**:
   - Collection: `/purchaseOrders/po_01`
   - Attack: Owner tries to modify `totalCost` after creation.
   - Expected Result: `PERMISSION_DENIED` (`allow update: if false`).
8. **Payload 8 — Cross-Tenant FormulaIngredient Linking**:
   - Collection: `/formulaIngredients/ing_01`
   - Attack: Attacker tries to attach an ingredient to a `formulaId` owned by another user.
   - Expected Result: `PERMISSION_DENIED` (Relational parent ownership check fails).
9. **Payload 9 — Immortal Field Mutation on Formula Update**:
   - Collection: `/formulas/form_01`
   - Attack: Owner attempts to mutate `createdAt` or transfer `ownerId` during an update.
   - Expected Result: `PERMISSION_DENIED` (`affectedKeys().hasOnly(...)` and immutability guards fail).
10. **Payload 10 — Terminal State Bypass on ProductionBatch Update**:
    - Collection: `/productionBatches/batch_01`
    - Attack: Owner attempts to change `status` or `notes` on a batch whose `existing().status` is already `'completed'`.
    - Expected Result: `PERMISSION_DENIED` (`existing().status == 'in_progress'` terminal state lock fails).
11. **Payload 11 — Client Timestamp Forgery**:
    - Collection: `/formulas/form_02`
    - Attack: Client supplies a backdated or future `createdAt` timestamp not equal to `request.time`.
    - Expected Result: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).
12. **Payload 12 — Unauthorized List Scraping**:
    - Collection: `/productionBatches`
    - Attack: Authenticated user queries `/productionBatches` without filtering by `where('ownerId', '==', request.auth.uid)`.
    - Expected Result: `PERMISSION_DENIED` (`allow list` enforces `resource.data.ownerId == request.auth.uid`).
