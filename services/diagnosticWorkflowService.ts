export type Department = 'LAB' | 'USG' | 'X-RAY' | 'ECG' | 'PACKAGE';

export interface InvestigationTest {
  code: string;
  name: string;
  department: Department;
  price: number;
  estimatedMinutes: number;
}

export interface PatientContext {
  patientId: string;
  patientName: string;
  age: number;
  gender: string;
  doctorId: string;
  doctorName: string;
  visitDateTime: string;
  priority: 'Normal' | 'Urgent' | 'Stat';
  referralNotes?: string;
}

const uid = (prefix: string) => `${prefix}-${new Date().getFullYear()}-OPD-${Math.floor(100000 + Math.random() * 900000)}`;

export async function generateDiagnosticReferralSlip(context: PatientContext, tests: InvestigationTest[]) {
  if (!tests.length) throw new Error('Select at least one diagnostic test.');

  const referralId = uid('REF');
  const estimatedMinutes = Math.max(...tests.map((x) => x.estimatedMinutes));
  const payload = {
    referralId,
    referralStatus: 'Generated',
    estimatedReportTime: new Date(Date.now() + estimatedMinutes * 60_000).toISOString(),
    context,
    tests,
    features: ['print', 'downloadPdf', 'shareWhatsApp', 'sendSmsLink'],
    qrPayload: referralId
  };

  const previewUrl = `/api/diagnostics/referrals/${referralId}/preview`;
  return { referralId, previewUrl, status: payload.referralStatus, payload };
}

export async function createDiagnosticBillingDraft(context: PatientContext, tests: InvestigationTest[]) {
  if (!tests.length) throw new Error('Select at least one investigation before billing.');

  const grouped = tests.reduce<Record<Department, InvestigationTest[]>>((acc, test) => {
    if (!acc[test.department]) acc[test.department] = [] as InvestigationTest[];
    acc[test.department].push(test);
    return acc;
  }, {} as Record<Department, InvestigationTest[]>);

  const subtotal = tests.reduce((sum, test) => sum + test.price, 0);
  const discount = subtotal > 4000 ? subtotal * 0.05 : 0;
  const taxable = subtotal - discount;
  const tax = taxable * 0.18;

  return {
    invoiceNo: uid('INV'),
    billingStatus: 'Pending Payment',
    subtotal,
    discount,
    tax,
    finalAmount: taxable + tax,
    grouped,
    queue: 'Billing Queue',
    patientId: context.patientId
  };
}

export async function dispatchDiagnosticReferral(context: PatientContext, tests: InvestigationTest[]) {
  if (!context.patientId || !context.doctorId) throw new Error('Patient details and assigned doctor are mandatory.');
  if (!tests.length) throw new Error('At least one selected test is required for dispatch.');

  const grouped = tests.reduce<Record<string, InvestigationTest[]>>((acc, test) => {
    if (!acc[test.department]) acc[test.department] = [];
    acc[test.department].push(test);
    return acc;
  }, {});

  const departmentQueues = Object.entries(grouped).map(([department, selected]) => ({
    department,
    queueToken: `${department}-${Math.floor(10 + Math.random() * 90)}`,
    workflowId: uid(`WF-${department}`),
    waitingCount: Math.floor(Math.random() * 12),
    status: 'Awaiting Sample / Scan',
    etaMinutes: Math.max(...selected.map((test) => test.estimatedMinutes))
  }));

  return {
    opdWorkflowStatus: 'Diagnostics Referred',
    departmentQueues,
    notificationPayload: {
      sms: `Welcome to Rx Medimart. Your diagnostic investigations have been registered successfully. Referral ID: ${uid('REF')}`,
      whatsapp: true,
      internalDepartmentNotification: true
    }
  };
}
