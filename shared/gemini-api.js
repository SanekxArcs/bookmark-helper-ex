// Gemini API Service Module
export class GeminiAPI {
    constructor(apiKey, modelName = 'gemini-1.5-flash') {
        this.apiKey = apiKey;
        this.modelName = modelName;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    async generateContent(prompt) {
        if (!this.apiKey) {
            throw new Error('Gemini API Key is missing. Please check your settings.');
        }

        const url = `${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1, // Set low for consistent categorization
                    maxOutputTokens: 8192, // Increased from 2048 to prevent truncation on large folder sorts
                    responseMimeType: 'application/json' // Request JSON response
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            const message = error?.error?.message || `API Error: ${response.status}`;

            if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit')) {
                throw new Error(`Quota Exceeded: Please switch to a different model in settings (e.g., 1.5 Flash-8B) or wait a moment.`);
            }

            throw new Error(message);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        try {
            // Robust JSON cleaning for AI responses
            let cleaned = textResponse.trim();

            // 1. Remove markdown code blocks if present (```json ... ``` or ``` ...)
            cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1');

            // 2. Extra safety: try to extract everything between the first '{' and last '}'
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            }

            try {
                return JSON.parse(cleaned);
            } catch (parseError) {
                // If it still fails, it might be truncated. Try to "seal" the JSON
                console.warn('Attempting to seal truncated JSON response...');
                const sealed = this.sealTruncatedJSON(cleaned);
                return JSON.parse(sealed);
            }
        } catch (e) {
            console.error('Failed to parse AI response as JSON:', textResponse);
            throw new Error(`AI returned an invalid JSON response. Please try again. (Raw: ${textResponse.substring(0, 50)}...)`);
        }
    }

    /**
     * Attempts to "seal" a truncated JSON string by closing open quotes, braces, and arrays.
     */
    sealTruncatedJSON(jsonString) {
        let stack = [];
        let inString = false;
        let escaped = false;
        let result = jsonString;

        for (let i = 0; i < jsonString.length; i++) {
            const char = jsonString[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) continue;

            if (char === '{' || char === '[') {
                stack.push(char === '{' ? '}' : ']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }

        // 1. If we are in a string, close it
        if (inString) {
            result += '"';
        }

        // 2. Clean up any trailing garbage (like the start of a key or value that was cut off)
        // This is tricky. Let's find the last valid comma or opening brace/bracket
        // and remove everything after it before we close the stack.
        // If we were inside a key or value, it's safer to discard the partial entry.
        const lastComma = result.lastIndexOf(',');
        const lastBrace = Math.max(result.lastIndexOf('{'), result.lastIndexOf('['));

        if (lastComma > lastBrace) {
            result = result.substring(0, lastComma);
        } else if (lastBrace !== -1) {
            // If the last thing we see is an opener, and we have garbage after it, wipe it
            // This happens if it was cut off at '"key":' or similar.
            const afterBrace = result.substring(lastBrace + 1).trim();
            if (afterBrace.length > 0 && !afterBrace.startsWith('{') && !afterBrace.startsWith('[')) {
                // Check if it's already closed correctly
                if (!afterBrace.endsWith('}') && !afterBrace.endsWith(']')) {
                    result = result.substring(0, lastBrace + 1);
                }
            }
        }

        // 3. Close open braces/brackets
        while (stack.length > 0) {
            result += stack.pop();
        }

        return result;
    }

    /**
     * Helper to categorization of site info
     */
    async ProposeFolder(pageTitle, url, currentFolders, personalContext = '') {
        const prompt = `
            As a bookmark organization assistant, find the most relevant folder in my current structure for this page.
            
            Page info:
            - Title: "${pageTitle}"
            - URL: "${url}"
            ${personalContext ? `- User's personal note/use case: "${personalContext}"` : ''}
            
            EXISTING FOLDER STRUCTURE (Prefer these!): 
            ${JSON.stringify(currentFolders)}

            TASK:
            1. Search for the BEST fitting folder from the existing structure above.
            2. Suggest a NEW folder ONLY if none of the existing ones are appropriate.
            3. Return ONLY a JSON object in this format:
            {
                "proposal": {
                    "folderId": "id-of-existing-folder-or-null",
                    "folderName": "Name of folder (existing or new)",
                    "isNew": boolean,
                    "reason": "short explanation why it fits"
                }
            }
        `;

        return await this.generateContent(prompt);
    }
}
