import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

interface WebcamCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (data: string, mimeType: string) => void;
}

const WebcamCaptureModal: React.FC<WebcamCaptureModalProps> = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
            }
        } catch (err: any) {
            console.error("Error accessing webcam:", err);
            if (err.name === 'NotAllowedError') {
                setError("Camera access denied. Please enable camera permissions in your browser.");
            } else {
                setError("Could not start webcam. Please ensure it is connected and not in use by another app.");
            }
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsStreaming(false);
    };

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && isStreaming) {
            const context = canvas.getContext('2d');
            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Flash effect
                const overlay = document.getElementById('camera-flash');
                if (overlay) {
                    overlay.classList.remove('hidden');
                    overlay.classList.add('animate-ping');
                    setTimeout(() => {
                        overlay.classList.add('hidden');
                        overlay.classList.remove('animate-ping');
                    }, 300);
                }

                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                const base64Data = dataUrl.split(',')[1];
                onCapture(base64Data, 'image/jpeg');
                onClose();
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Capture Invoice Photo" widthClass="max-w-2xl">
            <div className="p-4 flex flex-col items-center rounded-none">
                {error ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-none text-center w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="font-semibold">{error}</p>
                        <button onClick={startCamera} className="mt-4 px-4 py-2 bg-primary text-white rounded-none text-sm font-medium">Retry Camera</button>
                    </div>
                ) : (
                    <div className="relative w-full aspect-video bg-black rounded-none overflow-hidden shadow-inner border border-app-border">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            className={`w-full h-full object-cover transition-opacity duration-500 ${isStreaming ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <div id="camera-flash" className="absolute inset-0 bg-white opacity-50 hidden z-10"></div>
                        {!isStreaming && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="animate-spin rounded-none h-10 w-10 border-b-2 border-white"></div>
                            </div>
                        )}
                        <div className="absolute top-4 left-4 right-4 text-center">
                            <span className="bg-black/40 backdrop-blur-md text-white text-[10px] uppercase tracking-widest px-2 py-1 rounded-none font-bold">
                                Align bill clearly in the center
                            </span>
                        </div>
                    </div>
                )}
                
                <canvas ref={canvasRef} className="hidden" />
            </div>
            
            <div className="flex justify-between items-center p-4 bg-gray-50 border-t border-app-border rounded-none">
                <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-app-text-secondary hover:text-app-text-primary rounded-none">
                    Cancel
                </button>
                <button 
                    onClick={handleCapture} 
                    disabled={!isStreaming}
                    className="px-8 py-3 bg-primary text-white font-bold rounded-none shadow-lg hover:bg-primary-dark disabled:bg-gray-300 disabled:shadow-none transition-all flex items-center transform active:scale-95"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Capture Photo
                </button>
                <div className="w-16"></div> {/* Spacer for alignment */}
            </div>
        </Modal>
    );
};

export default WebcamCaptureModal;