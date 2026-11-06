import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  Droplets,
  FlaskConical,
  HelpCircle,
  Package,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { Formula, ProductionBatch, RawMaterial } from '../types/domain';
import { seedSampleManufacturingData } from '../services/firestoreService';

interface HelpGuideViewProps {
  ownerId: string | null;
  materials: RawMaterial[];
  formulas: Formula[];
  batches: ProductionBatch[];
  onNavigate: (
    tab: 'overview' | 'materials' | 'formulas' | 'batches' | 'simulator' | 'reports' | 'help'
  ) => void;
  onRequestLogin?: () => void;
}

export const HelpGuideView: React.FC<HelpGuideViewProps> = ({
  ownerId,
  materials,
  formulas,
  batches,
  onNavigate,
  onRequestLogin,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [activeDiagramTab, setActiveDiagramTab] = useState<'full_flow' | 'refill_split'>('full_flow');

  const handleLoadSample = async () => {
    if (!ownerId) {
      if (onRequestLogin) onRequestLogin();
      return;
    }
    setSeeding(true);
    setSeedMessage(null);
    try {
      await seedSampleManufacturingData(ownerId);
      setSeedMessage(
        'Sample data loaded! You now have sample raw materials, 3 product recipes, and sample batches to explore.'
      );
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Could not load sample data.');
    } finally {
      setSeeding(false);
    }
  };

  const hasMaterials = materials.length > 0;
  const hasFormulas = formulas.length > 0;
  const hasBatches = batches.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-semibold text-teal-800">
            Plain-English Beginner Guide (Zero Accounting Jargon)
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            How This App Works in 3 Simple Steps
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
            If you have never used a manufacturing or inventory app before, don&rsquo;t worry. Think of this app just like <strong>baking cookies in a kitchen to sell in boxes</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[38px] px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
          <button
            type="button"
            disabled={seeding}
            onClick={handleLoadSample}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <Database className="w-4 h-4" />
            {ownerId
              ? seeding
                ? 'Loading Practice Data...'
                : 'Load Practice Data to Play With'
              : 'Sign In to Try Practice Data'}
          </button>
        </div>
      </div>

      {seedMessage && (
        <div className="p-4 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between gap-4">
          <span>{seedMessage}</span>
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="px-3 py-1.5 bg-teal-700 text-white rounded-md font-semibold whitespace-nowrap cursor-pointer"
          >
            See Dashboard →
          </button>
        </div>
      )}

      {/* Visual Process Flow Diagram Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <span className="text-xs font-bold text-teal-800">
              VISUAL PROCESS FLOWCHART
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              How Inventory, Mixing, Refills &amp; Sales Connect Automatically
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Follow the arrows below to see what happens to your stock and money at every stage. Click any box to jump straight to that screen.
            </p>
          </div>

          {/* Diagram Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveDiagramTab('full_flow')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeDiagramTab === 'full_flow'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Full Business Flow (4 Steps)
            </button>
            <button
              type="button"
              onClick={() => setActiveDiagramTab('refill_split')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeDiagramTab === 'refill_split'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Bottled vs. Refill Split Diagram
            </button>
          </div>
        </div>

        {activeDiagramTab === 'full_flow' ? (
          <div className="space-y-5">
            {/* 4-Node Horizontal (Desktop) / Vertical (Mobile) Pipeline Diagram */}
            <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
              {/* Node 1: Raw Materials */}
              <div
                onClick={() => onNavigate('materials')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigate('materials');
                }}
                className="lg:col-span-2 bg-slate-50 hover:bg-teal-50/40 border border-slate-200 hover:border-teal-600 rounded-lg p-4 flex flex-col justify-between transition-colors cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      STAGE 01
                    </span>
                    <Package className="w-4 h-4 text-teal-700" />
                  </div>
                  <div className="font-bold text-sm text-slate-900 group-hover:text-teal-900">
                    1. Supplies Shelf
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Buy bulk chemicals (kg/L) and empty bottles (pcs) from suppliers.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 font-mono text-[11px] space-y-1">
                  <div className="text-emerald-700 font-semibold">+ Stock Added to Shelf</div>
                  <div className="text-slate-500">Auto-updates avg ₱/unit</div>
                </div>
              </div>

              {/* Arrow 1 -> 2 */}
              <div className="flex lg:flex-col items-center justify-center py-1 lg:py-0 text-slate-400">
                <ArrowRight className="hidden lg:block w-5 h-5 text-teal-700" />
                <ArrowDown className="lg:hidden w-5 h-5 text-teal-700" />
                <span className="text-[10px] font-mono text-slate-500 ml-1.5 lg:ml-0 lg:mt-1 text-center">
                  Prices feed into
                </span>
              </div>

              {/* Node 2: Product Recipes */}
              <div
                onClick={() => onNavigate('formulas')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigate('formulas');
                }}
                className="lg:col-span-2 bg-slate-50 hover:bg-teal-50/40 border border-slate-200 hover:border-teal-600 rounded-lg p-4 flex flex-col justify-between transition-colors cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      STAGE 02
                    </span>
                    <FlaskConical className="w-4 h-4 text-teal-700" />
                  </div>
                  <div className="font-bold text-sm text-slate-900 group-hover:text-teal-900">
                    2. Product Recipe
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    List how much of each supply makes 1 Batch (e.g. 100L) + worker pay.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 font-mono text-[11px] space-y-1">
                  <div className="text-slate-800 font-semibold">Bottled: ₱1.13/L</div>
                  <div className="text-teal-800 font-semibold">Refill: ₱0.85/L</div>
                </div>
              </div>

              {/* Arrow 2 -> 3 */}
              <div className="flex lg:flex-col items-center justify-center py-1 lg:py-0 text-slate-400">
                <ArrowRight className="hidden lg:block w-5 h-5 text-teal-700" />
                <ArrowDown className="lg:hidden w-5 h-5 text-teal-700" />
                <span className="text-[10px] font-mono text-slate-500 ml-1.5 lg:ml-0 lg:mt-1 text-center">
                  Click Make Batch
                </span>
              </div>

              {/* Node 3: Mix Batch & Bottling */}
              <div
                onClick={() => onNavigate('batches')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigate('batches');
                }}
                className="lg:col-span-2 bg-slate-50 hover:bg-teal-50/40 border border-slate-200 hover:border-teal-600 rounded-lg p-4 flex flex-col justify-between transition-colors cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-teal-800">
                      STAGE 03
                    </span>
                    <ClipboardList className="w-4 h-4 text-teal-700" />
                  </div>
                  <div className="font-bold text-sm text-slate-900 group-hover:text-teal-900">
                    3. Mix a Batch (+)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Pour ingredients &amp; bottle into 500mL, 1L, 1.5L, 1-Gal, or leave in Refill Drum.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 font-mono text-[11px] space-y-1">
                  <div className="text-amber-800 font-semibold">- Deducts Raw Supplies</div>
                  <div className="text-emerald-700 font-semibold">+ Adds Ready Product</div>
                </div>
              </div>

              {/* Arrow 3 -> 4 */}
              <div className="flex lg:flex-col items-center justify-center py-1 lg:py-0 text-slate-400">
                <ArrowRight className="hidden lg:block w-5 h-5 text-teal-700" />
                <ArrowDown className="lg:hidden w-5 h-5 text-teal-700" />
                <span className="text-[10px] font-mono text-slate-500 ml-1.5 lg:ml-0 lg:mt-1 text-center">
                  Customer buys
                </span>
              </div>

              {/* Node 4: Record Customer Sales & Profit */}
              <div
                onClick={() => onNavigate('batches')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigate('batches');
                }}
                className="lg:col-span-2 bg-teal-50/50 hover:bg-teal-50 border border-teal-300 hover:border-teal-600 rounded-lg p-4 flex flex-col justify-between transition-colors cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-teal-900">
                      STAGE 04
                    </span>
                    <ShoppingBag className="w-4 h-4 text-teal-800" />
                  </div>
                  <div className="font-bold text-sm text-slate-900 group-hover:text-teal-950">
                    4. Record Sale (-)
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Sell sealed bottles OR refill customer containers with custom bulk discounts.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-teal-200 font-mono text-[11px] space-y-1">
                  <div className="text-amber-800 font-semibold">- Deducts Liters Sold</div>
                  <div className="text-teal-900 font-bold">+ Logs Cash &amp; Profit (₱)</div>
                </div>
              </div>
            </div>

            {/* Automatic Behind-the-Scenes Ledger Summary Strip */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
                <span className="text-slate-700">
                  <strong>Why this saves you hours:</strong> Every step above is stamped with the <strong>Date &amp; Time</strong>. You never need a calculator to figure out how many chemicals are left or how much profit you earned today.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveDiagramTab('refill_split')}
                className="text-xs font-semibold text-teal-800 hover:text-teal-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                See How Bottled vs. Refill Works →
              </button>
            </div>
          </div>
        ) : (
          /* Diagram 2: Visual Bottled vs. Refill Split Flowchart */
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-50 p-4 sm:p-5 rounded-lg border border-slate-200">
              {/* Left Column: The Mixing Tank */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-teal-800">
                    MIXING TANK (1 BATCH)
                  </span>
                  <FlaskConical className="w-4 h-4 text-teal-700" />
                </div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  100 Liters Mixed Liquid
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You pour raw chemicals + water into your drum. The liquid itself costs <strong>₱0.85 per Liter</strong> to make.
                </p>
                <div className="pt-2 border-t border-slate-100 font-mono text-[11px] text-slate-500">
                  Raw Chemicals Subtracted: <strong className="text-slate-800">100% Done</strong>
                </div>
              </div>

              {/* Center Split Arrows */}
              <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-2 text-teal-700 py-1">
                <ArrowRight className="hidden lg:block w-6 h-6" />
                <ArrowDown className="lg:hidden w-6 h-6" />
                <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">
                  Splits Into
                </span>
              </div>

              {/* Right Column: Two Paths (Bottled vs Refill Drum) */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Path A: Sealed Bottles */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-700">
                      PATH A · SEALED BOTTLES
                    </span>
                    <Package className="w-4 h-4 text-slate-700" />
                  </div>
                  <div className="font-bold text-sm text-slate-900">
                    Multi-Size Bottled Stock (e.g. 60L)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Fill into <strong>500mL, 1L, 1.5L, or 1-Gal</strong> bottles. App deducts only the bottles you actually used!
                  </p>
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cost (Liquid + Bottle):</span>
                      <strong className="text-slate-900">₱1.13 / L</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sell Price:</span>
                      <strong className="text-slate-900">₱2.85 / L</strong>
                    </div>
                    <div className="flex justify-between text-teal-800 font-bold pt-1 border-t border-slate-200">
                      <span>Your Profit:</span>
                      <span>+₱1.72 / L</span>
                    </div>
                  </div>
                </div>

                {/* Path B: Bulk Refill Station */}
                <div className="bg-teal-50/40 border border-teal-300 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-teal-900">
                      PATH B · REFILL DRUM (NO BOTTLE)
                    </span>
                    <Droplets className="w-4 h-4 text-teal-700" />
                  </div>
                  <div className="font-bold text-sm text-slate-900">
                    Customer Brings Jug (e.g. 40L)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Customer brings <strong>1.5L bottle, 1-Gal jug, or any size</strong>. Zero empty bottles wasted from your shelf!
                  </p>
                  <div className="p-2.5 bg-white rounded border border-teal-200 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Liquid-Only Cost:</span>
                      <strong className="text-teal-900">₱0.85 / L (Saves ₱0.28!)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Refill Price:</span>
                      <strong className="text-slate-900">₱2.57 / L (or custom)</strong>
                    </div>
                    <div className="flex justify-between text-teal-800 font-bold pt-1 border-t border-slate-100">
                      <span>Your Profit:</span>
                      <span>+₱1.72 / L</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 1: The 3-Step Story */}
      <div className="space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-900">
          1. The Big Picture: What Does This App Actually Do?
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
          When you make a product (like Dishwashing Liquid, Soap, Candles, or Baked Goods), you buy <strong>bulk raw materials</strong> (in kilograms, liters, or pieces) and combine them into <strong>finished products</strong> to sell. Many small businesses lose money because they guess how much one bottle costs to make. This app does all the math for you in 3 steps:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Step 1 Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800">
                  STEP 1 · YOUR PANTRY
                </span>
                <Package className="w-5 h-5 text-teal-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Enter What You Buy (Raw Materials)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Go to <strong>Raw Materials</strong> and list every ingredient and empty bottle/container you buy from suppliers, along with how much you have and what it costs per kg, liter, or piece.
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
                <div className="font-semibold text-slate-800">Real-Life Example:</div>
                <div className="text-slate-600">• SLES Soap Base: <strong>200 kg</strong> @ <strong>₱2.35/kg</strong></div>
                <div className="text-slate-600">• Lemon Scent: <strong>15 L</strong> @ <strong>₱18.50/L</strong></div>
                <div className="text-slate-600">• Empty 1L Bottles: <strong>1,000 pcs</strong> @ <strong>₱0.28/pc</strong></div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('materials')}
              className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              Open Step 1: Raw Materials
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step 2 Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800">
                  STEP 2 · YOUR RECIPE BOOK
                </span>
                <FlaskConical className="w-5 h-5 text-teal-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Create a Recipe (Formulations)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Go to <strong>Formulations</strong> and create a recipe for a product you sell. Tell the app how many finished units <strong>1 Batch</strong> makes (e.g., 100 bottles) and which raw materials go into that batch.
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
                <div className="font-semibold text-slate-800">What the App Calculates Automatically:</div>
                <div className="text-slate-600">• Adds up all ingredients + bottles (₱78.83)</div>
                <div className="text-slate-600">• Adds your worker labor &amp; electricity (₱34.00)</div>
                <div className="text-slate-600">• Divides by 100 bottles = <strong>₱1.13 cost per bottle!</strong></div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('formulas')}
              className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              Open Step 2: Formulations
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step 3 Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800">
                  STEP 3 · MIXING DAY
                </span>
                <ClipboardList className="w-5 h-5 text-teal-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Produce a Batch (Batch Production)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Whenever you actually make a batch in your workshop, go to <strong>Batch Production</strong> and click <strong>&ldquo;Run Production Batch&rdquo;</strong>. You don&rsquo;t have to subtract inventory by hand!
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
                <div className="font-semibold text-slate-800">What Happens When You Click Run:</div>
                <div className="text-slate-600">• Automatically subtracts the kg/L/bottles used</div>
                <div className="text-slate-600">• Adds +100 finished bottles to your stock</div>
                <div className="text-slate-600">• Records your exact profit (+₱172.00) for that batch</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('batches')}
              className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              Open Step 3: Batch Production
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Interactive Live Checklist for the Current User */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              2. Your Personal Getting-Started Checklist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Follow these 4 steps in order—or click &ldquo;Load Practice Data&rdquo; at the top of this page to see everything filled in automatically.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-200 text-xs sm:text-sm">
          <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  hasMaterials ? 'text-emerald-600' : 'text-slate-300'
                }`}
              />
              <div>
                <div className="font-semibold text-slate-900">
                  Task 1: Add your Raw Materials &amp; Packaging{' '}
                  {hasMaterials && (
                    <span className="text-xs font-normal text-emerald-700">
                      (Done — {materials.length} items in stock)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add the raw ingredients, chemicals, scents, and empty bottles/jars you buy.When you run low later, click <strong>&ldquo;Buy Stock&rdquo;</strong> on any item.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('materials')}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Go to Raw Materials →
            </button>
          </div>

          <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  hasFormulas ? 'text-emerald-600' : 'text-slate-300'
                }`}
              />
              <div>
                <div className="font-semibold text-slate-900">
                  Task 2: Build a Product Recipe in Formulations{' '}
                  {hasFormulas && (
                    <span className="text-xs font-normal text-emerald-700">
                      (Done — {formulas.length} formulas created)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick a product name, set how many units 1 batch makes, enter your selling price, and add the ingredients from your Raw Materials list.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('formulas')}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Go to Formulations →
            </button>
          </div>

          <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  hasBatches ? 'text-emerald-600' : 'text-slate-300'
                }`}
              />
              <div>
                <div className="font-semibold text-slate-900">
                  Task 3: Make a Batch &amp; Track Your Finished Product Stock{' '}
                  {hasBatches && (
                    <span className="text-xs font-normal text-emerald-700">
                      (Done — {batches.length} batches logged)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click <strong>&ldquo;Make More (+)&rdquo;</strong> when you mix a batch (adds finished bottles to your shelf), and click <strong>&ldquo;Record Sale (-)&rdquo;</strong> when a customer buys from you!
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('batches')}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Go to Stock &amp; Batches →
            </button>
          </div>

          <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Calculator className="w-5 h-5 shrink-0 mt-0.5 text-teal-700" />
              <div>
                <div className="font-semibold text-slate-900">
                  Task 4: Test &ldquo;What-If&rdquo; Prices in the Margin Simulator
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Use the sliders to see what happens to your profit if raw material prices go up or if you give a wholesale discount to resellers.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Margin Simulator →
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: Visual Math Walkthrough */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            3. Visual Example: How the Profit Math Works Behind the Scenes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Suppose you want to make <strong>100 Bottles of Lemon Dishwashing Liquid (1 Liter each)</strong>. Here is how the app calculates your profit:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-sans font-bold text-slate-900">
              A. Ingredients + Bottles Cost
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">11 kg SLES (₱2.35/kg)</span>
              <span>₱25.85</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">3.5 kg LABSA (₱2.80/kg)</span>
              <span>₱9.80</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Foam Booster, Salt &amp; Scent</span>
              <span>₱15.18</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">100 Empty 1L Bottles (₱0.28)</span>
              <span>₱28.00</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
              <span className="font-sans">Total Raw Materials:</span>
              <span>₱78.83</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-sans font-bold text-slate-900">
              B. All-In Cost for 1 Bottle
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Raw Materials (from Box A)</span>
              <span>₱78.83</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Worker Mixing Labor</span>
              <span>+₱22.00</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Electricity &amp; Water (Overhead)</span>
              <span>+₱12.00</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between text-slate-900">
              <span className="font-sans font-semibold">Cost for 100 Bottles:</span>
              <span className="font-bold">₱112.83</span>
            </div>
            <div className="flex justify-between font-bold text-teal-800">
              <span className="font-sans">Cost for 1 Bottle (₱112.83 ÷ 100):</span>
              <span>₱1.13 / bottle</span>
            </div>
          </div>

          <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-lg space-y-2">
            <div className="font-sans font-bold text-slate-900">
              C. Your Profit &amp; Margin
            </div>
            <div className="flex justify-between text-slate-700">
              <span className="font-sans">Your Selling Price:</span>
              <span className="font-bold">₱2.85 / bottle</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span className="font-sans">Minus Cost to Make:</span>
              <span>-₱1.13 / bottle</span>
            </div>
            <div className="pt-2 border-t border-teal-200 flex justify-between font-bold text-teal-900">
              <span className="font-sans">Take-Home Profit / Bottle:</span>
              <span>+₱1.72</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-700">
              <span className="font-sans">Profit for 100 Bottles:</span>
              <span>+₱172.00 (60.4%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Plain-English Glossary / FAQ */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
          <HelpCircle className="w-5 h-5 text-teal-700 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              4. Common Questions &amp; Plain-English Dictionary
            </h2>
            <p className="text-xs text-slate-500">
              Every term in the app explained simply
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              Where is my Finished Product Inventory (bottles ready to sell)?
            </h3>
            <p className="text-slate-600">
              Go to <strong>3. Stock &amp; Batches</strong> (or look at the <strong>Dashboard</strong>). Whenever you finish making a batch, those bottles are automatically added to your <strong>Ready to Sell on Shelf</strong> count. When a customer buys from you, click <strong>&ldquo;Record Sale (-)&rdquo;</strong> to subtract sold bottles and see your profit!
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              What if I counted my finished bottles by hand and the number is off?
            </h3>
            <p className="text-slate-600">
              In <strong>3. Stock &amp; Batches</strong>, click the edit icon (or click <strong>&ldquo;Record Sale (-)&rdquo;</strong> and switch to the <strong>&ldquo;Fix Exact Shelf Count&rdquo;</strong> tab) to type the exact number of finished items sitting on your shelf right now.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              What happens when I click &ldquo;Buy More (+)&rdquo; on a Raw Supply?
            </h3>
            <p className="text-slate-600">
              Use <strong>Buy More (+)</strong> in <strong>1. Supplies</strong> whenever a supplier delivers new raw ingredients or empty bottles. It adds the new quantity to your shelf AND automatically averages the old price and new price so your recipes stay 100% accurate.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              What does &ldquo;Batch Size (1x, 2x, Half)&rdquo; mean?
            </h3>
            <p className="text-slate-600">
              If your normal recipe makes <strong>100 bottles (1x)</strong>, choosing <strong>2x</strong> means you are making a double batch (200 bottles) today. Choosing <strong>Half (0.5x)</strong> means you are making a half batch (50 bottles).
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              What is the difference between &ldquo;Finished&rdquo; and &ldquo;Mixing Now&rdquo; batches?
            </h3>
            <p className="text-slate-600">
              Both immediately subtract the raw supplies you poured into the mixing tank. <strong>Finished</strong> immediately adds the new bottles to your Ready-to-Sell shelf stock, while <strong>Mixing Now</strong> waits until you click <strong>&ldquo;Mark Finished&rdquo;</strong> after mixing/curing is done.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              How do I handle refills when customers bring different container sizes (1.5L, 1 Gallon, etc.)?
            </h3>
            <p className="text-slate-600">
              When a customer brings their own container, click <strong>&ldquo;Record Sale (-)&rdquo;</strong> and choose <strong>Refill Only (Customer Brought Bottle)</strong>. Pick their container size (<strong>500 mL, 1L, 1.5L, 1 Gallon, or Custom Liters</strong>). The app removes the bottle cost from your expenses, calculates the exact liquid used, and lets you give <strong>any flexible discount</strong> (custom ₱ off, % off, or type the agreed cash total).
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              Can I fill a single batch into different bottle sizes (e.g. 500mL, 1L, 1.5L, 1 Gallon)?
            </h3>
            <p className="text-slate-600">
              Yes! In <strong>Make a Batch (+)</strong>, look at <strong>Step 5: Multi-Bottle Size Bottling Plan</strong>. You can enter how many 500mL bottles, 1L bottles, 1.5L bottles, or 1-gallon jugs you fill from that batch. Whatever liquid is left automatically stays in your bulk drum for customer refills!
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              How do I print a price cheat sheet for my counter or cashiers?
            </h3>
            <p className="text-slate-600">
              Click the <strong>&ldquo;Price &amp; Refill Sheet&rdquo;</strong> button in the top navigation bar (or in the Recipes tab). It creates an instant printable price card showing bottled prices, refill prices for all container sizes (500mL, 1L, 1.5L, 1 Gal, 5 Gal), bulk discounts, and includes a live volume converter.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              How do I export my sales and inventory into Excel or Google Sheets?
            </h3>
            <p className="text-slate-600">
              In <strong>3. Stock &amp; Sales</strong>, click <strong>&ldquo;Export Sales CSV&rdquo;</strong> to download your full sales ledger with dates, customers, profit, and container types. In <strong>1. Supplies</strong>, click <strong>&ldquo;Export CSV&rdquo;</strong> to download your current shelf stock and inventory value.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">
              Can I use this for products other than Dishwashing Soap?
            </h3>
            <p className="text-slate-600">
              Yes! Click <strong>&ldquo;Edit Title &amp; Industry&rdquo;</strong> on the Dashboard to rename the app for Cosmetics, Food &amp; Bakery, Candles, Soaps, or any custom business.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
