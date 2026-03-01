import React, { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import { supabase } from '../services/supabaseClient';
import { RegisteredPharmacy } from '../types';

const STORAGE_KEY = 'mdxera_company_configuration_v2';

type Status = 'Active' | 'Inactive';
type GLType = 'Asset' | 'Expense' | 'Income' | 'Liability' | 'Equity';
type MaterialType = 'Trading Goods' | 'Finished Goods' | 'Consumables' | 'Service Material' | 'Packaging';

type AuditFields = {
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};

type CompanyCode = AuditFields & {
  id: string;
  code: string;
  description: string;
  status: Status;
};

type SetOfBooks = AuditFields & {
  id: string;
  companyCodeId: string;
  setOfBooksId: string;
  description: string;
  defaultCurrency: string;
  activeStatus: Status;
  postingCount: number;
};

type GLMaster = AuditFields & {
  id: string;
  setOfBooksId: string;
  glCode: string;
  glName: string;
  glType: GLType;
  postingAllowed: boolean;
  activeStatus: Status;
  seeded_by_system: boolean;
  template_version: string;
  postingCount: number;
};

type GLAssignment = AuditFields & {
  id: string;
  setOfBooksId: string;
  materialMasterType: MaterialType;
  inventoryGL?: string;
  purchaseGL: string;
  cogsGL: string;
  salesGL?: string;
  discountGL: string;
  taxGL: string;
  seeded_by_system: boolean;
  template_version: string;
};

type AssignmentHistory = {
  id: string;
  assignmentId: string;
  setOfBooksId: string;
  materialMasterType: MaterialType;
  changed_at: string;
  changed_by: string;
  effective_from: string;
  previous: Partial<GLAssignment>;
  next: Partial<GLAssignment>;
};

type SetupLog = {
  id: string;
  setOfBooksId: string;
  action: 'DEFAULT_CREATED' | 'RESET_DEFAULT';
  message: string;
  created_at: string;
  created_by: string;
};

type Store = {
  companies: CompanyCode[];
  setOfBooks: SetOfBooks[];
  glMasters: GLMaster[];
  glAssignments: GLAssignment[];
  assignmentHistory: AssignmentHistory[];
  setupLogs: SetupLog[];
};

type TabId = 'company' | 'books' | 'gl' | 'assignment' | 'wizard';


type CompanyConfigurationProps = {
  currentUser: RegisteredPharmacy | null;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'company', label: 'Company Code' },
  { id: 'books', label: 'Set of Books' },
  { id: 'gl', label: 'GL Master' },
  { id: 'assignment', label: 'GL Assignment' },
  { id: 'wizard', label: 'Setup Wizard / Defaults Log' },
];

const materialTypes: MaterialType[] = ['Trading Goods', 'Finished Goods', 'Consumables', 'Service Material', 'Packaging'];
const glTypes: GLType[] = ['Asset', 'Expense', 'Income', 'Liability', 'Equity'];

const defaultStore: Store = {
  companies: [],
  setOfBooks: [],
  glMasters: [],
  glAssignments: [],
  assignmentHistory: [],
  setupLogs: [],
};

const DEFAULT_TEMPLATE_VERSION = 'v1.0';
const SYSTEM_USER = 'system';
const now = () => new Date().toISOString();
const getId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const defaultGlTemplate: Array<{ key: string; glName: string; glType: GLType; code: number }> = [
  { key: 'invTrading', glName: 'Inventory - Trading Goods', glType: 'Asset', code: 140000 },
  { key: 'invFinished', glName: 'Inventory - Finished Goods', glType: 'Asset', code: 140100 },
  { key: 'invConsumable', glName: 'Inventory - Consumables', glType: 'Asset', code: 140200 },
  { key: 'invPackaging', glName: 'Inventory - Packaging', glType: 'Asset', code: 140300 },
  { key: 'purchase', glName: 'Purchase Account', glType: 'Expense', code: 500100 },
  { key: 'cogs', glName: 'COGS Account', glType: 'Expense', code: 500200 },
  { key: 'discount', glName: 'Discount Account', glType: 'Expense', code: 500300 },
  { key: 'serviceCost', glName: 'Service Cost', glType: 'Expense', code: 500400 },
  { key: 'sales', glName: 'Sales Account', glType: 'Income', code: 400100 },
  { key: 'gstOutput', glName: 'GST Output', glType: 'Liability', code: 210100 },
  { key: 'gstInput', glName: 'GST Input', glType: 'Liability', code: 210200 },
  { key: 'payables', glName: 'Trade Payables', glType: 'Liability', code: 220000 },
];

const requiredFieldRules: Record<MaterialType, { inventoryRequired: boolean; salesRequired: boolean }> = {
  'Trading Goods': { inventoryRequired: true, salesRequired: true },
  'Finished Goods': { inventoryRequired: true, salesRequired: true },
  Consumables: { inventoryRequired: false, salesRequired: false },
  'Service Material': { inventoryRequired: false, salesRequired: true },
  Packaging: { inventoryRequired: true, salesRequired: false },
};

const loadStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore;
    return { ...defaultStore, ...JSON.parse(raw) };
  } catch {
    return defaultStore;
  }
};

