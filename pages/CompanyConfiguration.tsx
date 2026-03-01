import React, { useMemo, useState } from 'react';
import Card from '../components/Card';

const STORAGE_KEY = 'mdxera_company_configuration_v1';

const materialTypes = ['Trading Goods', 'Raw Material', 'Finished Goods', 'Service', 'Consumables'] as const;
const glTypes = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'] as const;

type Status = 'Active' | 'Inactive';
type MaterialType = (typeof materialTypes)[number];
type GLType = (typeof glTypes)[number];

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
  address: string;
  country: string;
  baseCurrency: string;
  financialYearVariant: string;
  status: Status;
};

type SetOfBooks = AuditFields & {
  id: string;
  companyCodeId: string;
  setOfBooksId: string;
  description: string;
  accountingStandard: string;
  defaultCurrency: string;
  activeStatus: Status;
};

type GLMaster = AuditFields & {
  id: string;
  setOfBooksId: string;
  glCode: string;
  glName: string;
  glType: GLType;
  accountGroup: string;
  postingAllowed: boolean;
  reconciliationAccount: boolean;
  activeStatus: Status;
};

type GLAssignment = AuditFields & {
  id: string;
  setOfBooksId: string;
  materialMasterType: MaterialType;
  inventoryGL: string;
  cogsGL: string;
  salesGL: string;
  purchaseGL: string;
  discountGL: string;
  taxGL?: string;
};

type Store = {
  companies: CompanyCode[];
  setOfBooks: SetOfBooks[];
  glMasters: GLMaster[];
  glAssignments: GLAssignment[];
};

type TabId = 'company' | 'books' | 'gl' | 'assignment';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'company', label: 'Company Code' },
  { id: 'books', label: 'Set of Books' },
  { id: 'gl', label: 'GL Master' },
  { id: 'assignment', label: 'GL Assignment' },
];

const defaultStore: Store = {
  companies: [],
  setOfBooks: [],
  glMasters: [],
  glAssignments: [],
};

const getNow = () => new Date().toISOString();
const getId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const loadStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore;
    return { ...defaultStore, ...JSON.parse(raw) };
  } catch {
    return defaultStore;
  }
};

