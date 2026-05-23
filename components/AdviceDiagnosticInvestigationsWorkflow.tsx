import React, { useMemo, useState } from 'react';
import { createDiagnosticBillingDraft, dispatchDiagnosticReferral, generateDiagnosticReferralSlip, type InvestigationTest, type PatientContext } from '../services/diagnosticWorkflowService';

const departmentOrder = ['LAB', 'USG', 'X-RAY', 'ECG', 'PACKAGE'] as const;

const AdviceDiagnosticInvestigationsWorkflow: React.FC = () => {
  const [selectedTests, setSelectedTests] = useState<InvestigationTest[]>([]);
  const [loadingAction, setLoadingAction] = useState<'referral' | 'billing' | 'dispatch' | null>(null);
  const [referralPreviewUrl, setReferralPreviewUrl] = useState<string | null>(null);
  const [referralId, setReferralId] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<'Not Sent' | 'Pending Payment'>('Not Sent');
  const [queueStatus, setQueueStatus] = useState('Not Dispatched');
  const [referralStatus, setReferralStatus] = useState('Draft');
  const [toast, setToast] = useState<string | null>(null);

  const patientContext: PatientContext = {
    patientId: 'P-10221', patientName: 'Demo Patient', age: 42, gender: 'Female',
    doctorId: 'D-771', doctorName: 'Dr. Vivek Sharma', visitDateTime: new Date().toISOString(),
    priority: 'Normal', referralNotes: 'Please process with fasting protocol where required.'
  };

  const totalAmount = useMemo(() => selectedTests.reduce((acc, it) => acc + it.price, 0), [selectedTests]);

  const toggle = (test: InvestigationTest) => {
    setSelectedTests((prev) => prev.some((it) => it.code === test.code) ? prev.filter((it) => it.code !== test.code) : [...prev, test]);
  };

  const runAction = async (action: 'referral' | 'billing' | 'dispatch') => {
    if (selectedTests.length === 0) {
      setToast('Please select at least one investigation test.');
      return;
    }
    try {
      setLoadingAction(action);
      if (action === 'referral') {
        const res = await generateDiagnosticReferralSlip(patientContext, selectedTests);
        setReferralId(res.referralId);
        setReferralPreviewUrl(res.previewUrl);
        setReferralStatus(res.status);
        setToast('Referral slip generated successfully.');
      }
      if (action === 'billing') {
        await createDiagnosticBillingDraft(patientContext, selectedTests);
        setBillingStatus('Pending Payment');
        setToast('Diagnostic investigations successfully transferred to Billing Department.');
      }
      if (action === 'dispatch') {
        if (!window.confirm('Dispatch selected investigations to diagnostics departments?')) return;
        const res = await dispatchDiagnosticReferral(patientContext, selectedTests);
        setQueueStatus(`Dispatched (${res.departmentQueues.length} departments)`);
        setReferralStatus('Diagnostics Referred');
        setToast('Diagnostics referral dispatched successfully and queues are live.');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setLoadingAction(null);
      window.setTimeout(() => setToast(null), 4000);
    }
  };

  const availableTests: InvestigationTest[] = [
    { code: 'CBC', name: 'Complete Blood Count', department: 'LAB', price: 350, estimatedMinutes: 120 },
    { code: 'LFT', name: 'Liver Function Test', department: 'LAB', price: 700, estimatedMinutes: 360 },
    { code: 'USG-AB', name: 'USG Abdomen', department: 'USG', price: 1500, estimatedMinutes: 90 },
    { code: 'XR-CHEST', name: 'X-Ray Chest', department: 'X-RAY', price: 500, estimatedMinutes: 45 },
    { code: 'ECG-12', name: '12 Lead ECG', department: 'ECG', price: 300, estimatedMinutes: 30 },
  ];

  return <div className="fixed inset-0 bg-slate-100 p-6 overflow-auto">
    <div className="max-w-7xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">OPD Process Followup → Advice Diagnostic Investigations</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl bg-white shadow p-4">
          <h2 className="font-semibold mb-3">Select Investigations</h2>
          <div className="space-y-2">{availableTests.map((test) => <label key={test.code} className="flex items-center justify-between rounded-lg border p-3">
            <span>{test.name} <span className="text-xs text-slate-500">({test.department})</span></span>
            <input type="checkbox" checked={selectedTests.some((it) => it.code === test.code)} onChange={() => toggle(test)} />
          </label>)}</div>
        </div>
        <div className="rounded-xl bg-white shadow p-4">
          <h2 className="font-semibold mb-3">Real-time Summary</h2>
          <ul className="text-sm space-y-2">
            <li>Total Tests: {selectedTests.length}</li><li>Total Amount: ₹{totalAmount.toFixed(2)}</li>
            <li>Referral Status: {referralStatus}</li><li>Billing Status: {billingStatus}</li><li>Queue Status: {queueStatus}</li>
          </ul>
        </div>
      </div>
      <div className="sticky bottom-3 rounded-xl bg-white shadow p-4 flex gap-3">
        <button disabled={!selectedTests.length || !!loadingAction} onClick={() => runAction('referral')} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">{loadingAction === 'referral' ? 'Generating…' : 'Generate Referral Slip'}</button>
        <button disabled={!selectedTests.length || !!loadingAction} onClick={() => runAction('billing')} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">{loadingAction === 'billing' ? 'Sending…' : 'Send to Billing'}</button>
        <button disabled={!selectedTests.length || !!loadingAction} onClick={() => runAction('dispatch')} className="px-4 py-2 rounded bg-violet-600 text-white disabled:opacity-50">{loadingAction === 'dispatch' ? 'Dispatching…' : 'Dispatch Diagnostics Referral'}</button>
      </div>
      {referralPreviewUrl && <div className="rounded-xl bg-white shadow p-4"><p className="font-semibold">Referral Ready: {referralId}</p><a className="text-blue-600 underline" href={referralPreviewUrl} target="_blank" rel="noreferrer">Open print preview / PDF</a></div>}
      {toast && <div className="fixed top-4 right-4 bg-slate-900 text-white px-4 py-2 rounded">{toast}</div>}
    </div>
  </div>;
};

export default AdviceDiagnosticInvestigationsWorkflow;