const exportCsv = (filename: string, headers: string[], rows: Array<Array<string | number | boolean | undefined>>) => {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

const CompanyConfiguration: React.FC<CompanyConfigurationProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [store, setStore] = useState<Store>(loadStore);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  const [companyForm, setCompanyForm] = useState({ code: '', description: '', status: 'Active' as Status });
  const [booksForm, setBooksForm] = useState({ companyCodeId: '', setOfBooksId: '', description: '', defaultCurrency: 'INR', activeStatus: 'Active' as Status, postingCount: 0 });
  const [glForm, setGlForm] = useState({ setOfBooksId: '', glCode: '', glName: '', glType: 'Asset' as GLType, postingAllowed: true, activeStatus: 'Active' as Status, postingCount: 0 });
  const [assignmentForm, setAssignmentForm] = useState({ setOfBooksId: '', materialMasterType: 'Trading Goods' as MaterialType, inventoryGL: '', purchaseGL: '', cogsGL: '', salesGL: '', discountGL: '', taxGL: '' });

  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingBooksId, setEditingBooksId] = useState<string | null>(null);
  const [editingGlId, setEditingGlId] = useState<string | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  const persist = (next: Store) => {
    setStore(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };


  useEffect(() => {
    const loadFromDatabase = async () => {
      if (!currentUser?.organization_id) return;
      try {
        const organizationId = currentUser.organization_id;
        const [companiesRes, booksRes, glRes, assignmentRes, logsRes, historyRes] = await Promise.all([
          supabase.from('company_codes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
          supabase.from('set_of_books').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
          supabase.from('gl_master').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
          supabase.from('gl_assignments').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
          supabase.from('setup_wizard_defaults_log').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
          supabase.from('gl_assignment_history').select('*').eq('organization_id', organizationId).order('changed_at', { ascending: false }),
        ]);

        const hasSchemaError = [companiesRes, booksRes, glRes, assignmentRes, logsRes, historyRes].some(r => r.error);
        if (hasSchemaError) return;

        const nextStore: Store = {
          companies: (companiesRes.data || []).map((c: any) => ({
            id: c.id,
            code: c.code,
            description: c.description || '',
            status: c.status || 'Active',
            created_by: c.created_by || SYSTEM_USER,
            created_at: c.created_at || now(),
            updated_by: c.updated_by || SYSTEM_USER,
            updated_at: c.updated_at || now(),
          })),
          setOfBooks: (booksRes.data || []).map((b: any) => ({
            id: b.id,
            companyCodeId: b.company_code_id,
            setOfBooksId: b.set_of_books_id,
            description: b.description || '',
            defaultCurrency: b.default_currency || 'INR',
            activeStatus: b.active_status || 'Active',
            postingCount: b.posting_count || 0,
            created_by: b.created_by || SYSTEM_USER,
            created_at: b.created_at || now(),
            updated_by: b.updated_by || SYSTEM_USER,
            updated_at: b.updated_at || now(),
          })),
          glMasters: (glRes.data || []).map((g: any) => ({
            id: g.id,
            setOfBooksId: g.set_of_books_id,
            glCode: g.gl_code,
            glName: g.gl_name,
            glType: g.gl_type,
            postingAllowed: !!g.posting_allowed,
            activeStatus: g.active_status || 'Active',
            seeded_by_system: !!g.seeded_by_system,
            template_version: g.template_version || DEFAULT_TEMPLATE_VERSION,
            postingCount: g.posting_count || 0,
            created_by: g.created_by || SYSTEM_USER,
            created_at: g.created_at || now(),
            updated_by: g.updated_by || SYSTEM_USER,
            updated_at: g.updated_at || now(),
          })),
          glAssignments: (assignmentRes.data || []).map((a: any) => ({
            id: a.id,
            setOfBooksId: a.set_of_books_id,
            materialMasterType: a.material_master_type,
            inventoryGL: a.inventory_gl || '',
            purchaseGL: a.purchase_gl,
            cogsGL: a.cogs_gl,
            salesGL: a.sales_gl || '',
            discountGL: a.discount_gl,
            taxGL: a.tax_gl,
            seeded_by_system: !!a.seeded_by_system,
            template_version: a.template_version || DEFAULT_TEMPLATE_VERSION,
            created_by: a.created_by || SYSTEM_USER,
            created_at: a.created_at || now(),
            updated_by: a.updated_by || SYSTEM_USER,
            updated_at: a.updated_at || now(),
          })),
          setupLogs: (logsRes.data || []).map((l: any) => ({
            id: l.id,
            setOfBooksId: l.set_of_books_id,
            action: l.action,
            message: l.message,
            created_at: l.created_at || now(),
            created_by: l.created_by || SYSTEM_USER,
          })),
          assignmentHistory: (historyRes.data || []).map((h: any) => ({
            id: h.id,
            assignmentId: h.assignment_id,
            setOfBooksId: h.set_of_books_id,
            materialMasterType: h.material_master_type,
            changed_at: h.changed_at || now(),
            changed_by: h.changed_by || SYSTEM_USER,
            effective_from: h.effective_from || now(),
            previous: h.previous_payload || {},
            next: h.next_payload || {},
          })),
        };

        if (nextStore.companies.length || nextStore.setOfBooks.length || nextStore.glMasters.length || nextStore.glAssignments.length) {
          persist(nextStore);
        }
      } catch {
        // Local mode fallback remains available via localStorage.
      }
    };

    loadFromDatabase();
  }, [currentUser?.organization_id]);

  const booksById = useMemo(() => new Map(store.setOfBooks.map(s => [s.id, s])), [store.setOfBooks]);
  const glById = useMemo(() => new Map(store.glMasters.map(g => [g.id, g])), [store.glMasters]);
  const glForSelectedBooks = useMemo(() => store.glMasters.filter(g => g.setOfBooksId === assignmentForm.setOfBooksId && g.activeStatus === 'Active'), [store.glMasters, assignmentForm.setOfBooksId]);

  const seedDefaultsForBooks = (setOfBooksId: string, mode: 'create' | 'append') => {
    const stamp = now();
    const glExisting = store.glMasters.filter(g => g.setOfBooksId === setOfBooksId);
    const codeExists = new Set(glExisting.map(g => g.glCode));
    const keyToGlId = new Map<string, string>();
    const createdGL: GLMaster[] = [];

    defaultGlTemplate.forEach((tpl, idx) => {
      const baseCode = String(tpl.code + idx);
      const generatedCode = codeExists.has(baseCode) ? `${baseCode}-${Date.now().toString().slice(-4)}` : baseCode;
      const found = glExisting.find(g => g.glName.toLowerCase() === tpl.glName.toLowerCase() && g.glType === tpl.glType);
      if (found) {
        keyToGlId.set(tpl.key, found.id);
        return;
      }
      const glId = getId();
      createdGL.push({
        id: glId,
        setOfBooksId,
        glCode: generatedCode,
        glName: tpl.glName,
        glType: tpl.glType,
        postingAllowed: true,
        activeStatus: 'Active',
        seeded_by_system: true,
        template_version: DEFAULT_TEMPLATE_VERSION,
        postingCount: 0,
        created_at: stamp,
        updated_at: stamp,
        created_by: SYSTEM_USER,
        updated_by: SYSTEM_USER,
      });
      keyToGlId.set(tpl.key, glId);
    });

    const assignmentSeed: Array<Omit<GLAssignment, keyof AuditFields | 'id'>> = [
      { setOfBooksId, materialMasterType: 'Trading Goods', inventoryGL: keyToGlId.get('invTrading') || '', purchaseGL: keyToGlId.get('purchase') || '', cogsGL: keyToGlId.get('cogs') || '', salesGL: keyToGlId.get('sales') || '', discountGL: keyToGlId.get('discount') || '', taxGL: keyToGlId.get('gstOutput') || keyToGlId.get('payables') || '', seeded_by_system: true, template_version: DEFAULT_TEMPLATE_VERSION },
      { setOfBooksId, materialMasterType: 'Finished Goods', inventoryGL: keyToGlId.get('invFinished') || '', purchaseGL: keyToGlId.get('purchase') || '', cogsGL: keyToGlId.get('cogs') || '', salesGL: keyToGlId.get('sales') || '', discountGL: keyToGlId.get('discount') || '', taxGL: keyToGlId.get('gstOutput') || keyToGlId.get('payables') || '', seeded_by_system: true, template_version: DEFAULT_TEMPLATE_VERSION },
      { setOfBooksId, materialMasterType: 'Consumables', inventoryGL: keyToGlId.get('invConsumable') || '', purchaseGL: keyToGlId.get('purchase') || '', cogsGL: keyToGlId.get('cogs') || '', salesGL: keyToGlId.get('sales') || '', discountGL: keyToGlId.get('discount') || '', taxGL: keyToGlId.get('gstOutput') || keyToGlId.get('payables') || '', seeded_by_system: true, template_version: DEFAULT_TEMPLATE_VERSION },
      { setOfBooksId, materialMasterType: 'Service Material', inventoryGL: '', purchaseGL: keyToGlId.get('serviceCost') || keyToGlId.get('purchase') || '', cogsGL: keyToGlId.get('serviceCost') || keyToGlId.get('cogs') || '', salesGL: keyToGlId.get('sales') || '', discountGL: keyToGlId.get('discount') || '', taxGL: keyToGlId.get('gstOutput') || keyToGlId.get('payables') || '', seeded_by_system: true, template_version: DEFAULT_TEMPLATE_VERSION },
      { setOfBooksId, materialMasterType: 'Packaging', inventoryGL: keyToGlId.get('invPackaging') || '', purchaseGL: keyToGlId.get('purchase') || '', cogsGL: keyToGlId.get('cogs') || '', salesGL: '', discountGL: keyToGlId.get('discount') || '', taxGL: keyToGlId.get('gstOutput') || keyToGlId.get('payables') || '', seeded_by_system: true, template_version: DEFAULT_TEMPLATE_VERSION },
    ];

    const existingAssignments = store.glAssignments.filter(a => a.setOfBooksId === setOfBooksId);
    const createdAssignments = assignmentSeed
      .filter(a => !existingAssignments.some(e => e.materialMasterType === a.materialMasterType))
      .map(a => ({ id: getId(), ...a, created_at: stamp, updated_at: stamp, created_by: SYSTEM_USER, updated_by: SYSTEM_USER }));

    const next: Store = {
      ...store,
      glMasters: [...store.glMasters, ...createdGL],
      glAssignments: [...store.glAssignments, ...createdAssignments],
      setupLogs: [...store.setupLogs, {
        id: getId(),
        setOfBooksId,
        action: mode === 'create' ? 'DEFAULT_CREATED' : 'RESET_DEFAULT',
        message: mode === 'create' ? 'Default GL and assignments seeded.' : 'Reset to default (append mode).',
        created_at: stamp,
        created_by: SYSTEM_USER,
      }],
    };

    persist(next);
    setSuccess(`Default setup complete. Added ${createdGL.length} GL(s) and ${createdAssignments.length} assignment(s).`);
  };

  const validateAssignment = (payload: typeof assignmentForm): string | null => {
    const sobId = payload.setOfBooksId;
    const rule = requiredFieldRules[payload.materialMasterType];
    const validateType = (id: string | undefined, expected: GLType, label: string, required = true) => {
      if (!id) return required ? `${label} is required.` : null;
      const gl = glById.get(id);
      if (!gl || gl.setOfBooksId !== sobId) return `${label} is invalid for selected Set of Books.`;
      if (gl.glType !== expected) return `${label} must be ${expected}.`;
      return null;
    };

    const checks = [
      validateType(payload.inventoryGL, 'Asset', 'Inventory GL', rule.inventoryRequired),
      validateType(payload.purchaseGL, 'Expense', 'Purchase GL'),
      validateType(payload.cogsGL, 'Expense', 'COGS GL'),
      validateType(payload.salesGL, 'Income', 'Sales GL', rule.salesRequired),
      validateType(payload.discountGL, 'Expense', 'Discount GL'),
      validateType(payload.taxGL, 'Liability', 'Tax GL'),
    ];

    return checks.find(Boolean) || null;
  };

  const filteredCompanies = store.companies.filter(c => [c.code, c.description, c.status].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredBooks = store.setOfBooks.filter(b => [b.setOfBooksId, b.description, b.defaultCurrency].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredGL = store.glMasters.filter(g => [g.glCode, g.glName, g.glType].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredAssignments = store.glAssignments.filter(a => [a.materialMasterType, booksById.get(a.setOfBooksId)?.setOfBooksId || ''].join(' ').toLowerCase().includes(search.toLowerCase()));

  const onSaveCompany = () => {
    setError('');
    setSuccess('');
    if (!companyForm.code.trim()) return setError('Company Code is mandatory before Set of Books setup.');
    const duplicate = store.companies.some(c => c.code.toLowerCase() === companyForm.code.trim().toLowerCase() && c.id !== editingCompanyId);
    if (duplicate) return setError('Company Code must be unique.');
    const stamp = now();

    if (editingCompanyId) {
      persist({ ...store, companies: store.companies.map(c => c.id === editingCompanyId ? { ...c, ...companyForm, code: companyForm.code.trim(), updated_at: stamp, updated_by: SYSTEM_USER } : c) });
      setSuccess('Company Code updated.');
    } else {
      persist({ ...store, companies: [...store.companies, { id: getId(), ...companyForm, code: companyForm.code.trim(), created_at: stamp, updated_at: stamp, created_by: SYSTEM_USER, updated_by: SYSTEM_USER }] });
      setSuccess('Company Code created.');
    }

    setCompanyForm({ code: '', description: '', status: 'Active' });
    setEditingCompanyId(null);
  };

  const onSaveBooks = () => {
    setError('');
    setSuccess('');
    if (!booksForm.companyCodeId) return setError('Company Code is required.');
    if (!booksForm.setOfBooksId.trim()) return setError('Set of Books ID is required.');

    const duplicate = store.setOfBooks.some(b => b.companyCodeId === booksForm.companyCodeId && b.setOfBooksId.toLowerCase() === booksForm.setOfBooksId.trim().toLowerCase() && b.id !== editingBooksId);
    if (duplicate) return setError('Set of Books ID must be unique per Company Code.');

    const stamp = now();
    if (editingBooksId) {
      persist({ ...store, setOfBooks: store.setOfBooks.map(b => b.id === editingBooksId ? { ...b, ...booksForm, setOfBooksId: booksForm.setOfBooksId.trim(), updated_at: stamp, updated_by: SYSTEM_USER } : b) });
      setSuccess('Set of Books updated.');
    } else {
      const newBooksId = getId();
      const nextStore = {
        ...store,
        setOfBooks: [...store.setOfBooks, { id: newBooksId, ...booksForm, setOfBooksId: booksForm.setOfBooksId.trim(), created_at: stamp, updated_at: stamp, created_by: SYSTEM_USER, updated_by: SYSTEM_USER }],
      };
      persist(nextStore);
      const seed = window.confirm('Create Default GL & Assignments?');
      if (seed) {
        setStore(nextStore);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
        setTimeout(() => {
          setStore(prev => {
            const merged = { ...prev };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            return merged;
          });
          seedDefaultsForBooks(newBooksId, 'create');
        }, 0);
      } else {
        setSuccess('Set of Books created without defaults.');
      }
    }

    setBooksForm({ companyCodeId: '', setOfBooksId: '', description: '', defaultCurrency: 'INR', activeStatus: 'Active', postingCount: 0 });
    setEditingBooksId(null);
  };

  const onSaveGL = () => {
    setError('');
    setSuccess('');
    if (!glForm.setOfBooksId) return setError('Set of Books is required for GL Master.');
    if (!glForm.glCode.trim()) return setError('GL Code is required.');
    if (!glForm.glName.trim()) return setError('GL Name is required.');

    const duplicate = store.glMasters.some(g => g.setOfBooksId === glForm.setOfBooksId && g.glCode.toLowerCase() === glForm.glCode.trim().toLowerCase() && g.id !== editingGlId);
    if (duplicate) return setError('GL Code must be unique per Set of Books.');

    if (editingGlId) {
      const current = store.glMasters.find(g => g.id === editingGlId);
      if (current && current.postingCount > 0 && current.glCode !== glForm.glCode.trim()) {
        return setError('GL Code cannot be changed because postings already exist.');
      }
    }

    const stamp = now();
    if (editingGlId) {
      persist({ ...store, glMasters: store.glMasters.map(g => g.id === editingGlId ? { ...g, ...glForm, glCode: glForm.glCode.trim(), glName: glForm.glName.trim(), updated_at: stamp, updated_by: SYSTEM_USER } : g) });
      setSuccess('GL Master updated.');
    } else {
      persist({ ...store, glMasters: [...store.glMasters, {
        id: getId(),
        ...glForm,
        glCode: glForm.glCode.trim(),
        glName: glForm.glName.trim(),
        seeded_by_system: false,
        template_version: DEFAULT_TEMPLATE_VERSION,
        created_at: stamp,
        updated_at: stamp,
        created_by: SYSTEM_USER,
        updated_by: SYSTEM_USER,
      }] });
      setSuccess('GL Master created.');
    }

    setGlForm({ setOfBooksId: '', glCode: '', glName: '', glType: 'Asset', postingAllowed: true, activeStatus: 'Active', postingCount: 0 });
    setEditingGlId(null);
  };

  const onSaveAssignment = () => {
    setError('');
    setSuccess('');
    if (!assignmentForm.setOfBooksId) return setError('Set of Books is required.');

    const duplicate = store.glAssignments.some(a => a.setOfBooksId === assignmentForm.setOfBooksId && a.materialMasterType === assignmentForm.materialMasterType && a.id !== editingAssignmentId);
    if (duplicate) return setError('Unique mapping rule violated for Set of Books + Material Type.');

    const validationError = validateAssignment(assignmentForm);
    if (validationError) return setError(validationError);

    const stamp = now();
    if (editingAssignmentId) {
      const current = store.glAssignments.find(a => a.id === editingAssignmentId);
      if (current && booksById.get(current.setOfBooksId)?.postingCount) {
        store.assignmentHistory.push({
          id: getId(),
          assignmentId: editingAssignmentId,
          setOfBooksId: current.setOfBooksId,
          materialMasterType: current.materialMasterType,
          changed_at: stamp,
          changed_by: SYSTEM_USER,
          effective_from: stamp,
          previous: current,
          next: assignmentForm,
        });
      }
      persist({ ...store, glAssignments: store.glAssignments.map(a => a.id === editingAssignmentId ? { ...a, ...assignmentForm, updated_at: stamp, updated_by: SYSTEM_USER } : a) });
      setSuccess('Assignment updated. If postings exist, this applies only to future postings.');
    } else {
      persist({ ...store, glAssignments: [...store.glAssignments, { id: getId(), ...assignmentForm, seeded_by_system: false, template_version: DEFAULT_TEMPLATE_VERSION, created_at: stamp, updated_at: stamp, created_by: SYSTEM_USER, updated_by: SYSTEM_USER }] });
      setSuccess('Assignment created.');
    }

    setAssignmentForm({ setOfBooksId: '', materialMasterType: 'Trading Goods', inventoryGL: '', purchaseGL: '', cogsGL: '', salesGL: '', discountGL: '', taxGL: '' });
    setEditingAssignmentId(null);
  };

  const runResetDefaults = (setOfBooksId: string) => {
    setError('');
    const books = booksById.get(setOfBooksId);
    if (!books) return;
    if (books.postingCount > 0) {
      const confirmed = window.confirm('Postings already exist. Create additional defaults without deleting existing?');
      if (!confirmed) return;
    }
    seedDefaultsForBooks(setOfBooksId, 'append');
  };

  const activeRule = requiredFieldRules[assignmentForm.materialMasterType];

  const onSaveConfiguration = async () => {
    setError('');
    setSuccess('');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

    if (!currentUser?.organization_id) {
      setSuccess('Configuration saved locally. Login with organization access to sync database tables.');
      return;
    }

    const organizationId = currentUser.organization_id;
    const userName = currentUser.full_name || SYSTEM_USER;

    try {
      await supabase.from('gl_assignment_history').delete().eq('organization_id', organizationId);
      await supabase.from('setup_wizard_defaults_log').delete().eq('organization_id', organizationId);
      await supabase.from('gl_assignments').delete().eq('organization_id', organizationId);
      await supabase.from('gl_master').delete().eq('organization_id', organizationId);
      await supabase.from('set_of_books').delete().eq('organization_id', organizationId);
      await supabase.from('company_codes').delete().eq('organization_id', organizationId);

      if (store.companies.length > 0) {
        const { error: companyErr } = await supabase.from('company_codes').insert(store.companies.map(c => ({
          id: c.id,
          organization_id: organizationId,
          code: c.code,
          description: c.description,
          status: c.status,
          created_by: c.created_by || userName,
          created_at: c.created_at,
          updated_by: userName,
          updated_at: now(),
        })));
        if (companyErr) throw companyErr;
      }

      if (store.setOfBooks.length > 0) {
        const { error: booksErr } = await supabase.from('set_of_books').insert(store.setOfBooks.map(b => ({
          id: b.id,
          organization_id: organizationId,
          company_code_id: b.companyCodeId,
          set_of_books_id: b.setOfBooksId,
          description: b.description,
          default_currency: b.defaultCurrency,
          active_status: b.activeStatus,
          posting_count: b.postingCount || 0,
          created_by: b.created_by || userName,
          created_at: b.created_at,
          updated_by: userName,
          updated_at: now(),
        })));
        if (booksErr) throw booksErr;
      }

      if (store.glMasters.length > 0) {
        const { error: glErr } = await supabase.from('gl_master').insert(store.glMasters.map(g => ({
          id: g.id,
          organization_id: organizationId,
          set_of_books_id: g.setOfBooksId,
          gl_code: g.glCode,
          gl_name: g.glName,
          gl_type: g.glType,
          posting_allowed: g.postingAllowed,
          active_status: g.activeStatus,
          seeded_by_system: !!g.seeded_by_system,
          template_version: g.template_version || DEFAULT_TEMPLATE_VERSION,
          posting_count: g.postingCount || 0,
          created_by: g.created_by || userName,
          created_at: g.created_at,
          updated_by: userName,
          updated_at: now(),
        })));
        if (glErr) throw glErr;
      }

      if (store.glAssignments.length > 0) {
        const { error: assignmentErr } = await supabase.from('gl_assignments').insert(store.glAssignments.map(a => ({
          id: a.id,
          organization_id: organizationId,
          set_of_books_id: a.setOfBooksId,
          material_master_type: a.materialMasterType,
          inventory_gl: a.inventoryGL || null,
          purchase_gl: a.purchaseGL,
          cogs_gl: a.cogsGL,
          sales_gl: a.salesGL || null,
          discount_gl: a.discountGL,
          tax_gl: a.taxGL,
          seeded_by_system: !!a.seeded_by_system,
          template_version: a.template_version || DEFAULT_TEMPLATE_VERSION,
          created_by: a.created_by || userName,
          created_at: a.created_at,
          updated_by: userName,
          updated_at: now(),
        })));
        if (assignmentErr) throw assignmentErr;
      }

      if (store.setupLogs.length > 0) {
        const { error: logsErr } = await supabase.from('setup_wizard_defaults_log').insert(store.setupLogs.map(l => ({
          id: l.id,
          organization_id: organizationId,
          set_of_books_id: l.setOfBooksId,
          action: l.action,
          message: l.message,
          created_by: l.created_by || userName,
          created_at: l.created_at,
        })));
        if (logsErr) throw logsErr;
      }

      if (store.assignmentHistory.length > 0) {
        const { error: historyErr } = await supabase.from('gl_assignment_history').insert(store.assignmentHistory.map(h => ({
          id: h.id,
          organization_id: organizationId,
          assignment_id: h.assignmentId,
          set_of_books_id: h.setOfBooksId,
          material_master_type: h.materialMasterType,
          changed_at: h.changed_at,
          changed_by: h.changed_by || userName,
          effective_from: h.effective_from,
          previous_payload: h.previous || {},
          next_payload: h.next || {},
        })));
        if (historyErr) throw historyErr;
      }

      setSuccess('Company Configuration saved locally and synced to database tables (Company Code, Set of Books, GL Master, GL Assignment, Setup Wizard/Defaults Log).');
    } catch (e: any) {
      setError(`Saved locally but database sync failed. ${e?.message || 'Please run the SQL setup and retry.'}`);
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-black text-primary uppercase">Company Configuration</h2>
          <p className="text-xs text-gray-500 font-bold uppercase">Utilities & Setup → Company Configuration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(''); }} className={`px-2 py-2 border text-[11px] font-black uppercase ${activeTab === tab.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300'}`}>{tab.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input className="tally-input" placeholder="Search / filter" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="text-[11px] text-gray-500 font-bold uppercase p-2 border border-gray-200 bg-gray-50">Flow: Company Code → Set of Books → GL Master → GL Assignment</div>
          <button className="bg-primary text-white text-xs font-black uppercase px-3 py-2" onClick={onSaveConfiguration}>Save Configuration</button>
        </div>

        {error && <div className="mb-3 text-xs font-black text-red-700 bg-red-50 border border-red-200 p-2">{error}</div>}
        {success && <div className="mb-3 text-xs font-black text-green-700 bg-green-50 border border-green-200 p-2">{success}</div>}

        {activeTab === 'company' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input className="tally-input" placeholder="Company Code*" value={companyForm.code} onChange={e => setCompanyForm({ ...companyForm, code: e.target.value })} />
              <input className="tally-input" placeholder="Description" value={companyForm.description} onChange={e => setCompanyForm({ ...companyForm, description: e.target.value })} />
              <select className="tally-input" value={companyForm.status} onChange={e => setCompanyForm({ ...companyForm, status: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveCompany}>{editingCompanyId ? 'Update' : 'Add'}</button>
            </div>
            <button className="text-xs font-bold text-primary" onClick={() => exportCsv('company-codes.csv', ['Code', 'Description', 'Status', 'Created By', 'Created At'], filteredCompanies.map(c => [c.code, c.description, c.status, c.created_by, c.created_at]))}>Export CSV</button>
            <div className="overflow-auto border border-gray-200">
              <table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Audit</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>
                {filteredCompanies.map(c => <tr key={c.id} className="border-t"><td className="p-2">{c.code}</td><td className="p-2">{c.description}</td><td className="p-2">{c.status}</td><td className="p-2">{c.created_by}<br />{new Date(c.created_at).toLocaleString()}</td><td className="p-2"><button className="text-primary font-bold" onClick={() => { setCompanyForm({ code: c.code, description: c.description, status: c.status }); setEditingCompanyId(c.id); }}>Edit</button></td></tr>)}
              </tbody></table>
            </div>
          </div>
        )}

        {activeTab === 'books' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={booksForm.companyCodeId} onChange={e => setBooksForm({ ...booksForm, companyCodeId: e.target.value })}><option value="">Company Code*</option>{store.companies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
              <input className="tally-input" placeholder="Set of Books ID*" value={booksForm.setOfBooksId} onChange={e => setBooksForm({ ...booksForm, setOfBooksId: e.target.value })} />
              <input className="tally-input" placeholder="Description" value={booksForm.description} onChange={e => setBooksForm({ ...booksForm, description: e.target.value })} />
              <input className="tally-input" placeholder="Currency" value={booksForm.defaultCurrency} onChange={e => setBooksForm({ ...booksForm, defaultCurrency: e.target.value })} />
              <input className="tally-input" type="number" placeholder="Posting Count" value={booksForm.postingCount} onChange={e => setBooksForm({ ...booksForm, postingCount: Number(e.target.value) || 0 })} />
              <select className="tally-input" value={booksForm.activeStatus} onChange={e => setBooksForm({ ...booksForm, activeStatus: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveBooks}>{editingBooksId ? 'Update' : 'Add'}</button>
            </div>
            <div className="text-[11px] text-gray-500 font-bold uppercase p-2 border border-blue-200 bg-blue-50">On create, system asks: “Create Default GL & Assignments” (Yes/No).</div>
            <button className="text-xs font-bold text-primary" onClick={() => exportCsv('set-of-books.csv', ['Company', 'Books ID', 'Description', 'Posting Count'], filteredBooks.map(b => [store.companies.find(c => c.id === b.companyCodeId)?.code || '', b.setOfBooksId, b.description, b.postingCount]))}>Export CSV</button>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Company</th><th className="p-2 text-left">Books ID</th><th className="p-2 text-left">Posting Count</th><th className="p-2 text-left">Audit</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredBooks.map(b => <tr key={b.id} className="border-t"><td className="p-2">{store.companies.find(c => c.id === b.companyCodeId)?.code}</td><td className="p-2">{b.setOfBooksId}</td><td className="p-2">{b.postingCount}</td><td className="p-2">{b.updated_by}<br />{new Date(b.updated_at).toLocaleString()}</td><td className="p-2"><button className="text-primary font-bold" onClick={() => { setBooksForm({ companyCodeId: b.companyCodeId, setOfBooksId: b.setOfBooksId, description: b.description, defaultCurrency: b.defaultCurrency, activeStatus: b.activeStatus, postingCount: b.postingCount }); setEditingBooksId(b.id); }}>Edit</button><button className="ml-3 text-emerald-700 font-bold" onClick={() => runResetDefaults(b.id)}>Reset to Default</button></td></tr>)}</tbody></table></div>
          </div>
        )}

        {activeTab === 'gl' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={glForm.setOfBooksId} onChange={e => setGlForm({ ...glForm, setOfBooksId: e.target.value })}><option value="">Set of Books*</option>{store.setOfBooks.map(b => <option key={b.id} value={b.id}>{b.setOfBooksId}</option>)}</select>
              <input className="tally-input" placeholder="GL Code*" value={glForm.glCode} onChange={e => setGlForm({ ...glForm, glCode: e.target.value })} />
              <input className="tally-input" placeholder="GL Name*" value={glForm.glName} onChange={e => setGlForm({ ...glForm, glName: e.target.value })} />
              <select className="tally-input" value={glForm.glType} onChange={e => setGlForm({ ...glForm, glType: e.target.value as GLType })}>{glTypes.map(t => <option key={t}>{t}</option>)}</select>
              <select className="tally-input" value={String(glForm.postingAllowed)} onChange={e => setGlForm({ ...glForm, postingAllowed: e.target.value === 'true' })}><option value="true">Posting Allowed: Yes</option><option value="false">Posting Allowed: No</option></select>
              <input className="tally-input" type="number" placeholder="Posting Count" value={glForm.postingCount} onChange={e => setGlForm({ ...glForm, postingCount: Number(e.target.value) || 0 })} />
              <select className="tally-input" value={glForm.activeStatus} onChange={e => setGlForm({ ...glForm, activeStatus: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveGL}>{editingGlId ? 'Update' : 'Add'}</button>
            </div>
            <button className="text-xs font-bold text-primary" onClick={() => exportCsv('gl-master.csv', ['Books', 'GL Code', 'GL Name', 'Type', 'Seeded'], filteredGL.map(g => [booksById.get(g.setOfBooksId)?.setOfBooksId || '', g.glCode, g.glName, g.glType, g.seeded_by_system]))}>Export CSV</button>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Books</th><th className="p-2 text-left">GL</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Flags</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredGL.map(g => <tr key={g.id} className="border-t"><td className="p-2">{booksById.get(g.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{g.glCode} - {g.glName}</td><td className="p-2">{g.glType}</td><td className="p-2">Posting:{g.postingAllowed ? 'Yes' : 'No'}<br />Seeded:{g.seeded_by_system ? 'Yes' : 'No'}<br />Template:{g.template_version}</td><td className="p-2"><button className="text-primary font-bold" onClick={() => { setGlForm({ setOfBooksId: g.setOfBooksId, glCode: g.glCode, glName: g.glName, glType: g.glType, postingAllowed: g.postingAllowed, activeStatus: g.activeStatus, postingCount: g.postingCount }); setEditingGlId(g.id); }}>Edit</button></td></tr>)}</tbody></table></div>
          </div>
        )}

        {activeTab === 'assignment' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={assignmentForm.setOfBooksId} onChange={e => setAssignmentForm({ ...assignmentForm, setOfBooksId: e.target.value })}><option value="">Set of Books*</option>{store.setOfBooks.map(b => <option key={b.id} value={b.id}>{b.setOfBooksId}</option>)}</select>
              <select className="tally-input" value={assignmentForm.materialMasterType} onChange={e => setAssignmentForm({ ...assignmentForm, materialMasterType: e.target.value as MaterialType })}>{materialTypes.map(mt => <option key={mt}>{mt}</option>)}</select>
              <select className="tally-input" value={assignmentForm.inventoryGL} onChange={e => setAssignmentForm({ ...assignmentForm, inventoryGL: e.target.value })} disabled={!activeRule.inventoryRequired}><option value="">Inventory GL {activeRule.inventoryRequired ? '(Asset)' : '(Optional/Hidden)'}</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.purchaseGL} onChange={e => setAssignmentForm({ ...assignmentForm, purchaseGL: e.target.value })}><option value="">Purchase GL (Expense)</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.cogsGL} onChange={e => setAssignmentForm({ ...assignmentForm, cogsGL: e.target.value })}><option value="">COGS GL (Expense)</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.salesGL} onChange={e => setAssignmentForm({ ...assignmentForm, salesGL: e.target.value })} disabled={!activeRule.salesRequired}><option value="">Sales GL {activeRule.salesRequired ? '(Income)' : '(Optional/Hidden)'}</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.discountGL} onChange={e => setAssignmentForm({ ...assignmentForm, discountGL: e.target.value })}><option value="">Discount GL (Expense)</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.taxGL} onChange={e => setAssignmentForm({ ...assignmentForm, taxGL: e.target.value })}><option value="">Tax GL (Liability)</option>{glForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveAssignment}>{editingAssignmentId ? 'Update' : 'Add'}</button>
            </div>
            <div className="text-[11px] text-gray-500 font-bold uppercase p-2 border border-yellow-200 bg-yellow-50">Posting behavior: if mapping missing for selected Set of Books + Material Type, block posting with message: “GL Assignment missing for Material Type under selected Set of Books. Please configure in Utilities & Setup.”</div>
            <button className="text-xs font-bold text-primary" onClick={() => exportCsv('gl-assignments.csv', ['Books', 'Material Type', 'Inventory', 'Purchase', 'COGS', 'Sales', 'Discount', 'Tax'], filteredAssignments.map(a => [booksById.get(a.setOfBooksId)?.setOfBooksId || '', a.materialMasterType, glById.get(a.inventoryGL || '')?.glCode || '', glById.get(a.purchaseGL)?.glCode || '', glById.get(a.cogsGL)?.glCode || '', glById.get(a.salesGL || '')?.glCode || '', glById.get(a.discountGL)?.glCode || '', glById.get(a.taxGL)?.glCode || '']))}>Export CSV</button>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Books</th><th className="p-2 text-left">Material</th><th className="p-2 text-left">GL Summary</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredAssignments.map(a => <tr key={a.id} className="border-t"><td className="p-2">{booksById.get(a.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{a.materialMasterType}</td><td className="p-2">Inv:{glById.get(a.inventoryGL || '')?.glCode || '-'} | Pur:{glById.get(a.purchaseGL)?.glCode} | COGS:{glById.get(a.cogsGL)?.glCode} | Sales:{glById.get(a.salesGL || '')?.glCode || '-'} | Tax:{glById.get(a.taxGL)?.glCode}</td><td className="p-2"><button className="text-primary font-bold" onClick={() => { setAssignmentForm({ setOfBooksId: a.setOfBooksId, materialMasterType: a.materialMasterType, inventoryGL: a.inventoryGL || '', purchaseGL: a.purchaseGL, cogsGL: a.cogsGL, salesGL: a.salesGL || '', discountGL: a.discountGL, taxGL: a.taxGL }); setEditingAssignmentId(a.id); }}>Edit</button></td></tr>)}</tbody></table></div>
          </div>
        )}

        {activeTab === 'wizard' && (
          <div className="space-y-3">
            <div className="text-xs text-gray-600 border border-gray-200 p-3 bg-gray-50">Reset to Default is allowed when no postings exist, or user confirms append mode. Audit fields are retained via seeded_by_system, template_version, created_at/by.</div>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Timestamp</th><th className="p-2 text-left">Books</th><th className="p-2 text-left">Action</th><th className="p-2 text-left">Message</th></tr></thead><tbody>{store.setupLogs.map(log => <tr key={log.id} className="border-t"><td className="p-2">{new Date(log.created_at).toLocaleString()}</td><td className="p-2">{booksById.get(log.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{log.action}</td><td className="p-2">{log.message}</td></tr>)}</tbody></table></div>
            <h4 className="text-xs font-black uppercase">Assignment Change History (Future-effective changes)</h4>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Changed At</th><th className="p-2 text-left">Books</th><th className="p-2 text-left">Material</th><th className="p-2 text-left">Effective From</th></tr></thead><tbody>{store.assignmentHistory.map(h => <tr key={h.id} className="border-t"><td className="p-2">{new Date(h.changed_at).toLocaleString()}</td><td className="p-2">{booksById.get(h.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{h.materialMasterType}</td><td className="p-2">{new Date(h.effective_from).toLocaleString()}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CompanyConfiguration;
