
import React, { useRef, useState, useEffect } from 'react';
// Fix: Added missing storage service export
import { broadcastSyncMessage } from '../services/storageService';

interface MobileCaptureViewProps {
    sessionId: string;
    orgId: string;
}

const MobileCaptureView: React.FC<MobileCaptureViewProps> = ({ sessionId, orgId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isCaptured, setIsCaptured] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Prefer rear camera
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
            }
        } catch (err: any) {
            console.error("Camera error:", err);
            setError("Camera access required. Please ensure you are using HTTPS and have granted permissions.");
        }
    };

    const stopCamera = () => {
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach(t => t.stop());
    };

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
            const context = canvas.getContext('2d');
            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Compress image for faster transfer
                setPreviewUrl(dataUrl);
                setIsCaptured(true);
                stopCamera(); // Stop camera after capture
            }
        }
    };

    const handleSend = async () => {
        if (!previewUrl) return;
        setIsSending(true);
        try {
            const base64 = previewUrl.split(',')[1];
            // Use broadcastSyncMessage to send the image back to the desktop
            await broadcastSyncMessage(sessionId, {
                image: base64,
                mimeType: 'image/jpeg'
            });
            setIsSuccess(true);
            setIsCaptured(false); // Reset captured state after sending
        } catch (err) {
            alert("Transfer failed. Please check your internet connection.");
            setError("Image transfer failed. Please try again.");
        } finally {
            setIsSending(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center text-white p-10 text-center font-sans">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Sync Successful!</h2>
                <p className="text-white/60 text-sm leading-relaxed mb-10">
                    The bill has been sent to your desktop screen. You can close this tab now or snap another bill.
                </p>
                <button 
                    onClick={() => { setIsSuccess(false); startCamera(); }}
                    className="w-full max-w-xs py-4 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-xl"
                >
                    Snap Another Bill
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white p-6 font-sans">
            <div className="w-full max-w-md flex flex-col h-full">
                <div className="text-center py-6">
                    <h1 className="text-xl font-black uppercase tracking-tight">Medimart Sync</h1>
                    <p className="text-xs text-white/50 uppercase tracking-widest mt-1">Capture Purchase Bill</p>
                </div>

                <div className="flex-1 relative bg-white/5 rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
                    {!isCaptured ? (
                        <>
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            {/* Overlay for framing the bill */}
                            <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none">
                                <div className="w-full h-full border-2 border-white/30 rounded-2xl"></div>
                            </div>
                        </>
                    ) : (
                        <img src={previewUrl!} className="w-full h-full object-contain" alt="Preview" />
                    )}
                    
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center p-10 text-center bg-black/80 backdrop-blur-md">
                            <div className="space-y-4">
                                <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                </div>
                                <p className="font-bold text-sm leading-relaxed">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                <div className="py-10 flex justify-center items-center gap-6">
                    {!isCaptured ? (
                        <button 
                            onClick={handleCapture}
                            disabled={!!error}
                            className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform disabled:opacity-20"
                        >
                            <div className="w-16 h-16 border-4 border-black rounded-full"></div>
                        </button>
                    ) : (
                        <div className="flex flex-col items-center gap-6 w-full">
                            <div className="flex gap-4 w-full">
                                <button 
                                    onClick={() => { setIsCaptured(false); startCamera(); }}
                                    className="flex-1 py-4 bg-white/10 rounded-2xl font-bold uppercase tracking-widest text-xs"
                                >
                                    Retake
                                </button>
                                <button 
                                    onClick={handleSend}
                                    disabled={isSending}
                                    className="flex-[2] py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/30 flex items-center justify-center"
                                >
                                    {isSending ? 'Sending...' : 'Sync to PC'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileCaptureView;
