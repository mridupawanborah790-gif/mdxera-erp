import type { FileInput } from '../types';

const SUPPORTED_AI_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_AI_FILES = 4;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;
const JPEG_QUALITY = 0.8;

const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read uploaded file.'));
        reader.readAsDataURL(file);
    });

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to process invoice image.'));
        img.src = src;
    });

const normalizeImageData = async (dataUrl: string): Promise<FileInput> => {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Invoice image processing is unavailable in this browser.');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const outputDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = outputDataUrl.split(',')[1] || '';
    return { mimeType: 'image/jpeg', data: base64 };
};

const ensureSupportedFile = (file: File): void => {
    if (!SUPPORTED_AI_MIME_TYPES.has(file.type)) {
        throw new Error(`Unsupported file: ${file.name}. Use JPG, PNG, WEBP, or PDF.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File too large: ${file.name}. Keep each file under 8MB.`);
    }
};

export const prepareFilesForAiExtraction = async (files: FileList): Promise<FileInput[]> => {
    const list = Array.from(files);
    if (list.length === 0) return [];
    if (list.length > MAX_AI_FILES) {
        throw new Error(`Upload up to ${MAX_AI_FILES} pages at a time for AI bill extraction.`);
    }

    const normalized: FileInput[] = [];
    for (const file of list) {
        ensureSupportedFile(file);
        const dataUrl = await fileToDataUrl(file);

        if (file.type === 'application/pdf') {
            normalized.push({ mimeType: file.type, data: dataUrl.split(',')[1] || '' });
            continue;
        }

        normalized.push(await normalizeImageData(dataUrl));
    }

    return normalized;
};

export const prepareCapturedImageForAiExtraction = async (data: string, mimeType: string): Promise<FileInput> => {
    if (!mimeType.startsWith('image/')) {
        return { data, mimeType };
    }

    const dataUrl = `data:${mimeType};base64,${data}`;
    return normalizeImageData(dataUrl);
};
