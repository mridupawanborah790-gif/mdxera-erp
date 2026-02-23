import type { ExtractedPurchaseBill, PurchaseItem, SubstituteResult, ExtractedSalesBill } from "../types";
import { parseNetworkAndApiError } from '../utils/error';

const SUPABASE_EDGE_BASE_URL = 'https://sblmbkgoiefqzykjksgm.supabase.co';
const SUPABASE_OCR_PATH = '/functions/v1/gemini_ocr';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibG1ia2dvaWVmcXp5a2prc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2Nzg2ODIsImV4cCI6MjA3NzI1NDY4Mn0.wK5E6TVZCavAqLrbZeyfgdToGyETRnQAbm5PPaAVlFw';
const PRIMARY_TEXT_MODEL = 'gemini-1.5-flash';

const SYSTEM_PERSONALITY = `You are the MDXERA ERP Assistant, a highly professional, efficient, and meticulous pharmacy management expert. 
Your primary goal is to help pharmacy owners manage their inventory, sales, and statutory compliance with absolute accuracy. 
Your tone is professional, helpful, and concise. You provide data-driven insights and actionable advice for business optimization.
Always prioritize pharmaceutical accuracy and professional standard operating procedures.`;

type EdgeAiResponse = {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> } }>;
};

type AiStreamChunk = { text: string };

type LiveCallbacks = {
    onopen?: () => void | Promise<void>;
    onmessage?: (message: any) => void | Promise<void>;
    onerror?: (error: unknown) => void;
    onclose?: () => void;
};

type LiveSession = {
    sendRealtimeInput: (_payload: any) => void;
    close: () => void;
};

type AiClientShape = {
    models: {
        generateContent: ({ model, ...params }: { model: string; [key: string]: any }) => Promise<EdgeAiResponse>;
        generateContentStream: ({ model, ...params }: { model: string; [key: string]: any }) => AsyncGenerator<AiStreamChunk, void, unknown>;
    };
    live: {
        connect: ({ callbacks }: { callbacks?: LiveCallbacks; [key: string]: any }) => Promise<LiveSession>;
    };
};

const getSupabaseAnonKey = (): string => {
    const env = (import.meta as any).env || {};
    return (
        env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        DEFAULT_SUPABASE_ANON_KEY
    );
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const parseAiError = (error: any): string => parseNetworkAndApiError(error);

const normalizeContents = (contents: any): any[] => {
    if (Array.isArray(contents)) return contents;
    if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }];
    if (contents && typeof contents === 'object') {
        if (Array.isArray(contents.parts)) return [{ role: 'user', parts: contents.parts }];
        return [contents];
    }
    return [{ role: 'user', parts: [{ text: String(contents ?? '') }] }];
};

const extractTextFromEdgeData = (data: any): string => {
    if (!data) return '';
    if (typeof data?.text === 'string') return data.text;

    const text = (data?.candidates || [])
        .flatMap((candidate: any) => candidate?.content?.parts || [])
        .map((part: any) => part?.text || '')
        .join('')
        .trim();

    return text;
};

const callGeminiOcrEdge = async (payload: Record<string, any>): Promise<any> => {
    const authKey = getSupabaseAnonKey();
    const response = await fetch(`${SUPABASE_EDGE_BASE_URL}${SUPABASE_OCR_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Gemini edge call failed (${response.status}): ${details}`);
    }

    const result = await response.json();
    if (!result?.success) {
        throw new Error(result?.error || 'Gemini edge call returned unsuccessful response');
    }

    return result.data;
};

