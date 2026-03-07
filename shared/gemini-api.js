// Gemini API Service Module
export class GeminiAPI {
    constructor(apiKey, modelName = 'gemini-2.5-flash') {
        this.apiKey = apiKey;
        this.modelName = modelName;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    async generateContent(prompt, retryCount = 0) {
        if (!this.apiKey) {
            throw new Error('Gemini API Key is missing. Please check your settings.');
        }

        const url = `${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`;

        try {
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

                // Handle Quota/Rate Limit (429) with Exponential Backoff
                if (response.status === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit')) {
                    if (retryCount < 3) {
                        const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
                        console.warn(`Gemini API Quota reached. Retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return this.generateContent(prompt, retryCount + 1);
                    }
                    throw new Error(`Quota Exceeded: The AI is currently busy (Rate Limit). Please wait 30-60 seconds and try again.`);
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
        } catch (fetchError) {
            if (fetchError.message.includes('Quota Exceeded')) throw fetchError;
            console.error('Gemini Fetch Error:', fetchError);
            throw new Error(`Network error or API failure: ${fetchError.message}`);
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

    /**
     * AI Duplicate Resolver
     */
    async ResolveDuplicates(groupType, groupKey, items) {
        const prompt = `
            I have a group of duplicate bookmarks that are either exact URL matches or from the same domain.
            
            GROUP TYPE: ${groupType}
            IDENTIFIER: ${groupKey}

            BOOKMARKS IN GROUP:
            ${JSON.stringify(items.map(item => ({
            id: item.id,
            title: item.title,
            url: item.url,
            folder: item.folderPath || 'Unknown'
        })))}

            TASK:
            1. Analyze which bookmark is the "best" to keep (usually the one in the most logical folder or with the cleanest title).
            2. Decide what to do with the others (DELETE them).
            3. If the "best" one is currently in a poor folder (like "Other Bookmarks"), suggest MOVING it to a better folder name (existing or new).
            4. In the "reason" field, EXPLAIN your choice using titles and folder names instead of IDs. DO NOT use raw numerical IDs in your explanation.

            RETURN ONLY a JSON object:
            {
                "decision": {
                    "keepId": "id-of-bookmark-to-keep",
                    "deleteIds": ["id1", "id2"],
                    "moveToFolder": "Existing or New Folder Name (or null if stay)",
                    "reason": "Short explanation of your choice"
                }
            }
        `;

        return await this.generateContent(prompt);
    }
}
