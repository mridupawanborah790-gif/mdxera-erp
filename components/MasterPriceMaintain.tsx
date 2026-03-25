import React, { useMemo, useState } from 'react';
import type { MasterPriceMaintainRecord, Medicine, RegisteredPharmacy } from '../types';

interface MasterPriceMaintainProps {
  medicines: Medicine[];
  currentUser: RegisteredPharmacy | null;
  onUpdateMedicine: (medicine: Medicine) => void;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const isSupportedSchemeFormat = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^\d+(?:\.\d+)?\s*\+\s*\d+(?:\.\d+)?$/.test(normalized)) return true;
  if (/^\d+(?:\.\d+)?\s*in\s*\d+(?:\.\d+)?$/.test(normalized)) return true;
  return false;
};

const isOverlapping = (incoming: MasterPriceMaintainRecord, records: MasterPriceMaintainRecord[]) => {
  if (incoming.status !== 'active') return false;
  const startA = new Date(incoming.validFrom).getTime();
  const endA = new Date(incoming.validTo).getTime();
  return records.some(record => {
    if (record.status !== 'active') return false;
    if (record.id === incoming.id) return false;
    const startB = new Date(record.validFrom).getTime();
    const endB = new Date(record.validTo).getTime();
    return startA <= endB && startB <= endA;
  });
};