const generateWithRetry = async (
    model: string,
    params: any,
    retries = 3,
    baseDelay = 2000
): Promise<EdgeAiResponse> => {
    let lastError: any;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const requestBody: any = {
                model,
                contents: normalizeContents(params?.contents),
            };

            if (params?.config?.systemInstruction) {
                requestBody.systemInstruction = String(params.config.systemInstruction);
            }

            const generationConfig: any = {};
            if (params?.config?.temperature !== undefined) generationConfig.temperature = params.config.temperature;
            if (params?.config?.topP !== undefined) generationConfig.topP = params.config.topP;
            if (params?.config?.responseMimeType) generationConfig.responseMimeType = params.config.responseMimeType;
            if (params?.config?.responseModalities) generationConfig.responseModalities = params.config.responseModalities;
            if (params?.config?.speechConfig) generationConfig.speechConfig = params.config.speechConfig;
            if (params?.config?.imageConfig) generationConfig.imageConfig = params.config.imageConfig;
            if (params?.config?.responseSchema) generationConfig.responseSchema = params.config.responseSchema;
            if (Object.keys(generationConfig).length > 0) requestBody.generationConfig = generationConfig;

            const data = await callGeminiOcrEdge(requestBody);
            return {
                ...(data || {}),
                text: typeof data?.text === 'string' ? data.text : extractTextFromEdgeData(data),
            };
        } catch (error: any) {
            lastError = error;
            const message = String(error?.message || '').toLowerCase();
            const shouldRetry = message.includes('429') || message.includes('limit') || message.includes('resource_exhausted') || message.includes('500') || message.includes('503') || message.includes('timeout');
            if (shouldRetry && attempt < retries - 1) {
                await wait(baseDelay * Math.pow(2, attempt));
                continue;
            }
            throw lastError;
        }
    }

    throw lastError;
};

export const getAiClient = (): AiClientShape => ({
    models: {
        generateContent: async ({ model, ...params }: { model: string; [key: string]: any }) => generateWithRetry(model, params),
        generateContentStream: async function* ({ model, ...params }: { model: string; [key: string]: any }) {
            const response = await generateWithRetry(model, params);
            yield { text: response.text || '' };
        },
    },
    live: {
        connect: async ({ callbacks }: { callbacks?: LiveCallbacks; [key: string]: any }) => {
            await callbacks?.onopen?.();
            return {
                sendRealtimeInput: () => { },
                close: () => callbacks?.onclose?.(),
            };
        },
    },
});

export const getAiInsights = async (summary: any): Promise<string[]> => {
    try {
        const prompt = `Analyze this pharmacy data and provide 3 brief actionable insights in a JSON array of strings: ${JSON.stringify(summary)}`;
        const response = await generateWithRetry(PRIMARY_TEXT_MODEL, {
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                temperature: 0.1,
                topP: 0.9,
                responseMimeType: "application/json",
            },
        });

        if (!response.text) throw new Error("Empty AI response");
        return JSON.parse(cleanJsonString(response.text));
    } catch (error: any) {
        console.error("Gemini Extraction Error Details:", error);
        return ["AI analysis is currently unavailable. Please check your connection and try again."];
    }
};

export interface FileInput {
    mimeType: string;
    data: string;
}

export const extractPurchaseDetailsFromBill = async (
    inputFiles: FileInput[],
    pharmacyName: string
): Promise<ExtractedPurchaseBill> => {
    try {
        const prompt = `
            Analyze these purchase invoice images for "${pharmacyName}".
            
            CROSS-PAGE CONSOLIDATION RULES:
            1. RECONCILE IDENTITY: If multiple pages are provided, they must belong to the same bill. However, allow for slight OCR variations in 'supplier' name (e.g., "M/S ABC" vs "ABC") or 'invoiceNumber' (e.g., "123" vs "0123"). Do not fail for minor formatting differences.
            2. AGGREGATE ALL ITEMS: Extract every single item from EVERY page. Do not stop after the first page. Combine them into a single list.
            3. CONSISTENT METADATA: Use the supplier name, GST, invoice number, and date from the best-quality page (usually the first).
             
            OCR QUALITY RULES (MANDATORY):
            4. Read line-items carefully using high OCR attention. Prefer exact text from image.
            5. For unclear characters, choose the most probable medicine text but do not invent rows.
            6. Preserve decimals for rate/MRP and parse discounts/schemes as numeric percentages.

            Return ONLY valid JSON following the schema.
        `;

        const extractedInvoiceText = [
            prompt,
            '',
            'INVOICE_IMAGE_DATA (base64 by page):',
            ...inputFiles.map((file, index) => `Page ${index + 1} (${file.mimeType}): ${file.data}`),
        ].join('\n');

        const parsed = await callGeminiOcrEdge({ prompt: extractedInvoiceText });
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
            ...(normalizedItems.length === 0 ? { error: "AI could not detect line items from this image. Try a full-page, well-lit photo with item rows clearly visible." } : {}),
        };
    } catch (error: any) {
        console.error("Gemini Extraction Error Details:", error);
        return {
            supplier: '',
            invoiceNumber: '',
            date: '',
            items: [],
            error: `AI Extraction failed. ${parseAiError(error)}`,
        };
    }
};

