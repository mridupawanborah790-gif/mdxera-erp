
import React from 'react';
import Card from '../components/Card';
import type { RegisteredPharmacy } from '../types';

interface BillingProps {
    currentUser: RegisteredPharmacy | null;
    onUpdateProfile: (updatedProfile: RegisteredPharmacy) => void;
    addNotification: (message: string, type?: 'success' | 'error') => void;
}

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 6 9 17l-5-5"/>
    </svg>
);

const plans = [
    {
        id: 'starter',
        name: 'Starter',
        price: '699',
        originalPrice: '999',
        period: '/month',
        paymentLink: 'https://rzp.io/rzp/dejDK4u',
        features: [
            'Basic billing system',
            'Inventory management',
            'Customer database',
            'Basic reports',
            'Email support',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '4194',
        originalPrice: '5999',
        period: '/ 6 months',
        paymentLink: 'https://rzp.io/rzp/gIc0rW9',
        features: [
            'Everything in Starter',
            'AI-powered billing',
            'Advanced analytics',
            'Mobile app access',
            'Priority support',
        ],
    },
    {
        id: 'business',
        name: 'Business',
        price: '8388',
        originalPrice: '11999',
        period: '/ year',
        paymentLink: 'https://rzp.io/rzp/Qx0cyAK',
        features: [
            'Everything in Pro',
            'Custom integrations',
            'White-label solution',
            'Dedicated support',
            'Advanced security',
            'E-commerce support',
        ],
    },
];

const Billing: React.FC<BillingProps> = ({ currentUser, onUpdateProfile, addNotification }) => {
    
    const handleSubscription = async (plan: typeof plans[0]) => {
        if (!currentUser) {
            addNotification('You must be logged in to subscribe.', 'error');
            return;
        };

        if (currentUser.subscription_status === 'active' && currentUser.subscription_plan === plan.id) {
            addNotification('You are already subscribed to this plan.', 'success');
            return;
        }

        try {
            addNotification('Redirecting to payment page...', 'success');
            window.open(plan.paymentLink, '_blank');
        } catch (error: any) {
            console.error('Subscription error:', error);
            addNotification(`Failed to open payment page: ${error.message}`, 'error');
        }
    };
    
    const currentPlan = currentUser?.subscription_plan || 'free';

    return (
        <main className="flex-1 p-6 overflow-y-auto page-fade-in">
            <h1 className="text-2xl font-bold text-app-text-primary">Billing & Subscription</h1>
            <p className="text-app-text-secondary mt-1">Manage your plan and payment details.</p>

            <Card className="mt-6 p-6">
                <h2 className="text-lg font-semibold text-app-text-primary">Your Current Plan</h2>
                <div className="mt-4 flex items-center justify-between bg-primary-extralight p-4 rounded-lg">
                    <div>
                        <p className="text-xl font-bold text-primary capitalize">{currentPlan}</p>
                        <p className="text-sm text-app-text-secondary">
                            {currentPlan === 'free'
                                ? 'Your free plan is active for 7 days only. Please upgrade to continue service.'
                                : `Your plan is currently ${currentUser?.subscription_status || 'active'}.`
                            }
                        </p>
                    </div>
                    {/* Placeholder for billing date */}
                    <p className="text-sm text-app-text-secondary">Next payment on: <span className="font-semibold">N/A</span></p>
                </div>
            </Card>

            <div className="mt-8">
                <h2 className="text-xl font-semibold text-app-text-primary mb-4 text-center">Choose the plan that's right for you</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => {
                        const isCurrent = currentPlan === plan.id;
                        const isBusiness = plan.id === 'business';

                        const cardContent = (
                            <>
                                <h3 className="text-xl font-bold text-app-text-primary">{plan.name}</h3>
                                <div className="mt-2 flex items-baseline">
                                    <span className="text-3xl font-bold">₹{plan.price}</span>
                                    <span className="ml-1 text-xl font-medium text-app-text-secondary line-through">₹{plan.originalPrice}</span>
                                    <span className="ml-2 text-base font-medium text-app-text-secondary">{plan.period}</span>
                                </div>
                                <ul className="mt-6 space-y-3 text-sm text-app-text-secondary flex-grow">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start">
                                            <CheckIcon className="w-5 h-5 text-primary mr-2 flex-shrink-0 mt-px" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => handleSubscription(plan)}
                                    disabled={isCurrent}
                                    className={`mt-8 w-full py-3 text-sm font-semibold rounded-lg transition-colors ${
                                        isCurrent
                                        ? 'bg-gray-200 text-gray-500 cursor-default'
                                        : isBusiness
                                        ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-md hover:shadow-lg'
                                        : 'bg-primary text-primary-text hover:bg-primary-dark'
                                    }`}
                                >
                                    {isCurrent ? 'Current Plan' : 'Subscribe Now'}
                                </button>
                            </>
                        );

                        if (isBusiness) {
                            return (
                                <div key={plan.id} className="relative">
                                    <div className="absolute top-0 right-6 -translate-y-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg z-10">
                                        TOP PICK
                                    </div>
                                    <div className="rounded-2xl p-0.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 shadow-2xl shadow-amber-500/30">
                                        <Card className={`p-6 flex flex-col h-full !shadow-none !hover:shadow-none !hover:-translate-y-0 ${isCurrent ? 'border-2 border-primary' : ''}`}>
                                            {cardContent}
                                        </Card>
                                    </div>
                                </div>
                            );
                        }

                        return (
                             <Card key={plan.id} className={`p-6 flex flex-col ${isCurrent ? 'border-2 border-primary ring-4 ring-primary/20' : ''}`}>
                                {cardContent}
                            </Card>
                        );
                    })}
                </div>
            </div>
        </main>
    );
};

export default Billing;
