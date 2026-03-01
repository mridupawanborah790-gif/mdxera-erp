import React from 'react';

const BalanceCarryforward: React.FC = () => {
  return (
    <div className="bg-white min-h-full p-6 md:p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-black text-primary uppercase tracking-wide">Balance Carryforward</h1>
        <p className="mt-3 text-sm font-semibold text-gray-600">
          Use this screen to manage balance carryforward operations for the selected financial period.
        </p>
      </div>
    </div>
  );
};

export default BalanceCarryforward;