const MasterPriceMaintain: React.FC<MasterPriceMaintainProps> = ({ medicines, currentUser, onUpdateMedicine, addNotification }) => {
  const [materialSearch, setMaterialSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [rateTypeFilter, setRateTypeFilter] = useState<'all' | 'rateA' | 'rateB' | 'rateC'>('all');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  const editableTemplate = (medicine: Medicine): MasterPriceMaintainRecord => ({
    id: crypto.randomUUID(),
    materialCode: medicine.materialCode,
    materialName: medicine.name,
    mrp: Number(medicine.mrp || 0),
    rateA: Number(medicine.rateA || 0),
    rateB: Number(medicine.rateB || 0),
    rateC: Number(medicine.rateC || 0),
    defaultDiscountPercent: Number(medicine.defaultDiscountPercent || 0),
    schemePercent: Number(medicine.schemePercent || 0),
    schemeType: medicine.schemeCalculationBasis || medicine.schemeType || 'after_discount',
    schemeCalculationBasis: medicine.schemeCalculationBasis || medicine.schemeType || 'after_discount',
    schemeFormat: medicine.schemeFormat || '',
    schemeRate: Number(medicine.schemeRate || 0),
    validFrom: todayIso(),
    validTo: '2099-12-31',
    status: 'active',
    remarks: '',
    lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
    lastUpdatedOn: new Date().toISOString(),
    auditTrail: []
  });

  const [draft, setDraft] = useState<MasterPriceMaintainRecord | null>(null);

  const filteredMedicines = useMemo(() => {
    return medicines.filter(m => {
      const search = materialSearch.trim().toLowerCase();
      const matchesSearch = !search || m.name.toLowerCase().includes(search) || m.materialCode.toLowerCase().includes(search);
      const current = (m.masterPriceMaintains || []).find(r => r.status === 'active' && todayIso() >= r.validFrom && todayIso() <= r.validTo);
      const matchesStatus = statusFilter === 'all' || (current?.status || 'inactive') === statusFilter;
      const matchesRateType = rateTypeFilter === 'all' || Number(current?.[rateTypeFilter] || m[rateTypeFilter] || 0) > 0;
      return matchesSearch && matchesStatus && matchesRateType;
    });
  }, [medicines, materialSearch, statusFilter, rateTypeFilter]);

  const startEdit = (medicine: Medicine) => {
    setEditingMaterialId(medicine.id);
    setDraft(editableTemplate(medicine));
  };

  const saveDraft = () => {
    if (!editingMaterialId || !draft) return;

    if (!draft.materialCode || !draft.materialName) {
      addNotification('Material is mandatory.', 'error');
      return;
    }
    if (!draft.validFrom || !draft.validTo || new Date(draft.validTo) < new Date(draft.validFrom)) {
      addNotification('Valid dates are required and Valid To must be >= Valid From.', 'error');
      return;
    }
    if ([draft.mrp, draft.rateA, draft.rateB, draft.rateC].some(v => Number(v) < 0)) {
      addNotification('Rates and MRP must be >= 0.', 'error');
      return;
    }
    if (draft.defaultDiscountPercent < 0 || draft.defaultDiscountPercent > 100 || draft.schemePercent < 0 || draft.schemePercent > 100) {
      addNotification('Discount and Scheme must be between 0 and 100.', 'error');
      return;
    }
    if (Number(draft.schemeRate || 0) < 0) {
      addNotification('Scheme Rate must be >= 0.', 'error');
      return;
    }

    const normalizedSchemeFormat = String(draft.schemeFormat || '').trim();
    const hasSchemeData = draft.schemePercent > 0 || Number(draft.schemeRate || 0) > 0 || normalizedSchemeFormat.length > 0;
    if (hasSchemeData && !(draft.schemeCalculationBasis || draft.schemeType)) {
      addNotification('Scheme Calculation Basis is required when scheme is maintained.', 'error');
      return;
    }
    if (normalizedSchemeFormat && !isSupportedSchemeFormat(normalizedSchemeFormat)) {
      addNotification('Scheme Format supports patterns like "10+1" or "1 in 10".', 'error');
      return;
    }

    const medicine = medicines.find(m => m.id === editingMaterialId);
    if (!medicine) return;

    const existingRecords = medicine.masterPriceMaintains || [];
    if (isOverlapping(draft, existingRecords)) {
      addNotification('Overlapping validity detected for this material. Please correct date range.', 'error');
      return;
    }

    const nextRecords = [...existingRecords, {
      ...draft,
      lastUpdatedBy: currentUser?.full_name || currentUser?.email || 'System',
      lastUpdatedOn: new Date().toISOString(),
      auditTrail: [
        ...(draft.auditTrail || []),
        {
          changedAt: new Date().toISOString(),
          changedBy: currentUser?.full_name || currentUser?.email,
          sourceModule: 'Master Price Maintain' as const,
          field: 'pricing_record',
          oldValue: 'N/A',
          newValue: `MRP:${draft.mrp} RateA:${draft.rateA} RateB:${draft.rateB} RateC:${draft.rateC} Disc:${draft.defaultDiscountPercent} Sch:${draft.schemePercent} Basis:${draft.schemeCalculationBasis || draft.schemeType} Format:${normalizedSchemeFormat || '-'} SchRate:${Number(draft.schemeRate || 0)}`
        }
      ]
    }];

    onUpdateMedicine({
      ...medicine,
      mrp: draft.mrp.toFixed(2),
      rateA: draft.rateA,
      rateB: draft.rateB,
      rateC: draft.rateC,
      defaultDiscountPercent: draft.defaultDiscountPercent,
      schemePercent: draft.schemePercent,
      schemeType: draft.schemeCalculationBasis || draft.schemeType,
      schemeCalculationBasis: draft.schemeCalculationBasis || draft.schemeType,
      schemeFormat: normalizedSchemeFormat || undefined,
      schemeRate: Number(draft.schemeRate || 0),
      masterPriceMaintains: nextRecords
    });

    addNotification('Master Price Maintain saved and synced.', 'success');
    setEditingMaterialId(null);
    setDraft(null);
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-2 p-2 border border-gray-300 bg-white">
        <input className="border border-gray-300 px-2 py-1 text-sm" placeholder="Material search" value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} />
        <select className="border border-gray-300 px-2 py-1 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className="border border-gray-300 px-2 py-1 text-sm" value={rateTypeFilter} onChange={e => setRateTypeFilter(e.target.value as any)}>
          <option value="all">Rate Type: All</option>
          <option value="rateA">Rate A</option>
          <option value="rateB">Rate B</option>
          <option value="rateC">Rate C</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto bg-white border border-gray-300">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-2 text-left">Material Code</th><th className="p-2 text-left">Material Name</th><th className="p-2 text-right">MRP</th><th className="p-2 text-right">Rate A</th><th className="p-2 text-right">Rate B</th><th className="p-2 text-right">Rate C</th><th className="p-2 text-right">Disc %</th><th className="p-2 text-right">Sch %</th><th className="p-2 text-left">Scheme Basis</th><th className="p-2 text-left">Scheme Format</th><th className="p-2 text-right">Scheme Rate</th><th className="p-2 text-left">Valid From</th><th className="p-2 text-left">Valid To</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMedicines.map(med => {
              const active = (med.masterPriceMaintains || []).find(r => r.status === 'active' && todayIso() >= r.validFrom && todayIso() <= r.validTo);
              const row = active || editableTemplate(med);
              const isEditing = editingMaterialId === med.id && draft;
              const value = isEditing ? draft : row;

              return (
                <tr key={med.id} className="border-t border-gray-200">
                  <td className="p-2">{med.materialCode}</td>
                  <td className="p-2">{med.name}</td>
                  {(['mrp', 'rateA', 'rateB', 'rateC', 'defaultDiscountPercent', 'schemePercent'] as const).map(field => (
                    <td key={field} className="p-2 text-right">
                      {isEditing ? <input type="number" min={0} className="w-20 border border-gray-300 px-1 py-0.5 text-right" value={Number((value as any)[field] || 0)} onChange={e => setDraft(prev => prev ? ({ ...prev, [field]: Number(e.target.value) }) : prev)} /> : Number((value as any)[field] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td className="p-2">
                    {isEditing ? (
                      <select className="border border-gray-300 px-1 py-0.5 text-xs" value={value.schemeCalculationBasis || value.schemeType || 'after_discount'} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeCalculationBasis: e.target.value as 'after_discount' | 'before_discount', schemeType: e.target.value as 'after_discount' | 'before_discount' }) : prev)}>
                        <option value="after_discount">After Disc% (Recommended)</option>
                        <option value="before_discount">At Same Level / Before Discount</option>
                      </select>
                    ) : ((value.schemeCalculationBasis || value.schemeType) === 'before_discount' ? 'Before Discount' : 'After Disc%')}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input type="text" className="w-28 border border-gray-300 px-1 py-0.5 text-xs uppercase" value={value.schemeFormat || ''} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeFormat: e.target.value }) : prev)} placeholder="10+1 / 1 in 10" />
                    ) : (value.schemeFormat || '—')}
                  </td>
                  <td className="p-2 text-right">
                    {isEditing ? (
                      <input type="number" min={0} className="w-20 border border-gray-300 px-1 py-0.5 text-right" value={Number(value.schemeRate || 0)} onChange={e => setDraft(prev => prev ? ({ ...prev, schemeRate: Number(e.target.value) }) : prev)} />
                    ) : Number(value.schemeRate || 0).toFixed(2)}
                  </td>
                  <td className="p-2">{isEditing ? <input type="date" className="border border-gray-300 px-1 py-0.5" value={value.validFrom} onChange={e => setDraft(prev => prev ? ({ ...prev, validFrom: e.target.value }) : prev)} /> : value.validFrom}</td>
                  <td className="p-2">{isEditing ? <input type="date" className="border border-gray-300 px-1 py-0.5" value={value.validTo} onChange={e => setDraft(prev => prev ? ({ ...prev, validTo: e.target.value }) : prev)} /> : value.validTo}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <select className="border border-gray-300 px-1 py-0.5" value={value.status} onChange={e => setDraft(prev => prev ? ({ ...prev, status: e.target.value as 'active' | 'inactive' }) : prev)}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (value.status === 'active' ? 'Active' : 'Inactive')}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <div className="flex gap-1"><button className="px-2 py-1 bg-primary text-white" onClick={saveDraft}>Save</button><button className="px-2 py-1 border border-gray-300" onClick={() => { setEditingMaterialId(null); setDraft(null); }}>Cancel</button></div>
                    ) : <button className="px-2 py-1 border border-gray-300" onClick={() => startEdit(med)}>Edit</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MasterPriceMaintain;
