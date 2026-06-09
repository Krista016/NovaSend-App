import React, { useState, useCallback } from 'react';
import { generateCampaignCopy } from '../../services/geminiService';
import Button from './Button';

interface AICopywriterModalProps {
    onClose: () => void;
    onInsert: (text: string) => void;
}

const AICopywriterModal: React.FC<AICopywriterModalProps> = ({ onClose, onInsert }) => {
    const [goal, setGoal] = useState('');
    const [variations, setVariations] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = useCallback(async () => {
        if (!goal) return;
        setIsLoading(true);
        setError(null);
        setVariations([]);
        try {
            const results = await generateCampaignCopy(goal);
            setVariations(results);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [goal]);

    const handleInsert = (text: string) => {
        onInsert(text);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700 text-left">
                    <h2 className="text-xl font-bold">
                        <span className="gemini-glow">QuickCompose</span>
                        <span className="text-gray-800 dark:text-gray-200"> - AI Powered Writer </span>
                        <span className="text-base font-normal text-gray-500 dark:text-gray-400">©novasend.</span>
                    </h2>
                    <p className="text-lg text-gray-500 dark:text-gray-400 mt-2">Describe your message goal or provide a draft, and let QuickCompose refine it into the perfect message.</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label htmlFor="goal" className="text-sm font-medium">What is your message goal?</label>
                        <input
                            id="goal"
                            type="text"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            placeholder="e.g., A friendly reminder for an unpaid invoice"
                            className="mt-1 w-full h-14 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center text-lg"
                        />
                    </div>
                    <Button variant="primary" onClick={handleGenerate} disabled={isLoading || !goal} className="w-full">
                        {isLoading ? 'Generating...' : 'QuickCompose'}
                    </Button>
                </div>

                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 max-h-[40vh] overflow-y-auto ai-writer-scrollbar">
                    {isLoading && <div className="text-center text-gray-500">Thinking...</div>}
                    {error && <div className="text-center text-red-500">{error}</div>}
                    {variations.length > 0 && (
                        <div className="space-y-4">
                            {variations.map((text, index) => (
                                <div key={index} className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{text}</p>
                                    <div className="text-right mt-2">
                                        <Button variant="secondary" className="!text-xs !py-1 !px-2" onClick={() => handleInsert(text)}>Insert</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 text-right rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};

export default AICopywriterModal;