
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LiveServerMessage, Modality, Blob as GenaiBlob, Content } from '@google/genai';
import type { ChatMessage, InventoryItem, Transaction, Purchase, Distributor, Customer, Medicine } from '../types';
import { encode, decode, decodeAudioData } from '../utils/audio';
import { getAiClient } from '../services/geminiService';
import { parseNetworkAndApiError } from '../utils/error';

const AiIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2.69l.346.666L19.5 15.3l-6.846 4.01L6.5 15.3l7.154-11.944z"/><path d="M12 22v-6"/><path d="M12 8V2"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m4.93 19.07 4.24-4.24"/></svg>
);

interface AppData {
    inventory: InventoryItem[];
    transactions: Transaction[];
    purchases: Purchase[];
    distributors: Distributor[];
    customers: Customer[];
    medicines: Medicine[];
}

interface ChatbotProps {
    appData: AppData;
}


const Chatbot: React.FC<ChatbotProps> = ({ appData }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [transcription, setTranscription] = useState<{input: string, output: string}>({input: '', output: ''});

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const transcriptionRef = useRef({input: '', output: ''});

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, transcription]);

    useEffect(() => {
        setMessages([
            {
                role: 'model',
                parts: [{ text: "Hello! Welcome to MDXERA ERP! I am your AI Assistant, here to help you manage your pharmacy efficiently. How can I help you today?" }]
            }
        ]);
    }, []);
    
    const handleSendMessage = async (textOverride?: string) => {
        const text = textOverride || inputValue;
        if (!text.trim() || isLoading) return;
        
        const ai = getAiClient(); 
        if (!ai) {
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: "The AI configuration is currently missing. Please contact support." }] }]);
            return;
        }

        if (!textOverride) setInputValue('');
        
        const userMessage: ChatMessage = { role: 'user', parts: [{ text }] };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setIsLoading(true);

        const systemInstruction = `You are the MDXERA ERP Assistant. You are a professional, efficient, and expert assistant for the MDXERA ERP Pharmacy system. Answer based ONLY on the provided pharmacy data. Stay professional and helpful.`;
        
        const dataContext = `This is the pharmacy's current state in JSON: ${JSON.stringify(appData)}`;

        const primeUser: Content = { role: 'user', parts: [{ text: dataContext }] };
        const primeModel: Content = { role: 'model', parts: [{ text: 'I have analyzed the current data state. I am ready to assist with your queries.' }] };
        
        const history: Content[] = updatedMessages.map(msg => ({
            role: msg.role,
            parts: msg.parts.map(p => ({ text: p.text })),
        }));
        
        const contents: Content[] = [primeUser, primeModel, ...history.slice(-10)];

        try {
            const stream = await ai.models.generateContentStream({
                model: 'gemini-3-flash-preview',
                contents,
                config: { systemInstruction },
            });

            let currentResponse: ChatMessage = { role: 'model', parts: [{ text: '' }] };
            setMessages(prev => [...prev, currentResponse]);

            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk.text;
                currentResponse = { ...currentResponse, parts: [{ text: fullText }] };
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = currentResponse;
                    return newMessages;
                });
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: "I encountered an error while processing your request. Please try again." }] }]);
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        const handleAiTrigger = (e: any) => {
            if (e.detail && e.detail.prompt) {
                setIsOpen(true);
                handleSendMessage(e.detail.prompt);
            }
        };
        window.addEventListener('trigger-ai-assistant', handleAiTrigger);
        return () => window.removeEventListener('trigger-ai-assistant', handleAiTrigger);
    }, [messages]);

    const stopListening = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        audioContextRef.current?.close();
        for (const source of sourcesRef.current.values()) { source.stop(); }
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        sessionPromiseRef.current = null;
        setIsListening(false);
        setTranscription({input: '', output: ''});
        transcriptionRef.current = {input: '', output: ''};
    }, []);

    const startListening = useCallback(async () => {
        try {
            const ai = getAiClient();
            if (!ai) return;

            if (!outputAudioContextRef.current) {
                outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' }}},
                    systemInstruction: "You are the MDXERA ERP Assistant. Be helpful, professional, and efficient."
                },
                callbacks: {
                    onopen: async () => {
                        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        audioContextRef.current = context;
                        const source = context.createMediaStreamSource(mediaStreamRef.current);
                        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: GenaiBlob = {
                                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(context.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        const context = outputAudioContextRef.current;
                        if (!context) return;
                        if (message.serverContent?.outputTranscription) transcriptionRef.current.output += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.inputTranscription) transcriptionRef.current.input += message.serverContent.inputTranscription.text;
                        setTranscription({ ...transcriptionRef.current });
                        if (message.serverContent?.turnComplete) {
                            const fullInput = transcriptionRef.current.input;
                            const fullOutput = transcriptionRef.current.output;
                            if (fullInput.trim()) setMessages(prev => [...prev, { role: 'user', parts: [{ text: fullInput }] }]);
                            if (fullOutput.trim()) setMessages(prev => [...prev, { role: 'model', parts: [{ text: fullOutput }] }]);
                            transcriptionRef.current = { input: '', output: '' };
                            setTranscription({ input: '', output: '' });
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (base64Audio) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, context.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), context, 24000, 1);
                            const source = context.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(context.destination);
                            source.addEventListener('ended', () => { sourcesRef.current.delete(source); });
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }
                    },
                    onerror: (e) => { stopListening(); },
                    onclose: () => { stopListening(); }
                }
            });
        } catch (error) {
            setIsListening(false);
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: "Microphone access failed. Please ensure permissions are granted." }] }]);
        }
    }, [stopListening]);
    
    const handleMicClick = () => {
        if (isListening) stopListening();
        else { setIsListening(true); startListening(); }
    };

    return (
        <>
            <div className={`fixed bottom-6 right-6 z-40 transition-transform duration-300 print:hidden ${isOpen ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}>
                <button onClick={() => setIsOpen(true)} className="bg-primary text-white rounded-none p-4 shadow-lg hover:bg-primary-dark ring-4 ring-primary/20 font-normal">
                    <AiIcon className="w-8 h-8"/>
                </button>
            </div>

            <div className={`fixed bottom-6 right-6 z-50 w-96 bg-[var(--modal-bg-light)] dark:bg-[var(--modal-bg-dark)] rounded-none shadow-2xl flex flex-col transition-all duration-300 print:hidden border border border-[var(--modal-border-color-light)] dark:border-[var(--modal-border-color-dark)] ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16 pointer-events-none'}`} style={{ height: '70vh' }}>
                <div className="flex items-center justify-between p-4 border-b border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)] bg-primary text-white rounded-none">
                    <div className="flex items-center space-x-2">
                        <AiIcon className="w-5 h-5 text-accent"/>
                        <h3 className="font-black text-xs uppercase tracking-widest">MDXERA ERP Assistant</h3>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-white hover:text-accent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-app-bg font-normal text-app-text-primary">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-2 rounded-none shadow-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-white dark:bg-zinc-800 border border-app-border text-app-text-primary font-bold uppercase text-[12px]'}`}>
                                <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && <div className="flex justify-start"><div className="animate-bounce text-primary font-black uppercase text-[10px]">Processing...</div></div>}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-app-border bg-white dark:bg-zinc-900 rounded-none">
                    <div className="flex items-center space-x-2">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={isListening ? 'Listening...' : 'Ask about stock, sales or analysis...'}
                            className="flex-1 px-4 py-2 border border-app-border rounded-none bg-input-bg text-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold uppercase"
                            disabled={isLoading || isListening}
                        />
                        <button onClick={handleMicClick} className={`p-2 rounded-none transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-primary hover:bg-gray-100'}`} disabled={isLoading}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </button>
                        <button onClick={() => handleSendMessage()} disabled={isLoading || isListening || !inputValue.trim()} className="p-2 text-white bg-primary rounded-none hover:bg-primary-dark shadow-md transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Chatbot;