export const extractPrescription = async (
    file: FileInput,
    pharmacyName: string
): Promise<ExtractedSalesBill> => {
    try {
        const prompt = `
            Act as a highly accurate Pharmacist Assistant for ${pharmacyName}. Analyze the provided medical prescription.
            1. Extract the Patient Name (as customerName).
            2. Extract all listed medicines. For each, identify:
               - name: The brand or generic name.
               - quantity: The total number of units prescribed.
            Return ONLY valid JSON.
        `;

        const response = await generateWithRetry(PRIMARY_TEXT_MODEL, {
            contents: {
                parts: [
                    { inlineData: { mimeType: file.mimeType, data: file.data } },
                    { text: prompt },
                ],
            },
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                temperature: 0.1,
                topP: 0.9,
                responseMimeType: "application/json",
            },
        });

        if (!response.text) throw new Error("Empty AI response");
        return JSON.parse(cleanJsonString(response.text));
    } catch (error: any) {
        console.error("Prescription AI Error:", error);
        return { items: [], error: "Prescription analysis failed. Please ensure the image is clear." };
    }
};

export const generateTextToSpeech = async (text: string): Promise<string> => {
    try {
        const response = await generateWithRetry(PRIMARY_TEXT_MODEL, {
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });

        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (error) {
        throw new Error(parseAiError(error));
    }
};

export const generatePromotionalImage = async (prompt: string, logoUrl?: string): Promise<string> => {
    try {
        const parts: any[] = [{ text: `Social media graphic for: "${prompt}". Professional, clean, and medical aesthetic.` }];
        if (logoUrl?.startsWith('data:')) {
            const [mime, data] = logoUrl.split(';base64,');
            parts.push({ inlineData: { mimeType: mime.replace('data:', ''), data } });
        }

        const response = await generateWithRetry(PRIMARY_TEXT_MODEL, {
            contents: { parts },
            config: { imageConfig: { aspectRatio: "1:1" } },
        });

        const imageData = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
        if (!imageData) throw new Error("No image data returned.");
        return `data:${imageData.mimeType};base64,${imageData.data}`;
    } catch (error: any) {
        throw new Error(parseAiError(error));
    }
};

export const generateCaptionsForImage = async (prompt: string): Promise<string[]> => {
    try {
        const response = await generateWithRetry(PRIMARY_TEXT_MODEL, {
            contents: `Write 3 professional social media captions for this promo: "${prompt}". JSON array of strings.`,
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                temperature: 0.1,
                topP: 0.9,
                responseMimeType: "application/json",
            },
        });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch {
        return ["Your health is our priority.", "Genuine medicines at competitive rates.", "Professional care for the community."];
    }
};

export const findSubstitutes = async (text?: string, imageBase64?: string, mimeType?: string): Promise<SubstituteResult> => {
    const parts: any[] = [{ text: "Find medicine substitutes for: " + (text || "the provided image") }];
    if (imageBase64) {
        parts.push({ inlineData: { mimeType: mimeType!, data: imageBase64 } });
    }

    const systemInstruction = `${SYSTEM_PERSONALITY} You are an Expert Pharmacologist. Identify the salt and suggest 5-8 brand-name substitutes available in India.`;

    try {
        const response = await generateWithRetry('gemini-1.5-pro', {
            contents: { parts },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
            },
        });

        if (!response.text) throw new Error("Empty response from AI");
        return JSON.parse(cleanJsonString(response.text));
    } catch (error: any) {
        throw new Error(parseAiError(error));
    }
};
