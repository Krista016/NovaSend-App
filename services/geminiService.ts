
import { GoogleGenAI, Type } from "@google/genai";

// Ensure API_KEY is set in the environment variables
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!ai && API_KEY) {
        ai = new GoogleGenAI({ apiKey: API_KEY });
    }
    return ai;
};

/**
 * Generates campaign message variations using the Gemini API.
 * @param goal - The user's goal for the campaign message.
 * @returns A promise that resolves to an array of message variations.
 */
export const generateCampaignCopy = async (goal: string): Promise<string[]> => {
    const aiClient = getAiClient();
    if (!aiClient) {
        return ["AI features are disabled. Please configure your API key."];
    }

    try {
        const prompt = `You are an expert copywriter for WhatsApp marketing campaigns.
        A user wants to create a message with the following goal: "${goal}".
        
        Generate 3 distinct message variations. Each variation should:
        1. Be concise, professional, and effective for WhatsApp.
        2. Include spintax to help avoid blocking. For example, use {Hello|Hi|Greetings} for salutations.
        3. Be ready to be copied and pasted directly into a campaign.
        
        Return the response as a JSON object with a single key "variations" which is an array of the 3 message strings.`;

        const response = await aiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        variations: {
                            type: Type.ARRAY,
                            description: 'An array of 3 distinct message variations with spintax.',
                            items: {
                                type: Type.STRING
                            }
                        }
                    }
                }
            }
        });

        // The response.text should be a JSON string that conforms to the schema
        const jsonResponse = JSON.parse(response.text);

        if (jsonResponse && Array.isArray(jsonResponse.variations)) {
            return jsonResponse.variations;
        }

        return ["Sorry, the AI returned an unexpected format."];

    } catch (error) {
        console.error("Error generating campaign copy with Gemini API:", error);
        if (error instanceof Error) {
            return [`An error occurred with the AI service: ${error.message}`];
        }
        return ["An unknown error occurred with the AI service."];
    }
};

export interface MessageAnalysis {
    clarity: string;
    tone: string;
    spamScore: number;
    spamReasoning: string;
    suggestions: string[];
}

/**
 * Analyzes a campaign message for quality and spam risk using the Gemini API.
 * @param message - The campaign message to analyze.
 * @returns A promise that resolves to a structured analysis object.
 */
export const analyzeCampaignMessage = async (message: string): Promise<MessageAnalysis> => {
    const aiClient = getAiClient();
    if (!aiClient) {
        throw new Error("AI features are disabled. Please configure your API key.");
    }

    try {
        const prompt = `As a WhatsApp marketing expert, analyze the following message for its effectiveness and risk of being flagged as spam.

        Message: "${message}"

        Provide a detailed analysis based on the following criteria:
        1.  **Clarity & Conciseness**: Is the message clear, concise, and easy to understand?
        2.  **Tone Analysis**: Describe the perceived tone (e.g., friendly, urgent, professional).
        3.  **Spam Trigger Score**: Rate the spam risk on a scale of 1 (very low) to 10 (very high).
        4.  **Spam Reasoning**: Briefly explain the reason for the spam score, mentioning any trigger words or risky patterns.
        5.  **Suggestions for Improvement**: Provide a few actionable bullet points to improve the message.

        Return the analysis as a JSON object.`;

        const response = await aiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        clarity: {
                            type: Type.STRING,
                            description: "Analysis of the message's clarity and conciseness.",
                        },
                        tone: {
                            type: Type.STRING,
                            description: "The perceived tone of the message.",
                        },
                        spamScore: {
                            type: Type.INTEGER,
                            description: "A spam risk score from 1 to 10.",
                        },
                        spamReasoning: {
                            type: Type.STRING,
                            description: "A brief explanation for the spam score provided.",
                        },
                        suggestions: {
                            type: Type.ARRAY,
                            description: "An array of actionable suggestions for improving the message.",
                            items: {
                                type: Type.STRING
                            }
                        }
                    }
                }
            }
        });

        const jsonResponse = JSON.parse(response.text);

        if (jsonResponse && typeof jsonResponse.spamScore === 'number') {
            return jsonResponse as MessageAnalysis;
        }

        throw new Error("The AI returned an unexpected format.");

    } catch (error) {
        console.error("Error analyzing message with Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`An error occurred with the AI service: ${error.message}`);
        }
        throw new Error("An unknown error occurred with the AI service.");
    }
};
