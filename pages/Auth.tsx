
import React, { useState } from 'react';
import { RegisteredPharmacy } from '../types';
import { login, signup } from '../services/storageService';

const initialFormData = {
    email: '',
    password: '',
    fullName: '',
    pharmacyName: '',
};

interface AuthPageProps {
    onLogin: (user: RegisteredPharmacy) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [formData, setFormData] = useState(initialFormData);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [imageError, setImageError] = useState(false);

    const LOGO_URL = "https://sblmbkgoiefqzykjksgm.supabase.co/storage/v1/object/public/logos/ChatGPT%20Image%20Feb%203,%202026,%2009_44_47%20PM.png";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignUp) {
                if (!formData.fullName || !formData.pharmacyName) {
                    setError("All fields are required for registration.");
                    setLoading(false);
                    return;
                }
                const user = await signup(formData.email, formData.password, formData.fullName, formData.pharmacyName);
                onLogin(user);
            } else {
                const user = await login(formData.email, formData.password);
                onLogin(user);
            }
        } catch (err: any) {
            console.error("Auth submit error:", err);
            const msg = err.message || "Authentication failed.";
            if (msg.toLowerCase().includes('invalid login credentials')) {
                setError("Incorrect email or password. If you don't have an account, please sign up first.");
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-app-bg py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-sm w-full bg-white border-2 border-primary shadow-[10px_10px_0px_rgba(0,0,0,0.1)] overflow-hidden">
                {/* Header Strip */}
                <div className="bg-primary p-1.5 text-center">
                    <span className="text-[9px] font-black text-white uppercase tracking-[0.3em]">
                        {isSignUp ? 'Organization Enrollment' : 'Accounting Gateway'}
                    </span>
                </div>

                <div className="p-8 space-y-6">
                    <div className="text-center">
                        <div className="h-24 w-full mx-auto bg-white overflow-hidden flex items-center justify-center mb-3 p-2">
                            {!imageError ? (
                                <img 
                                    src={LOGO_URL} 
                                    alt="Logo" 
                                    className="max-h-full max-w-full object-contain"
                                    onError={() => setImageError(true)}
                                />
                            ) : (
                                <div className="h-16 w-16 flex items-center justify-center bg-primary/5 border-2 border-primary/20">
                                    <span className="text-primary font-black text-3xl italic">M</span>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                            Enterprise Medimart Retail ERP
                        </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {error && (
                            <div className="text-red-700 text-[10px] font-black uppercase text-center bg-red-50 p-3 border-2 border-red-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-2">
                                <p><span className="mr-2">⚠️</span> {error}</p>
                                {!isSignUp && (
                                    <button 
                                        type="button"
                                        onClick={() => { setIsSignUp(true); setError(''); }}
                                        className="text-primary underline font-black"
                                    >
                                        SWITCH TO SIGN UP
                                    </button>
                                )}
                            </div>
                        )}
                        
                        <div className="space-y-3">
                            {isSignUp && (
                                <>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-gray-500 mb-1 ml-1">Pharmacy Trade Name</label>
                                        <input 
                                            name="pharmacyName" 
                                            type="text" 
                                            required 
                                            placeholder="e.g. Medimart Retail Pharmacy" 
                                            value={formData.pharmacyName} 
                                            onChange={handleChange} 
                                            className="appearance-none block w-full px-3 py-2 border-2 border-gray-300 rounded-none focus:outline-none focus:bg-[#fffde7] focus:border-primary text-xs font-bold uppercase transition-all bg-slate-50" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-gray-500 mb-1 ml-1">Owner / Manager Full Name</label>
                                        <input 
                                            name="fullName" 
                                            type="text" 
                                            required 
                                            placeholder="Enter your name" 
                                            value={formData.fullName} 
                                            onChange={handleChange} 
                                            className="appearance-none block w-full px-3 py-2 border-2 border-gray-300 rounded-none focus:outline-none focus:bg-[#fffde7] focus:border-primary text-xs font-bold uppercase transition-all bg-slate-50" 
                                        />
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1 ml-1">Identity (Email)</label>
                                <input 
                                    name="email" 
                                    type="email" 
                                    required 
                                    placeholder="Enter your email" 
                                    value={formData.email} 
                                    onChange={handleChange} 
                                    className="appearance-none block w-full px-3 py-2 border-2 border-gray-300 rounded-none focus:outline-none focus:bg-[#fffde7] focus:border-primary text-xs font-bold uppercase transition-all bg-slate-50" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1 ml-1">Credentials (Password)</label>
                                <input 
                                    name="password" 
                                    type="password" 
                                    required 
                                    placeholder="••••••••" 
                                    value={formData.password} 
                                    onChange={handleChange} 
                                    className="appearance-none block w-full px-3 py-2 border-2 border-gray-300 rounded-none focus:outline-none focus:bg-[#fffde7] focus:border-primary text-xs font-bold uppercase transition-all bg-slate-50" 
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="group relative w-full flex justify-center py-3 px-4 border-2 border-primary-dark text-[11px] font-black uppercase tracking-[0.4em] rounded-none text-white bg-primary hover:bg-primary-dark shadow-lg transition-all active:translate-y-1"
                            >
                                {loading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Syncing</span>
                                    </div>
                                ) : isSignUp ? 'Enroll Org (Ent)' : 'Login (Ent)'}
                            </button>
                        </div>
                    </form>

                    <div className="text-center pt-2">
                        <button 
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                            }}
                            className="text-[10px] font-black uppercase text-primary hover:text-primary-dark tracking-widest underline underline-offset-4 decoration-2 decoration-primary/20"
                        >
                            {isSignUp ? 'Already registered? Login here' : 'New Pharmacy? Create organization account'}
                        </button>
                    </div>
                </div>
                
                {/* Status Bar style footer */}
                <div className="bg-gray-100 p-1.5 flex justify-between px-3 border-t border-gray-300">
                    <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">Connection: Encrypted</span>
                    <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">Authorized Only</span>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;