
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Card from '../components/Card';
import { RegisteredPharmacy } from '../types';
import { generatePromotionalImage, generateCaptionsForImage } from '../services/geminiService';


interface PromotionsProps {
    currentUser: RegisteredPharmacy | null;
    addNotification: (message: string, type?: 'success' | 'error') => void;
}


const Spinner: React.FC<{ size?: 'small' | 'large'; className?: string }> = ({ size = 'large', className = '' }) => (
    <svg 
        className={`animate-spin ${size === 'small' ? 'h-4 w-4' : 'h-5 w-5'} ${className}`}
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24"
    >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


// --- Main Promotions Page ---
const Promotions: React.FC<PromotionsProps> = ({ currentUser, addNotification }) => {
    const [prompt, setPrompt] = useState('');
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [caption, setCaption] = useState('');
    const [suggestedCaptions, setSuggestedCaptions] = useState<string[]>([]);
    const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
    const [captionError, setCaptionError] = useState<string | null>(null);


    const handleGenerateImage = async () => {
        if (!prompt.trim()) {
            setError("Please enter a description for the promotion.");
            return;
        }

        setIsLoadingImage(true);
        setIsGeneratingCaptions(true);
        setError(null);
        setCaptionError(null);
        setGeneratedImageUrl(null);
        setCaption('');
        setSuggestedCaptions([]);

        try {
            // Parallel execution: Generate Image and Captions
            // We pass the pharmacy_logo_url if it exists to integrate branding
            /* Fixed: Changed pharmacyLogoUrl to pharmacy_logo_url for RegisteredPharmacy type */
            const [imageDataUrl, captions] = await Promise.all([
                generatePromotionalImage(prompt, currentUser?.pharmacy_logo_url),
                generateCaptionsForImage(prompt)
            ]);

            setGeneratedImageUrl(imageDataUrl);
            setSuggestedCaptions(captions);
            if (captions.length > 0) {
                setCaption(captions[0]);
            }
            addNotification("Promotion generated successfully!", 'success');
        } catch (e: any) {
            const errorMessage = e.message || "AI failed to generate the photo. Try a different prompt.";
            // If it's a 'Failed to fetch' specifically, provide a more user-friendly network message.
            if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network connection issue') || errorMessage.includes('Network error')) {
                 setError("Network error: Could not connect to AI service. Please check your internet connection.");
                 addNotification("Network error: Could not connect to AI service. Please check your internet connection.", 'error');
            } else {
                 setError(errorMessage);
                 addNotification("AI Generation failed: " + errorMessage, 'error');
            }
            console.error("AI Generation Error:", e);
        } finally {
            setIsLoadingImage(false);
            setIsGeneratingCaptions(false);
        }
    };
    
    const handleDownloadImage = async () => {
        if (!generatedImageUrl) return;
        try {
            const response = await fetch(generatedImageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Medimart-Promo-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            addNotification("Image downloaded!", 'success');
        } catch (err) {
            console.error("Download failed", err);
            addNotification("Failed to download image.", 'error');
        }
    };

    const handleCopyCaption = () => {
        if (!caption) return;
        navigator.clipboard.writeText(caption).then(() => {
            addNotification('Caption copied!', 'success');
        }).catch(err => {
            addNotification('Copy failed.', 'error');
        });
    };
    
    return (
        <main className="flex-1 p-6 overflow-y-auto page-fade-in flex flex-col items-center w-full bg-app-bg">
            <div className="w-full max-w-4xl">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-app-text-primary">Promotions & Marketing</h1>
                    <p className="text-app-text-secondary mt-1">Generate social media posters and catchy captions using AI.</p>
                </div>

                <Card className="p-6 overflow-hidden border-app-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Inputs */}
                        <div className="flex flex-col space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-app-text-primary uppercase tracking-wider mb-2">Campaign Description</label>
                                <textarea 
                                    value={prompt} 
                                    onChange={(e) => setPrompt(e.target.value)} 
                                    placeholder="e.g., 'Diwali Special: 15% discount on all multivitamins', 'Senior Citizen Wednesday: Free health checkup with medicine purchase'" 
                                    className="w-full p-4 border border-app-border rounded-xl bg-input-bg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none shadow-sm" 
                                    rows={5}
                                />
                                <p className="text-[10px] text-app-text-tertiary mt-2">The AI will use your pharmacy logo (if set in Profile) to brand the image.</p>
                            </div>
                            
                            <button 
                                onClick={handleGenerateImage} 
                                disabled={isLoadingImage || !prompt.trim()} 
                                className="w-full px-6 py-4 font-black text-white bg-primary rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all transform active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center uppercase tracking-widest"
                            >
                                {isLoadingImage ? (
                                    <>
                                        <Spinner className="text-white mr-3 h-5 w-5"/>
                                        Generating Magic...
                                    </>
                                ) : 'Generate Content'}
                            </button>

                            {error && (
                                <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                                    <p className="text-red-600 text-xs font-semibold leading-relaxed">{error}</p>
                                </div>
                            )}
                        </div>

                        {/* Visual Output */}
                        <div className="flex flex-col space-y-4">
                            <div className="w-full aspect-square bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-app-border flex items-center justify-center overflow-hidden relative group shadow-inner">
                                {isLoadingImage ? (
                                    <div className="text-center p-6">
                                        <div className="flex justify-center mb-4">
                                            <div className="relative h-16 w-16">
                                                <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                                            </div>
                                        </div>
                                        <p className="text-xs font-bold text-primary animate-pulse uppercase tracking-tighter">Painting your promotion...</p>
                                    </div>
                                ) : generatedImageUrl ? (
                                    <>
                                        <img src={generatedImageUrl} alt="Generated promotion" className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                                            <button 
                                                onClick={handleDownloadImage}
                                                className="bg-white text-black px-6 py-2.5 rounded-full text-xs font-black shadow-xl hover:bg-gray-100 flex items-center transform transition active:scale-90"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                DOWNLOAD
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center p-8 opacity-40">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                                        <p className="text-sm font-bold uppercase tracking-widest">Preview Area</p>
                                    </div>
                                )}
                            </div>

                            {/* Caption Result */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="font-black text-[10px] text-app-text-tertiary uppercase tracking-widest">Suggested Caption</h3>
                                    {caption && (
                                        <button 
                                            onClick={handleCopyCaption}
                                            className="text-[10px] font-bold text-primary hover:text-primary-dark transition-colors flex items-center"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            COPY
                                        </button>
                                    )}
                                </div>
                                
                                <div className="relative">
                                    {isGeneratingCaptions ? (
                                        <div className="h-24 w-full bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-app-border flex items-center justify-center">
                                            <div className="flex gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <textarea 
                                            value={caption} 
                                            onChange={(e) => setCaption(e.target.value)} 
                                            placeholder="Captions will appear here..." 
                                            className="w-full p-4 border border-app-border rounded-xl bg-input-bg text-sm focus:ring-1 focus:ring-primary/30 outline-none resize-none shadow-inner italic leading-relaxed" 
                                            rows={4}
                                        />
                                    )}
                                </div>

                                {/* Alternative Suggestions */}
                                {!isGeneratingCaptions && suggestedCaptions.length > 1 && (
                                    <div className="space-y-2 mt-2">
                                        <p className="text-[9px] font-black text-app-text-tertiary uppercase tracking-widest pl-1">Alternatives:</p>
                                        <div className="flex flex-col gap-2">
                                            {suggestedCaptions.filter(c => c !== caption).map((sug, index) => (
                                                <button 
                                                    key={index} 
                                                    onClick={() => setCaption(sug)} 
                                                    className="w-full text-left p-3 text-xs border border-app-border bg-card-bg rounded-xl hover:bg-slate-50 hover:border-primary/40 transition-all text-app-text-secondary truncate"
                                                >
                                                    {sug}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {captionError && !isGeneratingCaptions && <p className="text-red-500 text-[10px] font-bold">{captionError}</p>}
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </main>
    );
};


export default Promotions;