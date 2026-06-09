import { Contact, GlobalPlaceholder } from '../types';

/**
 * Replaces spintax like {Hi|Hello} with a random choice.
 */
function processSpintax(text: string): string {
    return text.replace(/\{([^|}]+(?:\|[^|}]+)+)\}/g, (_, options: string) => {
        const choices = options.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

/**
 * Replaces personalization tags like {FirstName} with contact data.
 */
function personalizeMessage(text: string, contact: Contact): string {
    let personalizedText = text.replace(/\{FirstName\}/gi, contact.firstName || '');
    personalizedText = personalizedText.replace(/\{LastName\}/gi, contact.lastName || '');
    return personalizedText;
}

/**
 * Replaces global placeholders like {{business_name}} with defined values.
 */
function applyGlobalPlaceholders(text: string, placeholders: GlobalPlaceholder[]): string {
    let processedText = text;
    placeholders.forEach(p => {
        const regex = new RegExp(`\\{\\{${p.key}\\}\\}`, 'gi');
        processedText = processedText.replace(regex, p.value);
    });
    return processedText;
}

/**
 * Applies WhatsApp-like markdown formatting.
 * Note: This is a simplified version for display. WhatsApp Web handles the rendering.
 * We are just preparing the text with the correct characters.
 * Also, replaces '|' with newlines.
 */
function formatMessage(text: string): string {
    // Replace | with newline characters
    return text.replace(/\|/g, '\n');
}

/**
 * Processes a raw message template for a specific contact, applying all transformations.
 */
export function processMessageForContact(
    template: string,
    contact: Contact,
    globalPlaceholders: GlobalPlaceholder[]
): string {
    let message = applyGlobalPlaceholders(template, globalPlaceholders);
    message = personalizeMessage(message, contact);
    message = processSpintax(message);
    message = formatMessage(message);
    return message;
}
