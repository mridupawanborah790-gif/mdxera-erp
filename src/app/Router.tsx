import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { usePermissions } from '@core/hooks/usePermissions';

// Lazy-load every module page so the initial bundle stays small
const Dashboard       = lazy(() => import('@modules/pos/components/Dashboard'));
const POS             = lazy(() => import('@modules/pos/components/POS'));
const SalesHistory    = lazy(() => import('@modules/sales/components/SalesHistory'));
const ManualSalesEntry= lazy(() => import('@modules/sales/components/ManualSalesEntry'));
const Returns         = lazy(() => import('@modules/sales/components/Returns'));
const SalesChallans   = lazy(() => import('@modules/sales/components/SalesChallans'));

const PurchaseForm    = lazy(() => import('@modules/purchase/components/PurchaseForm'));
const PurchaseHistory = lazy(() => import('@modules/purchase/components/PurchaseHistory'));
const PurchaseOrders  = lazy(() => import('@modules/purchase/components/PurchaseOrders'));
const DeliveryChallans= lazy(() => import('@modules/purchase/components/DeliveryChallans'));
const ManualPurchase  = lazy(() => import('@modules/purchase/components/ManualPurchase'));

const Inventory       = lazy(() => import('@modules/inventory/components/Inventory'));
const PhysicalInventory= lazy(() => import('@modules/inventory/components/PhysicalInventory'));
const MaterialMaster  = lazy(() => import('@modules/inventory/components/MaterialMaster'));
const SubstituteFinder= lazy(() => import('@modules/inventory/components/SubstituteFinder'));

const Customers       = lazy(() => import('@modules/customers/components/Customers'));
const AccountReceivable= lazy(() => import('@modules/customers/components/AccountReceivable'));

const Suppliers       = lazy(() => import('@modules/suppliers/components/Suppliers'));
const DoctorsMaster   = lazy(() => import('@modules/suppliers/components/DoctorsMaster'));
const AccountPayable  = lazy(() => import('@modules/suppliers/components/AccountPayable'));

const NewJournalEntry = lazy(() => import('@modules/accounting/components/NewJournalEntryVoucher'));
const BalanceCarryforward= lazy(() => import('@modules/accounting/components/BalanceCarryforward'));

const Reports         = lazy(() => import('@modules/reports/components/Reports'));
const DailyReports    = lazy(() => import('@modules/reports/components/DailyReports'));
const Classification  = lazy(() => import('@modules/reports/components/Classification'));

const GstCenter       = lazy(() => import('@modules/gst/components/GstCenter'));
const EWayBilling     = lazy(() => import('@modules/gst/components/EWayBilling'));

const MbcCardManagement= lazy(() => import('@modules/loyalty/components/MbcCardManagement'));

const Configuration   = lazy(() => import('@modules/configuration/components/Configuration'));
const CompanyConfig   = lazy(() => import('@modules/configuration/components/CompanyConfiguration'));
const Settings        = lazy(() => import('@modules/configuration/components/Settings'));
const BusinessRoles   = lazy(() => import('@modules/configuration/components/BusinessRoles'));
const BusinessUsers   = lazy(() => import('@modules/configuration/components/BusinessUserAssignment'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
    Loading…
  </div>
);

/** Wraps a route so it only renders when the user has the required permission. */
function Protected({ screen, element }: { screen: string; element: React.ReactElement }) {
  const { can } = usePermissions();
  if (!can(screen)) {
    return <Navigate to="/" replace />;
  }
  return element;
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* POS / Sales */}
        <Route path="/pos" element={<Protected screen="pos" element={<POS />} />} />
        <Route path="/pos/non-gst" element={<Protected screen="nonGstPos" element={<POS />} />} />
        <Route path="/sales/history" element={<Protected screen="salesHistory" element={<SalesHistory />} />} />
        <Route path="/sales/manual" element={<Protected screen="manualSalesEntry" element={<ManualSalesEntry />} />} />
        <Route path="/sales/returns" element={<Protected screen="salesReturns" element={<Returns />} />} />
        <Route path="/sales/challans" element={<Protected screen="salesChallans" element={<SalesChallans />} />} />

        {/* Purchase */}
        <Route path="/purchase" element={<Protected screen="automatedPurchaseEntry" element={<PurchaseForm />} />} />
        <Route path="/purchase/manual" element={<Protected screen="manualPurchaseEntry" element={<ManualPurchase />} />} />
        <Route path="/purchase/history" element={<Protected screen="purchaseHistory" element={<PurchaseHistory />} />} />
        <Route path="/purchase/orders" element={<Protected screen="purchaseOrders" element={<PurchaseOrders />} />} />
        <Route path="/purchase/challans" element={<Protected screen="deliveryChallans" element={<DeliveryChallans />} />} />

        {/* Inventory */}
        <Route path="/inventory" element={<Protected screen="inventory" element={<Inventory />} />} />
        <Route path="/inventory/physical" element={<Protected screen="physicalInventory" element={<PhysicalInventory />} />} />
        <Route path="/inventory/master" element={<Protected screen="materialMaster" element={<MaterialMaster />} />} />
        <Route path="/inventory/substitute" element={<Protected screen="substituteFinder" element={<SubstituteFinder />} />} />

        {/* Customers */}
        <Route path="/customers" element={<Protected screen="customers" element={<Customers />} />} />
        <Route path="/customers/ar" element={<Protected screen="accountsReceivable" element={<AccountReceivable />} />} />

        {/* Suppliers */}
        <Route path="/suppliers" element={<Protected screen="suppliers" element={<Suppliers />} />} />
        <Route path="/suppliers/doctors" element={<Protected screen="doctorsMaster" element={<DoctorsMaster />} />} />
        <Route path="/suppliers/ap" element={<Protected screen="accountsPayable" element={<AccountPayable />} />} />

        {/* Accounting */}
        <Route path="/accounting/journal" element={<Protected screen="journalEntry" element={<NewJournalEntry />} />} />
        <Route path="/accounting/balance" element={<Protected screen="balanceCarryforward" element={<BalanceCarryforward />} />} />

        {/* Reports */}
        <Route path="/reports" element={<Protected screen="reports" element={<Reports />} />} />
        <Route path="/reports/daily" element={<Protected screen="dailyReports" element={<DailyReports />} />} />
        <Route path="/reports/classification" element={<Protected screen="classification" element={<Classification />} />} />

        {/* GST */}
        <Route path="/gst" element={<Protected screen="gstCenter" element={<GstCenter />} />} />
        <Route path="/gst/eway" element={<Protected screen="eWayBilling" element={<EWayBilling />} />} />

        {/* Loyalty */}
        <Route path="/loyalty/mbc" element={<Protected screen="mbcCards" element={<MbcCardManagement />} />} />

        {/* Configuration */}
        <Route path="/config" element={<Protected screen="configuration" element={<Configuration />} />} />
        <Route path="/config/company" element={<Protected screen="companyConfiguration" element={<CompanyConfig />} />} />
        <Route path="/config/settings" element={<Protected screen="settings" element={<Settings />} />} />
        <Route path="/config/roles" element={<Protected screen="businessRoles" element={<BusinessRoles />} />} />
        <Route path="/config/users" element={<Protected screen="businessUsers" element={<BusinessUsers />} />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
