import React, { useMemo, useState } from 'react';
import { AppConfigurations, RegisteredPharmacy } from '../types';
import { buildSecuredEWaySetup, getEWayCredentials, verifyPortalCredentials } from '../utils/ewayAuth';

interface EWayLoginSetupProps {
  configurations: AppConfigurations;
  currentUser: RegisteredPharmacy | null;
  onUpdateConfigurations: (cfg: AppConfigurations) => Promise<void>;
  addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

const EWayLoginSetup: React.FC<EWayLoginSetupProps> = ({ configurations, currentUser, onUpdateConfigurations, addNotification }) => {
  const stored = configurations.ewayLoginSetup || {};
  const resolvedCredentials = useMemo(() => getEWayCredentials(configurations, currentUser?.organization_id), [configurations, currentUser?.organization_id]);

  const [form, setForm] = useState({
    gstnUsername: stored.gstnUsername || '',
    gstnPassword: stored.gstnPassword || '',
    einvoiceUsername: stored.einvoiceUsername || '',
    einvoicePassword: stored.einvoicePassword || '',
    ewayLoginId: resolvedCredentials.ewayLoginId,
    ewayPassword: resolvedCredentials.ewayPassword,
    showCredentials: Boolean(stored.showCredentials),
    uploadDirectlyToPortal: Boolean(stored.uploadDirectlyToPortal),
  });

  const [showPwd, setShowPwd] = useState({ gstn: false, einvoice: false, eway: false });
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const save = async () => {
    if (!form.ewayLoginId.trim() || !form.ewayPassword.trim()) {
      addNotification('Missing credentials', 'warning');
      return;
    }

    setSaving(true);
    try {
      const nextSetup = buildSecuredEWaySetup({
        organizationId: currentUser?.organization_id,
        currentSetup: {
          ...stored,
          gstnUsername: form.gstnUsername,
          einvoiceUsername: form.einvoiceUsername,
          showCredentials: form.showCredentials,
          uploadDirectlyToPortal: form.uploadDirectlyToPortal,
          credentialStatus: 'Configured',
          lastError: '',
        },
        rawValues: {
          ewayLoginId: form.ewayLoginId.trim(),
          ewayPassword: form.ewayPassword,
          gstnPassword: form.gstnPassword,
          einvoicePassword: form.einvoicePassword,
        },
      });

      await onUpdateConfigurations({
        ...configurations,
        ewayLoginSetup: nextSetup,
      });

      addNotification('E-Way login setup saved.', 'success');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm({
      gstnUsername: stored.gstnUsername || '',
      gstnPassword: '',
      einvoiceUsername: stored.einvoiceUsername || '',
      einvoicePassword: '',
      ewayLoginId: resolvedCredentials.ewayLoginId,
      ewayPassword: resolvedCredentials.ewayPassword,
      showCredentials: Boolean(stored.showCredentials),
      uploadDirectlyToPortal: Boolean(stored.uploadDirectlyToPortal),
    });
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const check = await verifyPortalCredentials({
        ewayLoginId: form.ewayLoginId,
        ewayPassword: form.ewayPassword,
      });

      const verifiedAt = check.ok ? new Date().toISOString() : undefined;
      const nextSetup = {
        ...stored,
        gstnUsername: form.gstnUsername,
        einvoiceUsername: form.einvoiceUsername,
        showCredentials: form.showCredentials,
        uploadDirectlyToPortal: form.uploadDirectlyToPortal,
        credentialStatus: check.ok ? 'Configured' : (check.message === 'Missing credentials' ? 'Missing' : 'Invalid'),
        portalLoginStatus: check.ok ? 'Verified' : 'Failed',
        loginVerifiedOn: verifiedAt || stored.loginVerifiedOn,
        lastCheckedOn: new Date().toISOString(),
        lastError: check.ok ? '' : check.message,
      } as AppConfigurations['ewayLoginSetup'];

      await onUpdateConfigurations({
        ...configurations,
        ewayLoginSetup: buildSecuredEWaySetup({
          organizationId: currentUser?.organization_id,
          currentSetup: nextSetup,
          rawValues: {
            ewayLoginId: form.ewayLoginId.trim(),
            ewayPassword: form.ewayPassword,
            gstnPassword: form.gstnPassword,
            einvoicePassword: form.einvoicePassword,
          },
        }),
      });

      addNotification(check.message, check.ok ? 'success' : 'error');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-[#F5F5F5] min-h-full text-[11px] font-bold uppercase tracking-wide">
      <div className="bg-white border-2 border-gray-400 shadow-sm max-w-5xl">
        <div className="bg-primary text-white px-3 py-2">Utilities & Setup → E-Way Login Setup</div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">GSTN Login Details</h3>
            <label className="flex flex-col gap-1">User Name<input className="border border-gray-400 p-1" value={form.gstnUsername} onChange={(e) => setForm(prev => ({ ...prev, gstnUsername: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={showPwd.gstn ? 'text' : 'password'} className="border border-gray-400 p-1" value={form.gstnPassword} onChange={(e) => setForm(prev => ({ ...prev, gstnPassword: e.target.value }))} /></label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={showPwd.gstn} onChange={(e) => setShowPwd(prev => ({ ...prev, gstn: e.target.checked }))} />Show / Hide password</label>
          </section>

          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">eInvoice Login Credentials</h3>
            <label className="flex flex-col gap-1">User Name<input className="border border-gray-400 p-1" value={form.einvoiceUsername} onChange={(e) => setForm(prev => ({ ...prev, einvoiceUsername: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={showPwd.einvoice ? 'text' : 'password'} className="border border-gray-400 p-1" value={form.einvoicePassword} onChange={(e) => setForm(prev => ({ ...prev, einvoicePassword: e.target.value }))} /></label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={showPwd.einvoice} onChange={(e) => setShowPwd(prev => ({ ...prev, einvoice: e.target.checked }))} />Show / Hide password</label>
          </section>

          <section className="border border-gray-400 p-2 space-y-2">
            <h3 className="bg-gray-100 border p-1 text-[10px]">EWAY Login Details</h3>
            <label className="flex flex-col gap-1">Login ID<input className="border border-gray-400 p-1" value={form.ewayLoginId} onChange={(e) => setForm(prev => ({ ...prev, ewayLoginId: e.target.value }))} /></label>
            <label className="flex flex-col gap-1">Password<input type={showPwd.eway ? 'text' : 'password'} className="border border-gray-400 p-1" value={form.ewayPassword} onChange={(e) => setForm(prev => ({ ...prev, ewayPassword: e.target.value }))} /></label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={showPwd.eway} onChange={(e) => setShowPwd(prev => ({ ...prev, eway: e.target.checked }))} />Show / Hide password</label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={form.showCredentials} onChange={(e) => setForm(prev => ({ ...prev, showCredentials: e.target.checked }))} />By default show Login ID & Password</label>
            <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={form.uploadDirectlyToPortal} onChange={(e) => setForm(prev => ({ ...prev, uploadDirectlyToPortal: e.target.checked }))} />Upload direct on E-Way portal</label>
          </section>
        </div>

        <div className="px-3 pb-3 flex justify-end gap-2">
          <button className="border border-emerald-700 bg-emerald-700 text-white px-3 py-1 disabled:opacity-50" disabled={verifying} onClick={handleVerify}>{verifying ? 'Verifying...' : 'Test Login / Verify Credentials'}</button>
          <button className="border border-blue-700 bg-blue-700 text-white px-3 py-1 disabled:opacity-50" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="border border-gray-600 bg-gray-100 px-3 py-1" onClick={reset}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default EWayLoginSetup;
