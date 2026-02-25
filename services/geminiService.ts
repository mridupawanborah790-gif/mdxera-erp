import type { ExtractedPurchaseBill, PurchaseItem, SubstituteResult, ExtractedSalesBill, FileInput } from "../types";
import { parseNetworkAndApiError } from '../utils/error';

interface GeminiOcrRequest {
    prompt: string;
    files?: FileInput[];
}

const cleanJsonString = (text: string): string => {
    if (!text) return '[]';
    return text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
};

const toNumeric = (value: any): number | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const getPreferredGeminiModel = (): string => {
    const env = (import.meta as any).env || {};
    return String(env.VITE_GEMINI_MODEL || env.VITE_GOOGLE_MODEL || 'gemini-2.5-flash').trim();
};

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://sblmbkgoiefqzykjksgm.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibG1ia2dvaWVmcXp5a2prc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2Nzg2ODIsImV4cCI6MjA3NzI1NDY4Mn0.wK5E6TVZCavAqLrbZeyfgdToGyETRnQAbm5PPaAVlFw';

const callGeminiOcr = async (request: string | GeminiOcrRequest): Promise<any> => {
    const model = getPreferredGeminiModel();
    const payload: GeminiOcrRequest = typeof request === 'string' ? { prompt: request } : request;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini_ocr`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
            prompt: payload.prompt,
            files: payload.files,
            model,
        }),
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`OCR function failed (${response.status}): ${details}`);
    }

    const result = await response.json();
    if (!result?.success) {
        throw new Error(result?.error || 'OCR function returned unsuccessful response');
    }

    return result;
};

const getTextFromResultData = (data: any): string => {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (typeof data?.text === 'string') return data.text;

    return (data?.candidates || [])
        .flatMap((candidate: any) => candidate?.content?.parts || [])
        .map((part: any) => part?.text || '')
        .join('')
        .trim();
};

export const getAiInsights = async (summary: any): Promise<string[]> => {
    try {
        const userPrompt = `Analyze this pharmacy data and provide 3 brief actionable insights in a JSON array of strings: ${JSON.stringify(summary)}`;
        const data = await callGeminiOcr(userPrompt);
        return JSON.parse(cleanJsonString(getTextFromResultData(data) || '[]'));
    } catch (error) {
        console.error('AI insight error:', error);
        return ["AI analysis is currently unavailable. Please check your connection and try again."];
    }
};

export const askAiAssistant = async (userPrompt: string): Promise<string> => {
    const data = await callGeminiOcr(userPrompt);
    return getTextFromResultData(data);
};

export const extractPurchaseDetailsFromBill = async (
    inputFiles: FileInput[],
    pharmacyName: string
): Promise<ExtractedPurchaseBill> => {
    let root: any = {};
    let normalizedItems: PurchaseItem[] = [];

    try {
        const prompt = `Analyze purchase invoice images for "${pharmacyName}". Extract supplier, GST, invoice number, date and items. Return JSON only with fields: supplier, supplierGstNumber, invoiceNumber, date, items: [{name, batch, packType, expiry, quantity, purchasePrice, mrp, gstPercent, discountPercent}].`;

        const responseData = await callGeminiOcr({
            prompt,
            files: inputFiles,
        });

        // Extract text and parse JSON
        const jsonText = getTextFromResultData(responseData?.data || responseData);
        root = JSON.parse(cleanJsonString(jsonText) || '{}');

        const rawItems = Array.isArray(root?.items) ? root.items : [];

        normalizedItems = rawItems
            .map((item: any) => ({
                name: String(item?.name || item?.product || '').trim(),
                batch: String(item?.batch || item?.batchNo || '').trim(),
                packType: String(item?.packType || item?.pack || '').trim(),
                expiry: String(item?.expiry || item?.exp || '').trim(),
                quantity: toNumeric(item?.quantity) ?? 0,
                freeQuantity: toNumeric(item?.freeQuantity) ?? 0,
                purchasePrice: toNumeric(item?.purchasePrice ?? item?.rate) ?? 0,
                mrp: toNumeric(item?.mrp) ?? 0,
                gstPercent: toNumeric(item?.gstPercent ?? item?.gst),
                discountPercent: toNumeric(item?.discountPercent ?? item?.discount),
            }))
            .filter((item: any) => item.name && (item.quantity > 0 || item.purchasePrice > 0 || item.mrp > 0));

        return {
            supplier: String(root?.supplier || root?.vendor || '').trim(),
            supplierGstNumber: String(root?.supplierGstNumber || root?.supplierGst || root?.gst || '').trim(),
            invoiceNumber: String(root?.invoiceNumber || root?.billNumber || '').trim(),
            date: String(root?.date || root?.invoiceDate || '').trim(),
            items: normalizedItems,
            ...(normalizedItems.length === 0 ? { error: 'AI could not detect line items from this image. Try a full-page, well-lit photo with item rows clearly visible.' } : {}),
        };

    } catch (error: any) {
        console.error("Gemini Extraction Error Details:", error);

        let errorMessage = "AI Extraction failed. Please ensure all uploaded images are clear, properly aligned, and belong to the same bill. Make sure the supplier name and bill number are visible and consistent across all pages. Then re-upload and try again.";

        const apiError = String(error?.message || error).toLowerCase();
        if (apiError.includes('429') || apiError.includes('limit')) {
            errorMessage = "AI limit reached. Please try again in a few moments.";
        } else if (apiError.includes('not enabled') || apiError.includes('not available') || apiError.includes('model not found')) {
            errorMessage = "Gemini AI model is not enabled for this API key. Please activate Gemini API in Google AI Studio and use a valid API key to continue AI bill extraction.";
        } else if (apiError.includes('quota')) {
            errorMessage = "Monthly AI quota exceeded.";
        } else if (apiError.includes('safety')) {
            errorMessage = "Document content was flagged by AI safety filters.";
        } else {
            errorMessage += ` [DEBUG: ${error?.message || error}]`;
        }

        return {
            supplier: String(root?.supplier || root?.vendor || '').trim(),
            invoiceNumber: String(root?.invoiceNumber || root?.billNumber || '').trim(),
            date: String(root?.date || root?.invoiceDate || '').trim(),
            items: normalizedItems,
            error: errorMessage
        };
    }
};

export const extractPrescription = async (file: FileInput, pharmacyName: string): Promise<ExtractedSalesBill> => {
    try {
        const userPrompt = `Analyze this prescription for ${pharmacyName}. Return valid JSON with customerName and items (name, quantity).\nImage: ${file.mimeType};base64,${file.data}`;
        const data = await callGeminiOcr(userPrompt);
        return JSON.parse(cleanJsonString(getTextFromResultData(data) || '{}'));
    } catch (error) {
        console.error('Prescription AI Error:', error);
        return { items: [], error: 'Prescription analysis failed. Please ensure the image is clear.' };
    }
};

export const generateTextToSpeech = async (text: string): Promise<string> => {
    try {
        const data = await callGeminiOcr(`Convert to speech audio base64 for this text: ${text}`);
        return data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (error) {
        throw new Error(parseNetworkAndApiError(error));
    }
};

export const generatePromotionalImage = async (prompt: string, logoUrl?: string): Promise<string> => {
    try {
        const userPrompt = `Create a social media promotional image for: ${prompt}. Optional logo: ${logoUrl || 'none'}. Return image data.`;
        const data = await callGeminiOcr(userPrompt);
        const imageData = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
        if (!imageData) throw new Error('No image data returned.');
        return `data:${imageData.mimeType};base64,${imageData.data}`;
    } catch (error) {
        throw new Error(parseNetworkAndApiError(error));
    }
};

export const generateCaptionsForImage = async (prompt: string): Promise<string[]> => {
    try {
        const data = await callGeminiOcr(`Write 3 professional social media captions as JSON array for: ${prompt}`);
        return JSON.parse(cleanJsonString(getTextFromResultData(data) || '[]'));
    } catch {
        return ["Your health is our priority.", "Genuine medicines at competitive rates.", "Professional care for the community."];
    }
};

export const findSubstitutes = async (text?: string, imageBase64?: string, mimeType?: string): Promise<SubstituteResult> => {
    const userPrompt = `Find medicine substitutes in India for: ${text || 'the provided image'}. ${imageBase64 ? `Image: ${mimeType};base64,${imageBase64}` : ''}. Return structured JSON.`;
    try {
        const data = await callGeminiOcr(userPrompt);
        return JSON.parse(cleanJsonString(getTextFromResultData(data) || '{}'));
    } catch (error: any) {
        throw new Error(parseNetworkAndApiError(error));
    }
};