const CompanyConfiguration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [store, setStore] = useState<Store>(loadStore);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | Status>('All');

  const [companyForm, setCompanyForm] = useState<Omit<CompanyCode, keyof AuditFields | 'id'>>({
    code: '', description: '', address: '', country: '', baseCurrency: 'INR', financialYearVariant: 'Apr-Mar', status: 'Active',
  });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  const [booksForm, setBooksForm] = useState<Omit<SetOfBooks, keyof AuditFields | 'id'>>({
    companyCodeId: '', setOfBooksId: '', description: '', accountingStandard: 'IFRS', defaultCurrency: 'INR', activeStatus: 'Active',
  });
  const [editingBooksId, setEditingBooksId] = useState<string | null>(null);

  const [glForm, setGlForm] = useState<Omit<GLMaster, keyof AuditFields | 'id'>>({
    setOfBooksId: '', glCode: '', glName: '', glType: 'Asset', accountGroup: '', postingAllowed: true, reconciliationAccount: false, activeStatus: 'Active',
  });
  const [editingGlId, setEditingGlId] = useState<string | null>(null);

  const [assignmentForm, setAssignmentForm] = useState<Omit<GLAssignment, keyof AuditFields | 'id'>>({
    setOfBooksId: '', materialMasterType: 'Trading Goods', inventoryGL: '', cogsGL: '', salesGL: '', purchaseGL: '', discountGL: '', taxGL: '',
  });
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  const persist = (next: Store) => {
    setStore(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const activeCompanies = useMemo(() => store.companies.filter(c => c.status === 'Active'), [store.companies]);
  const activeBooks = useMemo(() => store.setOfBooks.filter(b => b.activeStatus === 'Active'), [store.setOfBooks]);
  const glsForSelectedBooks = useMemo(
    () => store.glMasters.filter(g => g.setOfBooksId === assignmentForm.setOfBooksId && g.activeStatus === 'Active'),
    [store.glMasters, assignmentForm.setOfBooksId]
  );

  const typedGLs = useMemo(() => {
    const index = new Map<string, GLMaster>();
    store.glMasters.forEach(gl => index.set(gl.id, gl));
    return index;
  }, [store.glMasters]);

  const validateGlTypeCompatibility = (payload: Omit<GLAssignment, keyof AuditFields | 'id'>): string | null => {
    const checks: Array<{ glId: string; expected: GLType; label: string }> = [
      { glId: payload.inventoryGL, expected: 'Asset', label: 'Inventory GL' },
      { glId: payload.cogsGL, expected: 'Expense', label: 'COGS GL' },
      { glId: payload.salesGL, expected: 'Income', label: 'Sales GL' },
      { glId: payload.purchaseGL, expected: 'Expense', label: 'Purchase GL' },
    ];

    for (const check of checks) {
      const gl = typedGLs.get(check.glId);
      if (!gl) return `${check.label} is required.`;
      if (gl.glType !== check.expected) return `${check.label} must be mapped to ${check.expected} GL type.`;
    }

    if (!payload.discountGL) return 'Discount GL is required.';
    if (payload.taxGL) {
      const tax = typedGLs.get(payload.taxGL);
      if (!tax) return 'Tax GL is invalid.';
    }
    return null;
  };

  const filteredCompanies = useMemo(() => store.companies.filter(c => {
    const q = search.toLowerCase();
    const matchesQ = !q || [c.code, c.description, c.country, c.baseCurrency].join(' ').toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'All' || c.status === filterStatus;
    return matchesQ && matchesStatus;
  }), [store.companies, search, filterStatus]);

  const filteredBooks = useMemo(() => store.setOfBooks.filter(b => {
    const company = store.companies.find(c => c.id === b.companyCodeId);
    const q = search.toLowerCase();
    const matchesQ = !q || [b.setOfBooksId, b.description, b.accountingStandard, company?.code || ''].join(' ').toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'All' || b.activeStatus === filterStatus;
    return matchesQ && matchesStatus;
  }), [store.setOfBooks, store.companies, search, filterStatus]);

  const filteredGL = useMemo(() => store.glMasters.filter(g => {
    const q = search.toLowerCase();
    const matchesQ = !q || [g.glCode, g.glName, g.glType, g.accountGroup].join(' ').toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'All' || g.activeStatus === filterStatus;
    return matchesQ && matchesStatus;
  }), [store.glMasters, search, filterStatus]);

  const filteredAssignments = useMemo(() => store.glAssignments.filter(a => {
    const q = search.toLowerCase();
    return !q || [a.materialMasterType, a.setOfBooksId].join(' ').toLowerCase().includes(q);
  }), [store.glAssignments, search]);

  const onSaveCompany = () => {
    setError('');
    if (!companyForm.code.trim()) return setError('Company Code is mandatory.');
    const duplicate = store.companies.some(c => c.code.toLowerCase() === companyForm.code.trim().toLowerCase() && c.id !== editingCompanyId);
    if (duplicate) return setError('Company Code must be unique.');

    const now = getNow();
    if (editingCompanyId) {
      persist({
        ...store,
        companies: store.companies.map(c => c.id === editingCompanyId ? { ...c, ...companyForm, updated_at: now, updated_by: 'system' } : c)
      });
    } else {
      persist({
        ...store,
        companies: [...store.companies, { id: getId(), ...companyForm, created_at: now, updated_at: now, created_by: 'system', updated_by: 'system' }]
      });
    }
    setCompanyForm({ code: '', description: '', address: '', country: '', baseCurrency: 'INR', financialYearVariant: 'Apr-Mar', status: 'Active' });
    setEditingCompanyId(null);
  };

  const onSaveBooks = () => {
    setError('');
    if (!booksForm.companyCodeId) return setError('Company Code is required.');
    if (!booksForm.setOfBooksId.trim()) return setError('Set of Books ID is required.');
    const duplicate = store.setOfBooks.some(b => b.companyCodeId === booksForm.companyCodeId && b.setOfBooksId.toLowerCase() === booksForm.setOfBooksId.trim().toLowerCase() && b.id !== editingBooksId);
    if (duplicate) return setError('Set of Books ID must be unique per Company Code.');

    const now = getNow();
    if (editingBooksId) {
      persist({
        ...store,
        setOfBooks: store.setOfBooks.map(b => b.id === editingBooksId ? { ...b, ...booksForm, updated_at: now, updated_by: 'system' } : b)
      });
    } else {
      persist({
        ...store,
        setOfBooks: [...store.setOfBooks, { id: getId(), ...booksForm, created_at: now, updated_at: now, created_by: 'system', updated_by: 'system' }]
      });
    }
    setBooksForm({ companyCodeId: '', setOfBooksId: '', description: '', accountingStandard: 'IFRS', defaultCurrency: 'INR', activeStatus: 'Active' });
    setEditingBooksId(null);
  };

  const onSaveGL = () => {
    setError('');
    if (!glForm.setOfBooksId) return setError('Set of Books must be assigned before GL creation.');
    if (!glForm.glCode.trim()) return setError('GL Code is required.');
    const duplicate = store.glMasters.some(g => g.setOfBooksId === glForm.setOfBooksId && g.glCode.toLowerCase() === glForm.glCode.trim().toLowerCase() && g.id !== editingGlId);
    if (duplicate) return setError('GL Code must be unique within Set of Books.');

    const now = getNow();
    if (editingGlId) {
      persist({
        ...store,
        glMasters: store.glMasters.map(g => g.id === editingGlId ? { ...g, ...glForm, updated_at: now, updated_by: 'system' } : g)
      });
    } else {
      persist({
        ...store,
        glMasters: [...store.glMasters, { id: getId(), ...glForm, created_at: now, updated_at: now, created_by: 'system', updated_by: 'system' }]
      });
    }
    setGlForm({ setOfBooksId: '', glCode: '', glName: '', glType: 'Asset', accountGroup: '', postingAllowed: true, reconciliationAccount: false, activeStatus: 'Active' });
    setEditingGlId(null);
  };

  const onSaveAssignment = () => {
    setError('');
    if (!assignmentForm.setOfBooksId) return setError('Set of Books is required.');
    const duplicate = store.glAssignments.some(a => a.setOfBooksId === assignmentForm.setOfBooksId && a.materialMasterType === assignmentForm.materialMasterType && a.id !== editingAssignmentId);
    if (duplicate) return setError('Duplicate mapping not allowed for Set of Books + Material Type.');
    const typeErr = validateGlTypeCompatibility(assignmentForm);
    if (typeErr) return setError(typeErr);

    const now = getNow();
    if (editingAssignmentId) {
      persist({
        ...store,
        glAssignments: store.glAssignments.map(a => a.id === editingAssignmentId ? { ...a, ...assignmentForm, updated_at: now, updated_by: 'system' } : a)
      });
    } else {
      persist({
        ...store,
        glAssignments: [...store.glAssignments, { id: getId(), ...assignmentForm, created_at: now, updated_at: now, created_by: 'system', updated_by: 'system' }]
      });
    }
    setAssignmentForm({ setOfBooksId: '', materialMasterType: 'Trading Goods', inventoryGL: '', cogsGL: '', salesGL: '', purchaseGL: '', discountGL: '', taxGL: '' });
    setEditingAssignmentId(null);
  };

  const deleteCompany = (id: string) => {
    setError('');
    const hasBooks = store.setOfBooks.some(b => b.companyCodeId === id);
    if (hasBooks) return setError('Cannot delete Company Code while Set of Books exist or transactions are linked.');
    persist({ ...store, companies: store.companies.filter(c => c.id !== id) });
  };

  const deleteBooks = (id: string) => {
    setError('');
    const hasGL = store.glMasters.some(g => g.setOfBooksId === id);
    if (hasGL) return setError('Cannot delete Set of Books with existing GL Master records.');
    persist({ ...store, setOfBooks: store.setOfBooks.filter(b => b.id !== id) });
  };

  const deleteGL = (id: string) => {
    setError('');
    const usedInAssignment = store.glAssignments.some(a => [a.inventoryGL, a.cogsGL, a.salesGL, a.purchaseGL, a.discountGL, a.taxGL].includes(id));
    if (usedInAssignment) return setError('Cannot delete GL if used in transaction mapping.');
    persist({ ...store, glMasters: store.glMasters.filter(g => g.id !== id) });
  };

  const deleteAssignment = (id: string) => {
    persist({ ...store, glAssignments: store.glAssignments.filter(a => a.id !== id) });
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-black text-primary uppercase">Company Configuration</h2>
          <p className="text-xs text-gray-500 font-bold uppercase">Utilities & Setup → Company Configuration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setError(''); }}
              className={`px-3 py-2 border text-xs font-black uppercase ${activeTab === tab.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input className="tally-input" placeholder="Search & filter" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="tally-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'All' | Status)}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <div className="text-[11px] text-gray-500 font-bold uppercase p-2 border border-gray-200 bg-gray-50">
            Process Flow: Company → Set of Books → GL Master → GL Assignment
          </div>
        </div>

        {error && <div className="mb-3 text-xs font-black text-red-700 bg-red-50 border border-red-200 p-2">{error}</div>}

        {activeTab === 'company' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input className="tally-input" placeholder="Company Code*" value={companyForm.code} onChange={e => setCompanyForm({ ...companyForm, code: e.target.value })} />
              <input className="tally-input" placeholder="Company Description" value={companyForm.description} onChange={e => setCompanyForm({ ...companyForm, description: e.target.value })} />
              <input className="tally-input" placeholder="Address" value={companyForm.address} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })} />
              <input className="tally-input" placeholder="Country" value={companyForm.country} onChange={e => setCompanyForm({ ...companyForm, country: e.target.value })} />
              <input className="tally-input" placeholder="Base Currency" value={companyForm.baseCurrency} onChange={e => setCompanyForm({ ...companyForm, baseCurrency: e.target.value })} />
              <input className="tally-input" placeholder="Financial Year Variant" value={companyForm.financialYearVariant} onChange={e => setCompanyForm({ ...companyForm, financialYearVariant: e.target.value })} />
              <select className="tally-input" value={companyForm.status} onChange={e => setCompanyForm({ ...companyForm, status: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveCompany}>{editingCompanyId ? 'Update' : 'Add'}</button>
            </div>
            <div className="overflow-auto border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Audit</th><th className="p-2 text-left">Actions</th></tr></thead>
                <tbody>{filteredCompanies.map(c => <tr key={c.id} className="border-t"><td className="p-2">{c.code}</td><td className="p-2">{c.description}</td><td className="p-2">{c.status}</td><td className="p-2">{c.updated_by} • {new Date(c.updated_at).toLocaleString()}</td><td className="p-2 space-x-2"><button className="text-primary font-bold" onClick={() => { setCompanyForm({ code: c.code, description: c.description, address: c.address, country: c.country, baseCurrency: c.baseCurrency, financialYearVariant: c.financialYearVariant, status: c.status }); setEditingCompanyId(c.id); }}>Edit</button><button className="text-red-600 font-bold" onClick={() => deleteCompany(c.id)}>Delete</button></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'books' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={booksForm.companyCodeId} onChange={e => setBooksForm({ ...booksForm, companyCodeId: e.target.value })}><option value="">Company Code*</option>{activeCompanies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
              <input className="tally-input" placeholder="Set of Books ID*" value={booksForm.setOfBooksId} onChange={e => setBooksForm({ ...booksForm, setOfBooksId: e.target.value })} />
              <input className="tally-input" placeholder="Description" value={booksForm.description} onChange={e => setBooksForm({ ...booksForm, description: e.target.value })} />
              <input className="tally-input" placeholder="Accounting Standard" value={booksForm.accountingStandard} onChange={e => setBooksForm({ ...booksForm, accountingStandard: e.target.value })} />
              <input className="tally-input" placeholder="Default Currency" value={booksForm.defaultCurrency} onChange={e => setBooksForm({ ...booksForm, defaultCurrency: e.target.value })} />
              <select className="tally-input" value={booksForm.activeStatus} onChange={e => setBooksForm({ ...booksForm, activeStatus: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveBooks}>{editingBooksId ? 'Update' : 'Add'}</button>
            </div>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Company</th><th className="p-2 text-left">Books ID</th><th className="p-2 text-left">Standard</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredBooks.map(b => <tr key={b.id} className="border-t"><td className="p-2">{store.companies.find(c => c.id === b.companyCodeId)?.code}</td><td className="p-2">{b.setOfBooksId}</td><td className="p-2">{b.accountingStandard}</td><td className="p-2">{b.activeStatus}</td><td className="p-2 space-x-2"><button className="text-primary font-bold" onClick={() => { setBooksForm({ companyCodeId: b.companyCodeId, setOfBooksId: b.setOfBooksId, description: b.description, accountingStandard: b.accountingStandard, defaultCurrency: b.defaultCurrency, activeStatus: b.activeStatus }); setEditingBooksId(b.id); }}>Edit</button><button className="text-red-600 font-bold" onClick={() => deleteBooks(b.id)}>Delete</button></td></tr>)}</tbody></table></div>
          </div>
        )}

        {activeTab === 'gl' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={glForm.setOfBooksId} onChange={e => setGlForm({ ...glForm, setOfBooksId: e.target.value })}><option value="">Set of Books*</option>{activeBooks.map(b => <option key={b.id} value={b.id}>{b.setOfBooksId}</option>)}</select>
              <input className="tally-input" placeholder="GL Code*" value={glForm.glCode} onChange={e => setGlForm({ ...glForm, glCode: e.target.value })} />
              <input className="tally-input" placeholder="GL Name" value={glForm.glName} onChange={e => setGlForm({ ...glForm, glName: e.target.value })} />
              <select className="tally-input" value={glForm.glType} onChange={e => setGlForm({ ...glForm, glType: e.target.value as GLType })}>{glTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <input className="tally-input" placeholder="Account Group" value={glForm.accountGroup} onChange={e => setGlForm({ ...glForm, accountGroup: e.target.value })} />
              <select className="tally-input" value={String(glForm.postingAllowed)} onChange={e => setGlForm({ ...glForm, postingAllowed: e.target.value === 'true' })}><option value="true">Posting Allowed: Yes</option><option value="false">Posting Allowed: No</option></select>
              <select className="tally-input" value={String(glForm.reconciliationAccount)} onChange={e => setGlForm({ ...glForm, reconciliationAccount: e.target.value === 'true' })}><option value="false">Reconciliation: No</option><option value="true">Reconciliation: Yes</option></select>
              <select className="tally-input" value={glForm.activeStatus} onChange={e => setGlForm({ ...glForm, activeStatus: e.target.value as Status })}><option>Active</option><option>Inactive</option></select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveGL}>{editingGlId ? 'Update' : 'Add'}</button>
            </div>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Books</th><th className="p-2 text-left">GL</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Posting</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredGL.map(g => <tr key={g.id} className="border-t"><td className="p-2">{store.setOfBooks.find(b => b.id === g.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{g.glCode} - {g.glName}</td><td className="p-2">{g.glType}</td><td className="p-2">{g.postingAllowed ? 'Yes' : 'No'}</td><td className="p-2 space-x-2"><button className="text-primary font-bold" onClick={() => { setGlForm({ setOfBooksId: g.setOfBooksId, glCode: g.glCode, glName: g.glName, glType: g.glType, accountGroup: g.accountGroup, postingAllowed: g.postingAllowed, reconciliationAccount: g.reconciliationAccount, activeStatus: g.activeStatus }); setEditingGlId(g.id); }}>Edit</button><button className="text-red-600 font-bold" onClick={() => deleteGL(g.id)}>Delete</button></td></tr>)}</tbody></table></div>
          </div>
        )}

        {activeTab === 'assignment' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="tally-input" value={assignmentForm.setOfBooksId} onChange={e => setAssignmentForm({ ...assignmentForm, setOfBooksId: e.target.value })}><option value="">Set of Books*</option>{activeBooks.map(b => <option key={b.id} value={b.id}>{b.setOfBooksId}</option>)}</select>
              <select className="tally-input" value={assignmentForm.materialMasterType} onChange={e => setAssignmentForm({ ...assignmentForm, materialMasterType: e.target.value as MaterialType })}>{materialTypes.map(mt => <option key={mt}>{mt}</option>)}</select>
              <select className="tally-input" value={assignmentForm.inventoryGL} onChange={e => setAssignmentForm({ ...assignmentForm, inventoryGL: e.target.value })}><option value="">Inventory GL (Asset)</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.cogsGL} onChange={e => setAssignmentForm({ ...assignmentForm, cogsGL: e.target.value })}><option value="">COGS GL (Expense)</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.salesGL} onChange={e => setAssignmentForm({ ...assignmentForm, salesGL: e.target.value })}><option value="">Sales GL (Income)</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.purchaseGL} onChange={e => setAssignmentForm({ ...assignmentForm, purchaseGL: e.target.value })}><option value="">Purchase GL (Expense)</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.discountGL} onChange={e => setAssignmentForm({ ...assignmentForm, discountGL: e.target.value })}><option value="">Discount GL</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <select className="tally-input" value={assignmentForm.taxGL || ''} onChange={e => setAssignmentForm({ ...assignmentForm, taxGL: e.target.value })}><option value="">Tax GL (Optional)</option>{glsForSelectedBooks.map(gl => <option key={gl.id} value={gl.id}>{gl.glCode} - {gl.glName}</option>)}</select>
              <button className="bg-primary text-white text-xs font-black uppercase px-3" onClick={onSaveAssignment}>{editingAssignmentId ? 'Update' : 'Add'}</button>
            </div>
            <div className="text-[11px] text-gray-500 font-bold uppercase p-2 border border-yellow-200 bg-yellow-50">GL Assignment is mandatory before transaction posting. System reads Material Master Type and posts mapped accounts automatically.</div>
            <div className="overflow-auto border border-gray-200"><table className="min-w-full text-xs"><thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Books</th><th className="p-2 text-left">Material Type</th><th className="p-2 text-left">Inventory / COGS / Sales</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{filteredAssignments.map(a => <tr key={a.id} className="border-t"><td className="p-2">{store.setOfBooks.find(b => b.id === a.setOfBooksId)?.setOfBooksId}</td><td className="p-2">{a.materialMasterType}</td><td className="p-2">{typedGLs.get(a.inventoryGL)?.glCode} / {typedGLs.get(a.cogsGL)?.glCode} / {typedGLs.get(a.salesGL)?.glCode}</td><td className="p-2 space-x-2"><button className="text-primary font-bold" onClick={() => { setAssignmentForm({ setOfBooksId: a.setOfBooksId, materialMasterType: a.materialMasterType, inventoryGL: a.inventoryGL, cogsGL: a.cogsGL, salesGL: a.salesGL, purchaseGL: a.purchaseGL, discountGL: a.discountGL, taxGL: a.taxGL || '' }); setEditingAssignmentId(a.id); }}>Edit</button><button className="text-red-600 font-bold" onClick={() => deleteAssignment(a.id)}>Delete</button></td></tr>)}</tbody></table></div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CompanyConfiguration;
