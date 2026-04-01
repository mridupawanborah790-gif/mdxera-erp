import React, { useMemo, useState } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import type { DoctorMaster } from '../types';
import { fuzzyMatch } from '../utils/search';

interface DoctorsMasterProps {
  doctors: DoctorMaster[];
  onSaveDoctor: (doctor: DoctorMaster, isUpdate: boolean) => Promise<void>;
  onToggleDoctorStatus: (doctor: DoctorMaster, nextActive: boolean) => Promise<void>;
}

const emptyDoctor: DoctorMaster = {
  id: '',
  organization_id: '',
  doctorCode: '',
  name: '',
  qualification: '',
  specialization: '',
  registrationNo: '',
  mobile: '',
  alternateContact: '',
  email: '',
  clinicName: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  commissionPercent: 0,
  is_active: true,
  notes: '',
};

const DoctorsMaster: React.FC<DoctorsMasterProps> = ({ doctors, onSaveDoctor, onToggleDoctorStatus }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorMaster | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<DoctorMaster>(emptyDoctor);

  const filteredDoctors = useMemo(() => {
    return doctors
      .filter(d => !activeOnly || d.is_active !== false)
      .filter(d => !specializationFilter || (d.specialization || '').toLowerCase() === specializationFilter.toLowerCase())
      .filter(d => {
        return (
          fuzzyMatch(d.name || '', searchTerm) ||
          fuzzyMatch(d.mobile || '', searchTerm) ||
          fuzzyMatch(d.specialization || '', searchTerm)
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [activeOnly, doctors, searchTerm, specializationFilter]);

  const specializations = useMemo(() => {
    return Array.from(new Set(doctors.map(d => (d.specialization || '').trim()).filter(Boolean))).sort();
  }, [doctors]);

  const openCreateModal = () => {
    setSelectedDoctor(null);
    setFormState({ ...emptyDoctor, id: crypto.randomUUID(), is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (doctor: DoctorMaster) => {
    setSelectedDoctor(doctor);
    setFormState({ ...emptyDoctor, ...doctor });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name?.trim()) {
      alert('Doctor Name is required.');
      return;
    }
    await onSaveDoctor({ ...formState, name: formState.name.trim() }, !!selectedDoctor);
    setIsModalOpen(false);
  };

  return (
    <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
      <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest">Other Master → Doctor&apos;s Master</span>
        <span className="text-[10px] font-black uppercase text-accent">Total: {doctors.length}</span>
      </div>

      <div className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
        <Card className="p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search Name / Mobile / Specialization"
            className="md:col-span-2 h-9 border border-gray-400 p-2 text-xs font-bold uppercase outline-none focus:bg-yellow-50"
          />
          <select
            value={specializationFilter}
            onChange={e => setSpecializationFilter(e.target.value)}
            className="h-9 border border-gray-400 p-2 text-xs font-bold uppercase outline-none"
          >
            <option value="">All Specialization</option>
            {specializations.map(spec => <option key={spec} value={spec}>{spec}</option>)}
          </select>
          <label className="h-9 border border-gray-300 px-3 flex items-center gap-2 text-xs font-bold uppercase">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <button onClick={openCreateModal} className="h-9 bg-primary text-white text-xs font-black uppercase">+ Add Doctor</button>
        </Card>

        <Card className="flex-1 overflow-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 text-left">Doctor Name</th>
                <th className="p-2 text-left">Mobile</th>
                <th className="p-2 text-left">Specialization</th>
                <th className="p-2 text-left">Area</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.map(doc => (
                <tr key={doc.id} className="border-t border-gray-200">
                  <td className="p-2 font-bold">{doc.name}</td>
                  <td className="p-2">{doc.mobile || '-'}</td>
                  <td className="p-2">{doc.specialization || '-'}</td>
                  <td className="p-2">{doc.area || '-'}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 text-[10px] font-black uppercase ${doc.is_active === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {doc.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="p-2 text-right space-x-2">
                    <button onClick={() => openEditModal(doc)} className="px-2 py-1 border border-gray-400 font-bold uppercase">Edit</button>
                    <button
                      onClick={() => onToggleDoctorStatus(doc, doc.is_active === false)}
                      className="px-2 py-1 border border-gray-400 font-bold uppercase"
                    >
                      {doc.is_active === false ? 'Enable' : 'Disable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedDoctor ? 'Edit Doctor' : 'Add Doctor'}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {[
              ['Doctor Name*', 'name'], ['Doctor Code', 'doctorCode'], ['Qualification', 'qualification'], ['Specialization', 'specialization'],
              ['Registration No', 'registrationNo'], ['Mobile', 'mobile'], ['Alternate Contact', 'alternateContact'], ['Email', 'email'],
              ['Clinic/Hospital Name', 'clinicName'], ['Area', 'area'], ['City', 'city'], ['State', 'state'], ['Pincode', 'pincode'],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="block mb-1 font-bold uppercase text-[10px] text-gray-600">{label}</label>
                <input
                  value={String((formState as any)[key] || '')}
                  onChange={e => setFormState(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full h-9 border border-gray-300 p-2 outline-none focus:bg-yellow-50"
                />
              </div>
            ))}
            <div>
              <label className="block mb-1 font-bold uppercase text-[10px] text-gray-600">Commission %</label>
              <input
                type="number"
                value={Number(formState.commissionPercent || 0)}
                onChange={e => setFormState(prev => ({ ...prev, commissionPercent: Number(e.target.value || 0) }))}
                className="w-full h-9 border border-gray-300 p-2 outline-none focus:bg-yellow-50"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={formState.is_active !== false}
                onChange={e => setFormState(prev => ({ ...prev, is_active: e.target.checked }))}
              />
              <span className="font-bold uppercase">Is Active</span>
            </div>
            <div className="md:col-span-2">
              <label className="block mb-1 font-bold uppercase text-[10px] text-gray-600">Notes</label>
              <textarea
                value={formState.notes || ''}
                onChange={e => setFormState(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full h-20 border border-gray-300 p-2 outline-none focus:bg-yellow-50"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-400 text-xs font-bold uppercase">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-primary text-white text-xs font-black uppercase">{selectedDoctor ? 'Update' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </main>
  );
};

export default DoctorsMaster;
