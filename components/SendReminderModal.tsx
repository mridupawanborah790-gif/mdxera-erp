import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import type { Customer, RegisteredPharmacy } from '../types';

interface SendReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    pharmacy: RegisteredPharmacy | null;
}

const getOutstandingBalance = (customer: Customer | null): number => {
    if (!customer?.ledger || customer.ledger.length === 0) return 0;
    return customer.ledger[customer.ledger.length - 1].balance ?? 0;
};

const SendReminderModal: React.FC<SendReminderModalProps> = ({ isOpen, onClose, customer, pharmacy }) => {
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isOpen && customer && pharmacy) {
            const balance = getOutstandingBalance(customer);
            // Construct the template without the specific link
            // Fix: pharmacyName -> pharmacy_name
            const template = `Hello ${customer.name},\n\nThis is a friendly reminder from ${pharmacy.pharmacy_name} regarding your outstanding balance of ₹${balance.toFixed(2)}.\n\nPlease verify and clear your dues at your earliest convenience.\n\nThank you!`;
            setMessage(template);
        }
    }, [isOpen, customer, pharmacy]);

    if (!isOpen || !customer || !pharmacy) return null;

    const balance = getOutstandingBalance(customer);
    const hasPhone = customer.phone && customer.phone.trim().length > 0;
    const hasEmail = customer.email && customer.email.trim().length > 0;

    // WhatsApp
    const whatsappMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/${(customer.phone || '').replace(/\D/g, '')}?text=${whatsappMessage}`;
    
    // SMS
    const smsMessage = encodeURIComponent(message);
    const smsLink = `sms:${(customer.phone || '').replace(/[^0-9+]/g, '')}?body=${smsMessage}`;

    // Email
    // Fix: pharmacyName -> pharmacy_name
    const emailSubject = encodeURIComponent(`Payment Reminder from ${pharmacy.pharmacy_name}`);
    const emailBody = encodeURIComponent(message);
    const mailtoLink = `mailto:${customer.email}?subject=${emailSubject}&body=${emailBody}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Send Reminder to ${customer.name}`}>
            <div className="p-6">
                <div className="text-center bg-gray-50 p-4 rounded-lg mb-4">
                    <p className="text-sm text-gray-600">Outstanding Balance</p>
                    <p className="text-3xl font-bold text-red-600">₹{balance.toFixed(2)}</p>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-app-text-secondary mb-2">Message Preview</label>
                    <textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full h-32 p-3 border border-app-border rounded-md bg-input-bg text-sm focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"
                        placeholder="Edit your reminder message here..."
                    />
                    <p className="text-xs text-app-text-tertiary mt-1">You can edit the message above before sending.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <a
                        href={hasPhone ? whatsappLink : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block p-4 text-center rounded-lg transition-colors ${hasPhone ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
                        aria-disabled={!hasPhone}
                        onClick={(e) => !hasPhone && e.preventDefault()}
                    >
                        <p className="font-semibold">WhatsApp</p>
                        <p className="text-xs">{hasPhone ? `to ${customer.phone}` : 'No phone number'}</p>
                    </a>
                    
                    <a
                        href={hasPhone ? smsLink : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block p-4 text-center rounded-lg transition-colors ${hasPhone ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
                        aria-disabled={!hasPhone}
                        onClick={(e) => !hasPhone && e.preventDefault()}
                    >
                        <p className="font-semibold">SMS</p>
                        <p className="text-xs">{hasPhone ? `to ${customer.phone}` : 'No phone number'}</p>
                    </a>

                    <a
                        href={hasEmail ? mailtoLink : '#'}
                        className={`block p-4 text-center rounded-lg transition-colors ${hasEmail ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
                        aria-disabled={!hasEmail}
                        onClick={(e) => !hasEmail && e.preventDefault()}
                    >
                        <p className="font-semibold">Email</p>
                        <p className="text-xs">{hasEmail ? `to ${customer.email}` : 'No email address'}</p>
                    </a>
                </div>
            </div>
            <div className="flex justify-end p-5 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)]">
                <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-card-bg border border-app-border rounded-lg hover:bg-[var(--modal-content-bg-light)] dark:hover:bg-[var(--modal-content-bg-dark)]">Close</button>
            </div>
        </Modal>
    );
};

export default SendReminderModal;