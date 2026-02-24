import type { FileInput } from '../types';

declare global {
    interface Window {
        pdfjsLib?: any;
    }
}

const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_JS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });

const dataUrlToBase64 = (dataUrl: string): string => dataUrl.split(',')[1] || '';

const loadPdfJs = async () => {
    if (!window.pdfjsLib) {
        window.pdfjsLib = await import(/* @vite-ignore */ PDF_JS_CDN);
    }
    if (window.pdfjsLib?.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
    }
    return window.pdfjsLib;
};

const convertPdfToImages = async (file: File): Promise<FileInput[]> => {
    const pdfjsLib = await loadPdfJs();
    const buffer = await readFileAsArrayBuffer(file);
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdfDoc = await loadingTask.promise;
    const pageImages: FileInput[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const context = canvas.getContext('2d');
        if (!context) continue;

        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        pageImages.push({ mimeType: 'image/png', data: dataUrlToBase64(dataUrl) });
    }

    return pageImages;
};

export const prepareAiFileInputs = async (files: FileList | File[]): Promise<FileInput[]> => {
    const sourceFiles = Array.isArray(files) ? files : Array.from(files);
    const results: FileInput[] = [];

    for (const file of sourceFiles) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const pdfPages = await convertPdfToImages(file);
            results.push(...pdfPages);
            continue;
        }

        if (file.type.startsWith('image/')) {
            const dataUrl = await readFileAsDataUrl(file);
            results.push({ mimeType: file.type || 'image/jpeg', data: dataUrlToBase64(dataUrl) });
        }
    }

    return results;
};
