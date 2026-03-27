import { get } from 'lodash-es';
import { AIModelConfig } from '../types';
import { geminiService } from './geminiService';

// Helper to resolve deep paths in objects
const resolvePath = (obj: unknown, path: string): unknown => {
    return get(obj, path);
};

export class ModelGateway {
    // Hardcoded fallback models in case remote fetch fails
    private static LOCAL_FALLBACK_MODELS: AIModelConfig[] = [
        {
            id: 'gemini-3.1-flash-lite-preview',
            name: 'Gemini 3.1 Flash-Lite',
            provider: 'google_native',
            family: 'text',
            contextWindow: 1000000,
            isDefault: true
        },
        {
            id: 'gemini-3.1-flash-preview',
            name: 'Gemini 3.1 Flash',
            provider: 'google_native',
            family: 'text',
            contextWindow: 1000000
        },
        {
            id: 'gemini-3.1-pro-preview',
            name: 'Gemini 3.1 Pro',
            provider: 'google_native',
            family: 'text',
            contextWindow: 2000000
        },
        {
            id: 'gemini-3.1-flash-image-preview',
            name: 'Nano Banana 2 (Flash)',
            provider: 'google_native',
            family: 'image',
            contextWindow: 0
        },
        {
            id: 'gemini-3-pro-image-preview',
            name: 'Nano Banana Pro',
            provider: 'google_native',
            family: 'image',
            contextWindow: 0
        },
        {
            id: 'veo-3.1-fast-generate-preview',
            name: 'Veo 3.1 Fast',
            provider: 'google_native',
            family: 'video',
            contextWindow: 0
        }
    ];

    /**
     * Fetches model definitions from a remote source.
     * Returns fallback models if the request fails.
     */
    async fetchRemoteDefinitions(): Promise<AIModelConfig[]> {
        // Fallback models are maintained locally for stability
        return ModelGateway.LOCAL_FALLBACK_MODELS;
    }

    /**
     * The Universal Payload Constructor.
     * Maps internal variables (prompt, modelId, etc.) into the specific JSON structure
     * required by the external API based on paramMapping.
     */
    private constructPayload(mapping: unknown, inputs: Record<string, unknown>): unknown {
        if (typeof mapping === 'string') {
            // Check for {{variable}} syntax
            if (mapping.startsWith('{{') && mapping.endsWith('}}')) {
                const key = mapping.slice(2, -2);
                return inputs[key] !== undefined ? inputs[key] : mapping;
            }
            return mapping;
        } else if (Array.isArray(mapping)) {
            return mapping.map(item => this.constructPayload(item, inputs));
        } else if (typeof mapping === 'object' && mapping !== null) {
            const result: Record<string, unknown> = {};
            for (const key in mapping as Record<string, unknown>) {
                result[key] = this.constructPayload((mapping as Record<string, unknown>)[key], inputs);
            }
            return result;
        }
        return mapping;
    }

