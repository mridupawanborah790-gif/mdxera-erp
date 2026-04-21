

import React, { useState, useRef } from 'react';
import Card from '../../../core/components/Card';
import { findSubstitutes } from '../../../core/services/geminiService';
import { SubstituteResult, InventoryItem } from '../../../core/types/types';

const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21 21-4.3-4.3"/><circle cx="10.5" cy="10.5" r="7.5"/></svg>;
const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

interface SubstituteFinderProps {
    inventory: InventoryItem[];
}

const SubstituteFinder: React.FC<SubstituteFinderProps> = ({ inventory }) => {
    const [query, setQuery] = useState('');
    const [image, setImage] = useState<{ file: File; preview: string; base64: string; mimeType: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SubstituteResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFind = async () => {
        if (!query && !image) return;
        setIsLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await findSubstitutes(query, image?.base64, image?.mimeType);
            setResult(res);
        } catch (e: any) {
            setError(e.message || "AI Analysis failed. Check internet.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Substitute Discovery Analysis</span>
                <span className="text-[10px] font-black uppercase text-accent">Powered by Gemini AI</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
                <Card className="p-6 tally-border bg-white !rounded-none shadow-md">
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-gray-950 uppercase tracking-tighter">AI Drug Composition Matcher</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Upload strip photo or type brand name to find therapeutic equivalents</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 ml-1">Search Parameters</label>
                                <input 
                                    type="text" 
                                    value={query} 
                                    onChange={e => setQuery(e.target.value)} 
                                    className="w-full border-2 border-gray-400 p-4 text-xl font-black rounded-none focus:bg-yellow-50 outline-none uppercase" 
                                    placeholder="TYPE BRAND OR SALT..."
                                />
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 border-2 border-dashed border-gray-400 font-black text-xs uppercase hover:bg-gray-50 flex items-center justify-center gap-2">
                                    <UploadIcon /> {image ? 'Switch Photo' : 'Upload Rx/Strip Image'}
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if(file) {
                                        const reader = new FileReader();
                                        reader.onload = () => setImage({ file, preview: URL.createObjectURL(file), base64: (reader.result as string).split(',')[1], mimeType: file.type });
                                        reader.readAsDataURL(file);
                                    }
                                }}/>
                                <button onClick={handleFind} disabled={isLoading} className="px-12 py-3 tally-button-primary shadow-xl uppercase font-black tracking-widest flex items-center gap-2">
                                    {isLoading ? 'Analyzing...' : 'Execute Analysis'}
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

                {result && (
                    <div className="max-w-5xl mx-auto w-full space-y-6 animate-in fade-in zoom-in-95">
                        <Card className="p-6 tally-border bg-white !rounded-none">
                            <h3 className="text-[11px] font-black text-primary uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Identification Summary</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <p className="text-2xl font-black uppercase text-gray-950">{result.PRIMARY_PRODUCT.brand_name}</p>
                                    <p className="text-sm font-bold text-blue-800 uppercase mt-1">{result.PRIMARY_PRODUCT.generic_name} {result.PRIMARY_PRODUCT.strength}</p>
                                </div>
                                <p className="text-sm italic font-medium text-gray-600 leading-relaxed">"{result.SUMMARY}"</p>
                            </div>
                            <div className="flex flex-col md:flex-row gap-6 mt-8">
                                <div className="md:w-1/2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Product Details</h4>
                                    <ul className="space-y-1.5 text-xs">
                                        <li className="flex justify-between items-center"><span className="font-semibold text-gray-700">Dosage Form:</span> <span className="font-medium text-gray-900">{result.PRIMARY_PRODUCT.dosage_form}</span></li>
                                        {result.PRIMARY_PRODUCT.pack_info && <li className="flex justify-between items-center"><span className="font-semibold text-gray-700">Pack Size:</span> <span className="font-medium text-gray-900">{result.PRIMARY_PRODUCT.pack_info}</span></li>}
                                        {result.PRIMARY_PRODUCT.google_reference_url && <li className="flex justify-between items-center"><span className="font-semibold text-gray-700">Ref. Link:</span> <a href={result.PRIMARY_PRODUCT.google_reference_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">View Source</a></li>}
                                    </ul>
                                </div>
                                <div className="md:w-1/2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-2">Important Safety Note</h4>
                                    <p className="text-xs italic text-red-700 leading-relaxed bg-red-50 p-3 rounded-md border border-red-100">
                                        {result.SAFETY_NOTE}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-6 tally-border bg-white !rounded-none">
                            <h3 className="text-[11px] font-black text-primary uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Available Substitutes (Exact Match)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                {result.SUBSTITUTES_LIST.map((sub, idx) => (
                                    <div key={idx} className="flex items-center space-x-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-app-border">
                                        <div className="w-10 h-10 flex-shrink-0 bg-blue-50/50 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm border border-blue-100">
                                            {sub.brand_name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight">{sub.brand_name}</p>
                                            <p className="text-xs text-gray-500">{sub.manufacturer || 'Generic Pharma'}</p>
                                        </div>
                                        {sub.is_exact_match && (
                                            <span className="ml-auto px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black uppercase rounded-full border border-green-200">Exact Match</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {result.RAW_SEARCH_REFERENCES && result.RAW_SEARCH_REFERENCES.length > 0 && (
                                <div className="mt-8 pt-4 border-t border-gray-200">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Further Reading</h4>
                                    <ul className="space-y-1 text-xs text-gray-600">
                                        {result.RAW_SEARCH_REFERENCES.map((ref, idx) => (
                                            <li key={idx}><a href={ref} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">{ref}</a></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </main>
    );
};

export default SubstituteFinder;
