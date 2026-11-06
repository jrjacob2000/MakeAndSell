/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  BarChart3,
  Beaker,
  Calculator,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Edit3,
  FlaskConical,
  LayoutDashboard,
  LogIn,
  LogOut,
  Package,
  Printer,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  logOutUser,
  OperationType,
  signInWithGoogle,
} from './lib/firebase';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  Formula,
  FormulaIngredient,
  INDUSTRY_PRESETS,
  ProductionBatch,
  ProductSale,
  PurchaseOrder,
  RawMaterial,
  WorkspaceSettings,
} from './types/domain';
import { saveWorkspaceSettings } from './services/firestoreService';
import { OverviewView } from './components/OverviewView';
import { RawMaterialsView } from './components/RawMaterialsView';
import { FormulationsView } from './components/FormulationsView';
import { BatchProductionView } from './components/BatchProductionView';
import { MarginSimulatorView } from './components/MarginSimulatorView';
import { HelpGuideView } from './components/HelpGuideView';
import { PriceGuideModal } from './components/PriceGuideModal';
import { MonthlyReportView } from './components/MonthlyReportView';

type ActiveTab = 'overview' | 'materials' | 'formulas' | 'batches' | 'simulator' | 'reports' | 'help';

const LOCAL_STORAGE_SETTINGS_KEY = 'make_and_sell_workspace_settings_v2';

