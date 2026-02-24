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
    return String(env.VITE_GEMINI_MODEL || env.VITE_GOOGLE_MODEL || 'gemini-flash-lite-latest').trim();
};

const callGeminiOcr = async (request: string | GeminiOcrRequest): Promise<any> => {
    const model = getPreferredGeminiModel();
    const payload: GeminiOcrRequest = typeof request === 'string' ? { prompt: request } : request;

    const response = await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/gemini_ocr`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(import.meta as any).env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': (import.meta as any).env.VITE_SUPABASE_ANON_KEY,
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

    return result.data;
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
    try {
        const prompt = `Analyze purchase invoice images for \"${pharmacyName}\". Extract supplier, GST, invoice number, date and items. Return JSON only.`;

        const parsed = await callGeminiOcr({
            prompt,
            files: inputFiles,
        });

        const root = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        const rawItems = Array.isArray(root?.items) ? root.items : [];

        const normalizedItems = rawItems
            .map((item: any) => ({
                name: String(item?.name || item?.product || '').trim(),
                batch: String(item?.batch || item?.batchNo || '').trim(),
                packType: String(item?.packType || item?.pack || '').trim(),
                expiry: String(item?.expiry || item?.exp || '').trim(),
                quantity: toNumeric(item?.quantity) ?? 0,
                freeQuantity: toNumeric(item?.freeQuantity) ?? 0,
                purchasePrice: toNumeric(item?.purchasePrice ?? item?.rate) ?? 0,
                mrp: toNumeric(item?.mrp) ?? 0,
                gstPercent: toNumeric(item?.gstPercent ?? item?.gst) ?? undefined,
                discountPercent: toNumeric(item?.discountPercent ?? item?.discount) ?? undefined,
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
        return { supplier: '', invoiceNumber: '', date: '', items: [], error: `AI Extraction failed. ${parseNetworkAndApiError(error)}` };
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