    /**
     * Executes a generic API request handling headers, auth, and async polling.
     */
    private async executeGenericRequest(
        config: AIModelConfig, 
        inputs: Record<string, unknown>
    ): Promise<unknown> {
        const apiKey = localStorage.getItem(`apikey_${config.provider}`);
        if (!apiKey && config.provider !== 'google_native') {
            throw new Error(`Missing API Key for provider: ${config.provider}`);
        }

        const endpoint = config.endpoints?.generate;
        if (!endpoint) throw new Error(`No generation endpoint defined for model ${config.name}`);

        // 1. Prepare Headers (inject API Key)
        const headers: Record<string, string> = {};
        if (endpoint.headers) {
            for (const [key, value] of Object.entries(endpoint.headers)) {
                headers[key] = value.replace('{{key}}', apiKey || '');
            }
        }

        // 2. Prepare Payload
        // We inject the model ID into inputs so it can be mapped if needed
        const requestInputs = { ...inputs, id: config.id };
        const body = this.constructPayload(endpoint.paramMapping, requestInputs);

        // 3. URL Templating (CRITICAL FOR FAL/REPLICATE)
        // Replaces placeholders like {{id}} inside the URL string itself
        let finalUrl = endpoint.url;
        if (finalUrl.includes('{{')) {
             if (config.id) finalUrl = finalUrl.replace('{{id}}', config.id);
             // Add any other replacements if needed
        }

        // 4. Make Request
        const response = await fetch(finalUrl, {
            method: endpoint.method,
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Provider Error (${response.status}): ${errText}`);
        }

        const data = await response.json();

        // 5. Handle Output Mapping
        // If there is a status endpoint defined, we assume Async Polling pattern
        if (config.endpoints?.status) {
            return this.pollForCompletion(data, config, apiKey || '');
        } else {
            // Synchronous response
            return data;
        }
    }

    /**
     * Polls a status endpoint until completion.
     */
    private async pollForCompletion(initialResponse: unknown, config: AIModelConfig, apiKey: string): Promise<unknown> {
        const statusEndpoint = config.endpoints!.status!;
        
        // Extract Task ID from initial response based on Generate endpoint's output mapping
        const taskIdPath = config.endpoints?.generate.outputMapping?.['id'] || 'id';
        const taskId = resolvePath(initialResponse, taskIdPath);

        if (!taskId) throw new Error("Could not extract Task ID from initial response for polling.");

        // Prepare Status Headers
        const headers: Record<string, string> = {};
        if (statusEndpoint.headers) {
            for (const [key, value] of Object.entries(statusEndpoint.headers)) {
                headers[key] = value.replace('{{key}}', apiKey);
            }
        }

        // URL Templating for Status Endpoint
        const statusUrl = (statusEndpoint.url as string).replace('{{id}}', taskId as string);
        
        const POLLING_INTERVAL = 2000; // 2s
        const MAX_ATTEMPTS = 60; // 2 mins timeout roughly

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await new Promise(r => setTimeout(r, POLLING_INTERVAL));

            const response = await fetch(statusUrl, {
                method: statusEndpoint.method,
                headers
            });
            
            if (!response.ok) continue; // Retry on transient network errors?

            const data = await response.json();
            
            // Check Status
            const statusPath = statusEndpoint.outputMapping?.['status'] || 'status';
            const statusValue = resolvePath(data, statusPath);

            // Common success flags (case-insensitive check)
            const s = String(statusValue).toLowerCase();
            if (['succeeded', 'completed', 'done', 'success'].includes(s)) {
                return data;
            }

            if (['failed', 'error', 'canceled'].includes(s)) {
                throw new Error(`Generation failed with status: ${statusValue}`);
            }
        }

        throw new Error("Generation timed out.");
    }

    /**
     * Generates text content.
     */
    async generateText(prompt: string, config: AIModelConfig, systemInstruction?: string): Promise<string> {
        if (config.provider === 'google_native') {
            const { GoogleGenAI } = await import("@google/genai");
            const apiKey = localStorage.getItem('gemini_api_key') || '';
            if (!apiKey) throw new Error("Google API Key not found.");

            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: config.id,
                contents: prompt,
                config: { systemInstruction }
            });

            return response.text || '';
        } else {
            // Generic Provider
            try {
                const rawResponse = await this.executeGenericRequest(config, { prompt });
                
                // Extract text using mapping
                const resultPath = config.endpoints?.generate.outputMapping?.['text'] || 'text';
                const text = resolvePath(rawResponse, resultPath);
                
                if (typeof text !== 'string') throw new Error("Could not extract text from provider response.");
                return text;
            } catch (e: unknown) {
                console.error("Generic Text Generation Error:", e);
                throw new Error(`[${config.name}] Error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    /**
     * Generates visual content.
     */
    async generateVisual(prompt: string, config: AIModelConfig): Promise<string> {
        if (config.provider === 'google_native') {
            return geminiService.generateVisual(prompt, config.id as 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview');
        } else {
            // Generic Provider
            try {
                // Determine if we are waiting for a final polling result or sync result
                const rawResponse = await this.executeGenericRequest(config, { prompt });

                // If async polling was used, rawResponse is the final status response.
                // If sync, it's the generate response.
                
                const endpointDef = config.endpoints?.status ? config.endpoints.status : config.endpoints?.generate;
                const resultPath = endpointDef?.outputMapping?.['image'] || 'image_url'; 
                
                const imageUrl = resolvePath(rawResponse, resultPath);

                if (!imageUrl) throw new Error("Could not extract image URL from provider response.");

                // If result is a URL (not base64), fetch and convert to base64 for local storage
                if ((imageUrl as string).startsWith('http')) {
                    // Fetch image directly (assuming CORS allows or it's a public URL)
                    const imgResp = await fetch(imageUrl as string);
                    const blob = await imgResp.blob();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const b64 = (reader.result as string).split(',')[1];
                            resolve(b64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } else if ((imageUrl as string).startsWith('data:image')) {
                    return (imageUrl as string).split(',')[1];
                } else {
                    // Assume raw base64
                    return imageUrl as string;
                }
            } catch (e: unknown) {
                console.error("Generic Visual Generation Error:", e);
                throw new Error(`[${config.name}] Error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
}

export const modelGateway = new ModelGateway();