const NAV_ITEMS: { id: ActiveTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'materials', label: '1. Supplies', shortLabel: 'Supplies', icon: Package },
  { id: 'formulas', label: '2. Recipes', shortLabel: 'Recipes', icon: FlaskConical },
  { id: 'batches', label: '3. Stock & Sales', shortLabel: 'Sales', icon: ClipboardList },
  { id: 'reports', label: 'Monthly Report', shortLabel: 'Reports', icon: BarChart3 },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [preselectedBatchFormulaId, setPreselectedBatchFormulaId] = useState<string | null>(null);

  // Configurable Workspace Branding & Title State
  const [workspaceSettings, setWorkspaceSettings] = useState<
    Omit<WorkspaceSettings, 'ownerId' | 'updatedAt'>
  >(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          brandName: parsed.brandName || DEFAULT_WORKSPACE_SETTINGS.brandName,
          workspaceTitle: parsed.workspaceTitle || DEFAULT_WORKSPACE_SETTINGS.workspaceTitle,
          workspaceSubtitle:
            parsed.workspaceSubtitle || DEFAULT_WORKSPACE_SETTINGS.workspaceSubtitle,
          industryLabel: parsed.industryLabel || DEFAULT_WORKSPACE_SETTINGS.industryLabel,
        };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_WORKSPACE_SETTINGS;
  });

  // Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [draftBrandName, setDraftBrandName] = useState(workspaceSettings.brandName);
  const [draftTitle, setDraftTitle] = useState(workspaceSettings.workspaceTitle);
  const [draftSubtitle, setDraftSubtitle] = useState(workspaceSettings.workspaceSubtitle);
  const [draftIndustry, setDraftIndustry] = useState(workspaceSettings.industryLabel);
  const [draftCurrencySymbol, setDraftCurrencySymbol] = useState(
    workspaceSettings.currencySymbol || '₱'
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [showExtraSettingsFields, setShowExtraSettingsFields] = useState(false);
  const [isPriceGuideModalOpen, setIsPriceGuideModalOpen] = useState(false);

  // Real-time Firestore state
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [ingredients, setIngredients] = useState<FormulaIngredient[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Keep browser document.title synced with configurable brand and title
  useEffect(() => {
    document.title = `${workspaceSettings.brandName} — ${workspaceSettings.workspaceTitle}`;
  }, [workspaceSettings.brandName, workspaceSettings.workspaceTitle]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setMaterials([]);
        setPurchaseOrders([]);
        setFormulas([]);
        setIngredients([]);
        setBatches([]);
        setSales([]);
        setDataLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Attach tenant-isolated Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !user) return;
    setDataLoading(true);

    const uid = user.uid;

    const settingsRef = doc(db, 'workspaceSettings', uid);
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as WorkspaceSettings;
          const isLegacyDefault = !data.brandName || data.brandName === 'FormuLab';
          const updated = {
            brandName: isLegacyDefault
              ? DEFAULT_WORKSPACE_SETTINGS.brandName
              : data.brandName,
            workspaceTitle:
              !data.workspaceTitle ||
              data.workspaceTitle === 'Production Inventory, Recipe Costing & Margin Ledger'
                ? DEFAULT_WORKSPACE_SETTINGS.workspaceTitle
                : data.workspaceTitle,
            workspaceSubtitle:
              !data.workspaceSubtitle ||
              data.workspaceSubtitle.startsWith('Track raw materials, packaging stock')
                ? DEFAULT_WORKSPACE_SETTINGS.workspaceSubtitle
                : data.workspaceSubtitle,
            industryLabel:
              !data.industryLabel ||
              data.industryLabel === 'Small-Batch Manufacturing & Production'
                ? DEFAULT_WORKSPACE_SETTINGS.industryLabel
                : data.industryLabel,
          };
          setWorkspaceSettings(updated);
          try {
            localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `workspaceSettings/${uid}`)
    );

    const qMaterials = query(collection(db, 'rawMaterials'), where('ownerId', '==', uid));
    const unsubMaterials = onSnapshot(
      qMaterials,
      (snap) => {
        const list: RawMaterial[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RawMaterial, 'id'>),
        }));
        setMaterials(list);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'rawMaterials')
    );

    const qPOs = query(collection(db, 'purchaseOrders'), where('ownerId', '==', uid));
    const unsubPOs = onSnapshot(
      qPOs,
      (snap) => {
        const list: PurchaseOrder[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PurchaseOrder, 'id'>),
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setPurchaseOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders')
    );

    const qFormulas = query(collection(db, 'formulas'), where('ownerId', '==', uid));
    const unsubFormulas = onSnapshot(
      qFormulas,
      (snap) => {
        const list: Formula[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Formula, 'id'>),
        }));
        setFormulas(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'formulas')
    );

    const qIngredients = query(collection(db, 'formulaIngredients'), where('ownerId', '==', uid));
    const unsubIngredients = onSnapshot(
      qIngredients,
      (snap) => {
        const list: FormulaIngredient[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FormulaIngredient, 'id'>),
        }));
        setIngredients(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'formulaIngredients')
    );

    const qBatches = query(collection(db, 'productionBatches'), where('ownerId', '==', uid));
    const unsubBatches = onSnapshot(
      qBatches,
      (snap) => {
        const list: ProductionBatch[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ProductionBatch, 'id'>),
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setBatches(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'productionBatches')
    );

    const qSales = query(collection(db, 'productSales'), where('ownerId', '==', uid));
    const unsubSales = onSnapshot(
      qSales,
      (snap) => {
        const list: ProductSale[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ProductSale, 'id'>),
          }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setSales(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'productSales')
    );

    return () => {
      unsubSettings();
      unsubMaterials();
      unsubPOs();
      unsubFormulas();
      unsubIngredients();
      unsubBatches();
      unsubSales();
    };
  }, [authReady, user]);

  const openSettingsModal = () => {
    setDraftBrandName(workspaceSettings.brandName);
    setDraftTitle(workspaceSettings.workspaceTitle);
    setDraftSubtitle(workspaceSettings.workspaceSubtitle);
    setDraftIndustry(workspaceSettings.industryLabel);
    setDraftCurrencySymbol(workspaceSettings.currencySymbol || '₱');
    setIsSettingsModalOpen(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      brandName: draftBrandName.trim() || DEFAULT_WORKSPACE_SETTINGS.brandName,
      workspaceTitle: draftTitle.trim() || DEFAULT_WORKSPACE_SETTINGS.workspaceTitle,
      workspaceSubtitle: draftSubtitle.trim() || DEFAULT_WORKSPACE_SETTINGS.workspaceSubtitle,
      industryLabel: draftIndustry.trim() || DEFAULT_WORKSPACE_SETTINGS.industryLabel,
      currencySymbol: draftCurrencySymbol.trim() || '₱',
    };

    setSavingSettings(true);
    try {
      setWorkspaceSettings(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      if (user) {
        await saveWorkspaceSettings(user.uid, updated);
      }
      setIsSettingsModalOpen(false);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    }
  };

  const handleLaunchBatchFromFormula = (formulaId: string) => {
    setPreselectedBatchFormulaId(formulaId);
    setActiveTab('batches');
  };

  // Top Bar Contract: 3 zones separated by gap-8 (1-line Brand wordmark, 4-5 concise nav links, 1 primary action)
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display truncate max-w-[180px] sm:max-w-none"
        >
          {workspaceSettings.brandName}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links (Desktop) */}
        {user && (
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {NAV_ITEMS.map((item) => {
              const isSelected =
                activeTab === item.id || (item.id === 'formulas' && activeTab === 'simulator');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                    isSelected
                      ? 'text-slate-900 border-b-2 border-teal-700 font-semibold'
                      : ''
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {user && (
            <>
              <button
                type="button"
                onClick={() => setIsPriceGuideModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Printable Refill & Product Price Guide & Quick Converter"
              >
                <Printer className="w-3.5 h-3.5 text-teal-700" />
                <span className="hidden sm:inline">Price Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('help')}
                className={`inline-flex items-center justify-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  activeTab === 'help'
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
                }`}
                title="Beginner Help Guide"
              >
                <CircleHelp className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Help</span>
              </button>
            </>
          )}

          {user ? (
            <button
              type="button"
              onClick={logOutUser}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Container (with bottom clearance for Mobile Fixed Tab Bar) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 pb-24 md:pb-8">
        {!authReady ? (
          <div className="py-20 text-center text-sm text-slate-500">
            Initializing manufacturing workspace...
          </div>
        ) : !user && activeTab === 'help' ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign-In & Welcome Page
            </button>
            <HelpGuideView
              ownerId={null}
              materials={[]}
              formulas={[]}
              batches={[]}
              onNavigate={(tab) => {
                if (tab === 'help') return;
                handleLogin();
              }}
              onRequestLogin={handleLogin}
            />
          </div>
        ) : !user ? (
          /* Unauthenticated Landing View (Responsive Mobile + Desktop) */
          <div className="py-2 sm:py-6 space-y-6 sm:space-y-10">
            {/* Beginner Help Callout Banner for New Visitors */}
            <div className="bg-teal-50/90 border border-teal-200 rounded-lg p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <CircleHelp className="w-5 h-5 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900">
                    Never used a manufacturing or inventory app before?
                  </div>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Read our plain-English Beginner Guide — we explain the whole app like baking a cake in 3 simple steps.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('help')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[36px] px-4 py-2 text-xs font-semibold text-teal-900 bg-white border border-teal-300 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CircleHelp className="w-4 h-4 text-teal-700" />
                <span>Read Beginner Help Guide</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch bg-white border border-slate-200 rounded-xl sm:rounded-lg p-5 sm:p-8 lg:p-12">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-5 sm:space-y-6">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-teal-800">
                      {workspaceSettings.industryLabel}
                    </p>
                    <span className="text-xs text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={openSettingsModal}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-teal-700 underline cursor-pointer py-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      Customize Title & Industry
                    </button>
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                    {workspaceSettings.workspaceTitle}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                    {workspaceSettings.workspaceSubtitle}
                  </p>
                </div>

                {authError && (
                  <div className="p-3.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="pt-1 space-y-3">
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={handleLogin}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign In with Google to Open Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('help')}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-3 text-sm font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <CircleHelp className="w-4 h-4 text-teal-700" />
                      How It Works (Beginner Guide)
                    </button>
                    <button
                      type="button"
                      onClick={openSettingsModal}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      Configure Title & Preset
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Optimized for both desktop spreadsheets and mobile shop-floor inventory checks.
                  </p>
                </div>
              </div>

              {/* Sample Unit Economics Preview Panel */}
              <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-5 sm:p-6 flex flex-col justify-between space-y-5">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-900">
                      Live Batch Costing & Margin Preview
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      100 Units / Batch
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between text-slate-700">
                      <span className="font-sans">Primary Base Raw Material</span>
                      <span>₱25.85</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span className="font-sans">Secondary Active Ingredient</span>
                      <span>₱16.70</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span className="font-sans">Fragrance / Flavor / Additives</span>
                      <span>₱8.28</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span className="font-sans">Bottles, Jars & Labels (100 pcs)</span>
                      <span>₱28.00</span>
                    </div>
                    <div className="flex justify-between text-slate-700 pt-2 border-t border-slate-200">
                      <span className="font-sans">Direct Labor & Facility Overhead</span>
                      <span>₱34.00</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-3 font-mono tabular-nums">
                  <div>
                    <span className="text-[11px] font-sans text-slate-500 block">
                      All-In Unit Cost
                    </span>
                    <strong className="text-base text-slate-900">₱1.13</strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-sans text-slate-500 block">
                      Selling Price
                    </span>
                    <strong className="text-base text-slate-900">₱2.85</strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-sans text-slate-500 block">
                      Gross Margin
                    </span>
                    <strong className="text-base text-emerald-700">60.4%</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Workflow Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
                <Beaker className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-semibold text-slate-900 mt-3">
                  01. Raw Material & Packaging Inventory
                </h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Monitor stock levels in kg, g, L, mL, oz, lb, or pieces. Recording a supplier purchase order automatically updates your weighted-average unit cost.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
                <FlaskConical className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-semibold text-slate-900 mt-3">
                  02. Master Formulations & Recipe Costing
                </h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Build multi-ingredient recipes for any product category with live raw material, packaging, labor, and overhead calculations.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
                <CheckCircle2 className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-semibold text-slate-900 mt-3">
                  03. Batch Execution & Margin Simulator
                </h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Run scaled batches (0.5x to 10x) that deduct raw stock, increment finished goods, and stress-test retail vs. wholesale profit margins.
                </p>
              </div>
            </div>
          </div>
        ) : dataLoading ? (
          <div className="space-y-4 py-8">
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 sm:h-28 bg-white border border-slate-200 rounded-lg p-4 sm:p-5" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {(activeTab === 'formulas' || activeTab === 'simulator') && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-2">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab('formulas')}
                    className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'formulas'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span>Product Recipes (What Goes Inside)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('simulator')}
                    className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeTab === 'simulator'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Simple Price &amp; Profit Calculator</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('help')}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 hover:underline cursor-pointer"
                >
                  <CircleHelp className="w-3.5 h-3.5" />
                  <span>Need help with recipes or pricing?</span>
                </button>
              </div>
            )}

            {activeTab === 'overview' && (
              <OverviewView
                ownerId={user.uid}
                workspaceSettings={workspaceSettings}
                onOpenSettingsModal={openSettingsModal}
                materials={materials}
                formulas={formulas}
                ingredients={ingredients}
                batches={batches}
                sales={sales}
                purchaseOrders={purchaseOrders}
                onNavigate={setActiveTab}
                onLaunchBatchModal={handleLaunchBatchFromFormula}
              />
            )}

            {activeTab === 'materials' && (
              <RawMaterialsView
                ownerId={user.uid}
                materials={materials}
                purchaseOrders={purchaseOrders}
                formulas={formulas}
                ingredients={ingredients}
                brandName={workspaceSettings.brandName}
              />
            )}

            {activeTab === 'formulas' && (
              <FormulationsView
                ownerId={user.uid}
                formulas={formulas}
                ingredients={ingredients}
                materials={materials}
                onLaunchBatchModal={handleLaunchBatchFromFormula}
                onOpenPriceGuide={() => setIsPriceGuideModalOpen(true)}
              />
            )}

            {activeTab === 'batches' && (
              <BatchProductionView
                ownerId={user.uid}
                formulas={formulas}
                ingredients={ingredients}
                materials={materials}
                batches={batches}
                sales={sales}
                preselectedFormulaId={preselectedBatchFormulaId}
                onClearPreselectedFormula={() => setPreselectedBatchFormulaId(null)}
                brandName={workspaceSettings.brandName}
              />
            )}

            {activeTab === 'simulator' && (
              <MarginSimulatorView
                formulas={formulas}
                ingredients={ingredients}
                materials={materials}
              />
            )}

            {activeTab === 'reports' && (
              <MonthlyReportView
                formulas={formulas}
                sales={sales}
                batches={batches}
                purchaseOrders={purchaseOrders}
                brandName={workspaceSettings.brandName}
              />
            )}

            {activeTab === 'help' && (
              <HelpGuideView
                ownerId={user.uid}
                materials={materials}
                formulas={formulas}
                batches={batches}
                onNavigate={setActiveTab}
              />
            )}
          </>
        )}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:flex border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span>
            {workspaceSettings.brandName} — {workspaceSettings.workspaceTitle}
          </span>
          <button
            type="button"
            onClick={openSettingsModal}
            className="text-teal-700 hover:underline font-medium cursor-pointer"
          >
            Edit Title
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className="text-teal-700 hover:underline font-medium cursor-pointer"
          >
            Beginner Help Guide
          </button>
        </div>
        {user && (
          <span>
            Signed in as <strong className="text-slate-700">{user.email}</strong>
          </span>
        )}
      </footer>

      {/* Mobile Fixed Bottom Navigation Bar (Ergonomic Thumb Zone) */}
      {user && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-14 px-1"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id || (item.id === 'formulas' && activeTab === 'simulator');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] py-1 rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'text-teal-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Customize Title & Industry Profile Modal (Bottom Sheet on Mobile, Centered Dialog on Desktop) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-lg max-w-xl w-full p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Application Title & Business Profile
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure the brand name, dashboard title, and industry description
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  1. Business / Brand Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={draftBrandName}
                  onChange={(e) => setDraftBrandName(e.target.value)}
                  placeholder="e.g., Make & Sell, PureGlow, BatchKitchen"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* Quick Industry Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  2. Quick Industry Templates (Tap to Auto-Fill)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {INDUSTRY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDraftBrandName(preset.brandName);
                        setDraftTitle(preset.workspaceTitle);
                        setDraftSubtitle(preset.workspaceSubtitle);
                        setDraftIndustry(preset.industryLabel);
                      }}
                      className="text-left p-2.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-teal-600 transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-slate-900">{preset.brandName}</div>
                      <div className="text-slate-500 truncate mt-0.5">{preset.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Details Toggle */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExtraSettingsFields((v) => !v)}
                  className="w-full py-2 px-3 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span>
                    {showExtraSettingsFields
                      ? 'Hide Optional Details'
                      : '+ Optional Details (Header Title, Subtitle, Currency)'}
                  </span>
                  <span className="text-[11px] text-teal-700 font-semibold">
                    {showExtraSettingsFields ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showExtraSettingsFields && (
                  <div className="mt-3 space-y-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Industry / Category Kicker
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={80}
                          value={draftIndustry}
                          onChange={(e) => setDraftIndustry(e.target.value)}
                          placeholder="e.g., Small-Batch Manufacturing & Production"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Currency Symbol
                        </label>
                        <select
                          value={draftCurrencySymbol}
                          onChange={(e) => setDraftCurrencySymbol(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono"
                        >
                          <option value="₱">₱ (PHP - Philippine Peso)</option>
                          <option value="$">$ (USD / International Dollar)</option>
                          <option value="€">€ (EUR - Euro)</option>
                          <option value="£">£ (GBP - British Pound)</option>
                          <option value="₹">₹ (INR - Indian Rupee)</option>
                          <option value="¥">¥ (JPY / CNY - Yen / Yuan)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Main Application Title (Header H1)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="e.g., Production Inventory, Recipe Costing & Margin Ledger"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Workspace Subtitle / Description
                      </label>
                      <textarea
                        rows={2}
                        required
                        maxLength={300}
                        value={draftSubtitle}
                        onChange={(e) => setDraftSubtitle(e.target.value)}
                        placeholder="Describe what your business produces and tracks..."
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 sm:bg-transparent hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Title & Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Price & Refill Guide Modal */}
      <PriceGuideModal
        isOpen={isPriceGuideModalOpen}
        onClose={() => setIsPriceGuideModalOpen(false)}
        brandName={workspaceSettings.brandName}
        formulas={formulas}
        ingredients={ingredients}
        materials={materials}
      />
    </div>
  );
}
