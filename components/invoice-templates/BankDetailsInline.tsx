import React from 'react';

interface BankDetailsInlineProps {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  className?: string;
}

const normalize = (value?: string | null) => String(value || '').trim();

const BankDetailsInline: React.FC<BankDetailsInlineProps> = ({ bankName, accountNumber, ifscCode, className = '' }) => {
  const segments = [
    normalize(bankName) ? `Bank: ${normalize(bankName)}` : '',
    normalize(accountNumber) ? `A/C: ${normalize(accountNumber)}` : '',
    normalize(ifscCode) ? `IFSC: ${normalize(ifscCode)}` : '',
  ].filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <p className={className} aria-label="Bank details">
      {segments.join('   ')}
    </p>
  );
};

export default BankDetailsInline;
