import React, { useState, useRef, useEffect, useCallback } from 'react';
import Modal from './Modal';

interface ImageCropModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string;
    onCropComplete: (croppedImage: string) => void;
    aspectRatio?: number; // width / height
    title?: string;
    onSave?: () => void; // Optional direct save to DB after crop
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
    isOpen,
    onClose,
    imageSrc,
    onCropComplete,
    aspectRatio = 2, // Default to 2:1 for logos
    title = 'Crop Image',
    onSave
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 40 }); // Percentages
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragType, setDragType] = useState<'move' | 'resize'>('move');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && imageSrc) {
            const img = new Image();
            img.src = imageSrc;
            img.onload = () => {
                imgRef.current = img;
                // Initialize crop to match aspect ratio
                let w = 80;
                let h = w / aspectRatio;
                if (h > 80) {
                    h = 80;
                    w = h * aspectRatio;
                }
                setCrop({ x: (100 - w) / 2, y: (100 - h) / 2, width: w, height: h });
                draw();
            };
        }
    }, [isOpen, imageSrc, aspectRatio]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size based on container
        const containerWidth = Math.min(canvas.parentElement?.clientWidth || 500, 700);
        const scale = containerWidth / img.width;
        canvas.width = containerWidth;
        canvas.height = img.height * scale;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Draw overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw crop area
        const cx = (crop.x / 100) * canvas.width;
        const cy = (crop.y / 100) * canvas.height;
        const cw = (crop.width / 100) * canvas.width;
        const ch = (crop.height / 100) * canvas.height;

        ctx.clearRect(cx, cy, cw, ch);
        ctx.drawImage(img, (crop.x / 100) * img.width, (crop.y / 100) * img.height, (crop.width / 100) * img.width, (crop.height / 100) * img.height, cx, cy, cw, ch);

        // Draw border
        ctx.strokeStyle = '#004242';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.setLineDash([]);

        // Draw handles (corners)
        ctx.fillStyle = '#004242';
        const hSize = 12;
        ctx.fillRect(cx + cw - hSize/2, cy + ch - hSize/2, hSize, hSize); // Bottom right
    }, [crop]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = ((clientX - rect.left) / canvas.width) * 100;
        const y = ((clientY - rect.top) / canvas.height) * 100;

        // Check if resizing (bottom-right corner)
        const handleSize = 5;
        if (Math.abs(x - (crop.x + crop.width)) < handleSize && Math.abs(y - (crop.y + crop.height)) < handleSize) {
            setDragType('resize');
        } else if (x > crop.x && x < crop.x + crop.width && y > crop.y && y < crop.y + crop.height) {
            setDragType('move');
        } else {
            return;
        }

        setIsDragging(true);
        setDragStart({ x, y });
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = ((clientX - rect.left) / canvas.width) * 100;
        const y = ((clientY - rect.top) / canvas.height) * 100;

        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        if (dragType === 'move') {
            setCrop(prev => ({
                ...prev,
                x: Math.max(0, Math.min(100 - prev.width, prev.x + dx)),
                y: Math.max(0, Math.min(100 - prev.height, prev.y + dy))
            }));
        } else {
            let newWidth = Math.max(5, Math.min(100 - crop.x, crop.width + dx));
            let newHeight = newWidth / aspectRatio;
            
            // Adjust if height goes out of bounds
            if (crop.y + newHeight > 100) {
                newHeight = 100 - crop.y;
                newWidth = newHeight * aspectRatio;
            }

            setCrop(prev => ({
                ...prev,
                width: newWidth,
                height: newHeight
            }));
        }

        setDragStart({ x, y });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleConfirm = async () => {
        const img = imgRef.current;
        if (!img) return;

        setIsSaving(true);
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Target dimensions for high quality
            const targetWidth = aspectRatio === 2 ? 1200 : 800;
            canvas.width = targetWidth;
            canvas.height = canvas.width / aspectRatio;

            const sx = (crop.x / 100) * img.width;
            const sy = (crop.y / 100) * img.height;
            const sw = (crop.width / 100) * img.width;
            const sh = (crop.height / 100) * img.height;

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            const croppedDataUrl = canvas.toDataURL('image/png', 0.9);
            
            onCropComplete(croppedDataUrl);
            if (onSave) {
                await onSave();
            }
        } catch (e) {
            console.error('Crop failed', e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={title} 
            widthClass="max-w-4xl" 
            disableClose={isSaving}
        >
            <div className="flex-1 overflow-y-auto bg-gray-900 flex flex-col items-center justify-center p-6 min-h-[400px]">
                <div className="mb-4 text-center">
                    <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
                        Manual Image Editor & Cropper
                    </p>
                    <p className="text-gray-400 text-[9px] font-bold uppercase mt-1">
                        Move selection box to focus. Drag bottom-right corner to resize.
                    </p>
                </div>
                
                <div className="relative border-4 border-gray-700 bg-black shadow-2xl overflow-hidden cursor-crosshair touch-none select-none">
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleMouseDown}
                        onTouchMove={handleMouseMove}
                        onTouchEnd={handleMouseUp}
                        className="max-w-full h-auto block"
                    />
                </div>
            </div>
            
            <div className="p-4 border-t flex justify-between items-center bg-gray-50 flex-shrink-0">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Selected Format</span>
                    <span className="text-[10px] font-bold text-primary uppercase">PNG Lossless (High Definition)</span>
                </div>
                <div className="flex gap-3">
                    <button 
                        disabled={isSaving}
                        onClick={onClose} 
                        className="px-6 py-2 border-2 border-gray-300 font-black uppercase text-[10px] tracking-widest hover:bg-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        disabled={isSaving}
                        onClick={handleConfirm} 
                        className="px-10 py-2 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-primary-dark transition-all flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Processing...
                            </>
                        ) : (
                            'Accept & Apply Image'
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ImageCropModal;