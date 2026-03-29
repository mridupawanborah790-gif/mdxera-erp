import React, { useState } from 'react';
import { AppConfigurations } from '../types';

interface EWayLoginSetupProps {
  configurations: AppConfigurations;
  onUpdateConfigurations: (cfg: AppConfigurations) => Promise<void>;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

const EWayLoginSetup: React.FC<EWayLoginSetupProps> = ({ configurations, onUpdateConfigurations, addNotification }) => {
  const stored = (configurations as any)?.ewayLoginSetup || {};
  const [form, setForm] = useState({
    gstnUsername: stored.gstnUsername || '',
    gstnPassword: stored.gstnPassword || '',
    einvoiceUsername: stored.einvoiceUsername || '',
    einvoicePassword: stored.einvoicePassword || '',
    ewayLoginId: stored.ewayLoginId || '',
    ewayPassword: stored.ewayPassword || '',
    showCredentials: Boolean(stored.showCredentials),
    uploadDirectlyToPortal: Boolean(stored.uploadDirectlyToPortal),
  });

  const [showPwd, setShowPwd] = useState(false);

  const save = async () => {
    await onUpdateConfigurations({
      ...configurations,
      ewayLoginSetup: form,
    } as any);
    addNotification('E-Way login setup saved.', 'success');
  };

  const reset = () => {
    setForm({
      gstnUsername: '', gstnPassword: '', einvoiceUsername: '', einvoicePassword: '',
      ewayLoginId: '', ewayPassword: '', showCredentials: false, uploadDirectlyToPortal: false,
    });
  };

  const inputType = showPwd ? 'text' : 'password';

  return (
    <div className="p-3 sm:p-4 bg-[#F5F5F5] min-h-full text-[11px] font-bold uppercase tracking-wide">
      <div className="bg-white border-2 border-gray-400 shadow-sm max-w-5xl">
        <div className="bg-primary text-white px-3 py-2">Utilities & Setup → E-Way Login Setup</div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">GSTN Login</h3>
            <label className="flex flex-col gap-1">Username<input className="border border-gray-400 p-1" value={form.gstnUsername} onChange={(e) => setForm(prev => ({ ...prev, gstnUsername: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={inputType} className="border border-gray-400 p-1" value={form.gstnPassword} onChange={(e) => setForm(prev => ({ ...prev, gstnPassword: e.target.value }))} /></label>
          </section>

          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">eInvoice Login</h3>
            <label className="flex flex-col gap-1">Username<input className="border border-gray-400 p-1" value={form.einvoiceUsername} onChange={(e) => setForm(prev => ({ ...prev, einvoiceUsername: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={inputType} className="border border-gray-400 p-1" value={form.einvoicePassword} onChange={(e) => setForm(prev => ({ ...prev, einvoicePassword: e.target.value }))} /></label>
          </section>

          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">E-Way Login</h3>
            <label className="flex flex-col gap-1">Login ID<input className="border border-gray-400 p-1" value={form.ewayLoginId} onChange={(e) => setForm(prev => ({ ...prev, ewayLoginId: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={inputType} className="border border-gray-400 p-1" value={form.ewayPassword} onChange={(e) => setForm(prev => ({ ...prev, ewayPassword: e.target.value }))} /></label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={showPwd} onChange={(e) => setShowPwd(e.target.checked)} />Show/Hide password</label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={form.showCredentials} onChange={(e) => setForm(prev => ({ ...prev, showCredentials: e.target.checked }))} />Show credentials</label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={form.uploadDirectlyToPortal} onChange={(e) => setForm(prev => ({ ...prev, uploadDirectlyToPortal: e.target.checked }))} />Upload directly to portal</label>
          </section>
        </div>

        <div className="px-3 pb-3 flex justify-end gap-2">
          <button className="border border-blue-700 bg-blue-700 text-white px-3 py-1" onClick={save}>Save</button>
          <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={reset}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default EWayLoginSetup;
