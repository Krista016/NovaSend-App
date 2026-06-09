import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { countryCodes } from '../../services/phoneValidator';
import { ChevronDownIcon, SearchIcon, SparklesIcon } from '../icons/Icons';
import { analyzeCampaignMessage, MessageAnalysis } from '../../services/geminiService';
import { useAppContext } from '../../hooks/useAppContext';

const CountrySelector: React.FC<{
    selectedCode: string;
    onChange: (code: string) => void;
}> = ({ selectedCode, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedCountry = useMemo(() => {
        return countryCodes.find(c => c.dial_code === selectedCode) || countryCodes[0];
    }, [selectedCode]);

    const filteredCountries = useMemo(() => {
        if (!searchTerm) return countryCodes;
        return countryCodes.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            c.dial_code.includes(searchTerm)
        );
    }, [searchTerm]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-10 px-4 py-2 flex items-center justify-between text-left bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600/50 transition"
            >
                <span className="truncate">{selectedCountry.name} ({selectedCountry.dial_code})</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-200 dark:border-gray-700">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                         <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search country..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-0 rounded-md transition"
                            />
                        </div>
                    </div>
                    <ul className="p-1 max-h-60 overflow-y-auto">
                        {filteredCountries.map(country => (
                            <li
                                key={country.code}
                                onClick={() => {
                                    onChange(country.dial_code);
                                    setIsOpen(false);
                                }}
                                className={`px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedCode === country.dial_code ? 'font-semibold bg-gray-100 dark:bg-gray-700' : ''}`}
                            >
                                {country.name} ({country.dial_code})
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};


const PhoneNumberConverter: React.FC = () => {
    const [inputNumbers, setInputNumbers] = useState('');
    const [outputNumbers, setOutputNumbers] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('+1');
    const [removeLeadingZero, setRemoveLeadingZero] = useState(false);
    const [appendCountryCode, setAppendCountryCode] = useState(false);

    const convertNumbers = () => {
        if (!inputNumbers.trim()) {
            setOutputNumbers('');
            return;
        }
        
        const lines = inputNumbers.split('\n').filter(line => line.trim() !== '');
        
        const converted = lines.map(line => {
            let num = line.trim();

            num = num.replace(/[a-zA-Z]/g, char => {
                const c = char.toUpperCase();
                if ('ABC'.includes(c)) return '2'; if ('DEF'.includes(c)) return '3';
                if ('GHI'.includes(c)) return '4'; if ('JKL'.includes(c)) return '5';
                if ('MNO'.includes(c)) return '6'; if ('PQRS'.includes(c)) return '7';
                if ('TUV'.includes(c)) return '8'; if ('WXYZ'.includes(c)) return '9';
                return '';
            });

            num = num.split(/ext/i)[0];
            num = num.replace(/^[a-zA-Z\s:]+/, '');

            let cleaned = num.replace(/[^\d+]/g, '');

            if (cleaned.startsWith('00')) {
                cleaned = '+' + cleaned.substring(2);
            }

            if (!cleaned.startsWith('+')) {
                if (removeLeadingZero && cleaned.startsWith('0')) {
                    cleaned = cleaned.substring(1);
                }
                if (appendCountryCode) {
                    cleaned = selectedCountry + cleaned;
                }
            }

            if (cleaned.replace('+', '').length < 7) {
                return line;
            }

            return cleaned;
        }).join('\n');

        setOutputNumbers(converted);
    };
    
    return (
        <Card title="Phone Number Format Converter">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                This powerful tool prepares phone numbers for WhatsApp by removing symbols, spaces, and text, converting them into a clean, international format.
            </p>
            
            <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                <h3 className="font-semibold text-lg mb-4 text-gray-800 dark:text-gray-200">Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selected Country for Conversion</label>
                        <CountrySelector selectedCode={selectedCountry} onChange={setSelectedCountry} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remove Leading Zero?</label>
                         <select onChange={(e) => setRemoveLeadingZero(e.target.value === 'yes')} value={removeLeadingZero ? 'yes' : 'no'} className="w-full h-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition p-1 text-sm">
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Append Country Code ({selectedCountry})?</label>
                        <select onChange={(e) => setAppendCountryCode(e.target.value === 'yes')} value={appendCountryCode ? 'yes' : 'no'} className="w-full h-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition p-1 text-sm">
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Input</label>
                    <textarea
                        rows={10}
                        value={inputNumbers}
                        onChange={e => setInputNumbers(e.target.value)}
                        placeholder={`+1-800-555-0199 ext. 235\n(123) 456 7890\n0044 20 7946 0958\nVodafone: 08080 044 668...`}
                        className="w-full p-3 bg-white dark:bg-gray-700/50 rounded-lg font-mono border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] resize-none utilities-scrollbar"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Output</label>
                    <textarea
                        readOnly
                        rows={10}
                        value={outputNumbers}
                        placeholder="Output will appear here..."
                        className="w-full p-3 bg-gray-100 dark:bg-gray-900/50 rounded-lg font-mono text-green-500 dark:text-green-400 border border-gray-300 dark:border-gray-600 focus:outline-none resize-none utilities-scrollbar"
                    />
                </div>
            </div>

             <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={convertNumbers} className="!bg-green-600 hover:!bg-green-700 text-white flex-grow sm:flex-grow-0">Convert Numbers</Button>
                <Button variant="primary" onClick={() => navigator.clipboard.writeText(outputNumbers)} disabled={!outputNumbers} className="flex-grow sm:flex-grow-0">Copy Output</Button>
                <Button onClick={() => setOutputNumbers('')} className="!bg-red-500 hover:!bg-red-600 text-white flex-grow sm:flex-grow-0">Clear Output</Button>
                <Button onClick={() => { setInputNumbers(''); setOutputNumbers(''); }} className="!bg-red-500 hover:!bg-red-600 text-white flex-grow sm:flex-grow-0">Clear All</Button>
            </div>
        </Card>
    );
};

const PhoneNumberReplicator: React.FC = () => {
    const [inputNumbers, setInputNumbers] = useState('');
    const [replications, setReplications] = useState(2);

    const replicatedNumbers = useMemo(() => {
        if (!inputNumbers.trim() || replications < 1) return '';
        const lines = inputNumbers.split('\n').filter(line => line.trim() !== '');
        const result: string[] = [];
        lines.forEach(line => {
            for (let i = 0; i < replications; i++) {
                result.push(line);
            }
        });
        return result.join('\n');
    }, [inputNumbers, replications]);

    return (
        <Card title="Phone Number Replicator">
             <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Duplicate phone numbers in a list. Useful for sending multiple unique messages or files to the same contacts.</p>
             <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-4">
                <label className="text-sm font-semibold mb-1 block">How many times to replicate each number?</label>
                <input
                    type="number"
                    min="1"
                    value={replications}
                    onChange={e => setReplications(parseInt(e.target.value, 10) || 1)}
                    className="w-full md:w-1/3 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition p-2"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea
                    rows={10}
                    value={inputNumbers}
                    onChange={e => setInputNumbers(e.target.value)}
                    placeholder="Input numbers, one per line..."
                    className="w-full p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md font-mono resize-none utilities-scrollbar"
                />
                <textarea
                    readOnly
                    rows={10}
                    value={replicatedNumbers}
                    placeholder="Output will appear here..."
                    className="w-full p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md font-mono text-green-400 resize-none utilities-scrollbar"
                />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button 
                    variant="primary" 
                    onClick={() => navigator.clipboard.writeText(replicatedNumbers)}
                    disabled={!replicatedNumbers}
                >
                    Copy Output
                </Button>
                <Button 
                    onClick={() => setInputNumbers('')}
                    className="!bg-red-500 hover:!bg-red-600 text-white"
                >
                    Clear Input
                </Button>
            </div>
        </Card>
    );
};

const SpintaxValidator: React.FC = () => {
    const [template, setTemplate] = useState('{Hi|Hello|Greetings} {FirstName|friend}, {how are you|how is it going}? {Hope you are having a great day|Wishing you the best}.');
    const [spinResult, setSpinResult] = useState('');
    const [variations, setVariations] = useState<string[]>([]);
    
    const validation = useMemo(() => {
        if (!template.trim()) return { isValid: true, error: null, combinations: 0 };
        
        let balance = 0;
        let nested = false;
        
        for (let i = 0; i < template.length; i++) {
            if (template[i] === '{') {
                balance++;
                if (balance > 1) nested = true;
            } else if (template[i] === '}') {
                balance--;
                if (balance < 0) {
                    return { isValid: false, error: 'Found unmatched closing brace "}"', combinations: 0 };
                }
            }
        }
        
        if (balance > 0) {
            return { isValid: false, error: 'Found unclosed opening brace "{"', combinations: 0 };
        }
        if (nested) {
            return { isValid: false, error: 'Nested spintax is not supported (e.g. {a|{b|c}})', combinations: 0 };
        }
        
        const emptyOptionRegex = /\{[^}]*\|\|[^}]*\}|\{\||\|\}/;
        if (emptyOptionRegex.test(template)) {
            return { isValid: false, error: 'Found empty option in spintax (e.g. {a||b})', combinations: 0 };
        }
        
        // Count combinations
        const spintaxRegex = /\{([^{}]+?)\}/g;
        let match;
        let combinations = 1;
        let hasSpintax = false;
        
        while ((match = spintaxRegex.exec(template)) !== null) {
            const options = match[1].split('|');
            if (options.length > 1) {
                combinations *= options.length;
                hasSpintax = true;
            }
        }
        
        return {
            isValid: true,
            error: null,
            combinations: hasSpintax ? combinations : 0
        };
    }, [template]);

    const handleSpin = () => {
        if (!validation.isValid || !template.trim()) {
            setSpinResult('');
            return;
        }
        
        const result = template.replace(/\{([^{}]+?)\}/g, (_, optionsString: string) => {
            const options = optionsString.split('|');
            return options[Math.floor(Math.random() * options.length)];
        });
        setSpinResult(result);
    };

    const handleGenerateVariations = () => {
        if (!validation.isValid || !template.trim()) {
            setVariations([]);
            return;
        }
        
        const uniqueSpins = new Set<string>();
        const maxAttempts = 100;
        const targetCount = Math.min(validation.combinations || 1, 10);
        let attempts = 0;
        
        while (uniqueSpins.size < targetCount && attempts < maxAttempts) {
            const spin = template.replace(/\{([^{}]+?)\}/g, (_, optionsString: string) => {
                const options = optionsString.split('|');
                return options[Math.floor(Math.random() * options.length)];
            });
            uniqueSpins.add(spin);
            attempts++;
        }
        
        setVariations(Array.from(uniqueSpins));
    };

    useEffect(() => {
        if (validation.isValid && template.trim()) {
            handleSpin();
            setVariations([]);
        }
    }, [template, validation.isValid]);

    return (
        <Card title="Spintax Validator">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Validate spintax structures, calculate total variations, and preview randomized outputs to ensure message diversity.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Message Template (with Spintax)</label>
                    <textarea
                        rows={6}
                        value={template}
                        onChange={e => setTemplate(e.target.value)}
                        placeholder="Enter template with {Hi|Hello|Hey} spintax..."
                        className="w-full p-3 bg-white dark:bg-gray-700/50 rounded-lg font-mono border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] resize-none utilities-scrollbar"
                    />
                </div>
                
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg flex flex-col justify-between">
                    <div>
                        <h3 className="font-semibold text-base text-gray-800 dark:text-gray-200 mb-3">Analysis Diagnostics</h3>
                        
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Syntax Status:</span>
                                {validation.isValid ? (
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">Valid</span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">Error</span>
                                )}
                            </div>
                            
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Unique Combinations:</span>
                                <span className="font-bold text-gray-800 dark:text-gray-200">{validation.combinations.toLocaleString()}</span>
                            </div>
                        </div>
                        
                        {validation.error && (
                            <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border-l-2 border-red-500 rounded-r text-xs text-red-700 dark:text-red-300">
                                {validation.error}
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                        <Button 
                            onClick={handleSpin} 
                            disabled={!validation.isValid || !template.trim()}
                            className="flex-1 !bg-blue-600 hover:!bg-blue-700 text-white"
                        >
                            Random Spin
                        </Button>
                        <Button 
                            onClick={handleGenerateVariations} 
                            disabled={!validation.isValid || !template.trim() || validation.combinations <= 1}
                            className="flex-1"
                            variant="secondary"
                        >
                            Show Variations
                        </Button>
                    </div>
                </div>
            </div>

            {spinResult && validation.isValid && (
                <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Randomized Output Preview</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 font-sans whitespace-pre-wrap">
                        {spinResult}
                    </div>
                </div>
            )}

            {variations.length > 0 && validation.isValid && (
                <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Generated Variations ({variations.length})</label>
                    <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2 utilities-scrollbar">
                        {variations.map((v, i) => (
                            <div key={i} className="p-2 bg-gray-50 dark:bg-gray-800/40 rounded border border-gray-200/50 dark:border-gray-700/50 text-xs font-mono text-gray-600 dark:text-gray-400">
                                <span className="text-blue-500 font-bold mr-2">#{i+1}:</span>{v}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
};

const PersonalizationValidator: React.FC = () => {
    const { globalPlaceholders } = useAppContext();
    const [template, setTemplate] = useState('Hello {FirstName} {LastName}, welcome to {{business_name}}! Contact us at {{support_email}}.');
    
    const [contact, setContact] = useState({
        firstName: 'John',
        lastName: 'Doe',
        number: '+1234567890'
    });
    
    const [customPlaceholderValues, setCustomPlaceholderValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!globalPlaceholders) return;
        const initialValues: Record<string, string> = {};
        globalPlaceholders.forEach(p => {
            initialValues[p.key] = p.value;
        });
        setCustomPlaceholderValues(prev => ({ ...initialValues, ...prev }));
    }, [globalPlaceholders]);

    const handlePlaceholderValueChange = (key: string, value: string) => {
        setCustomPlaceholderValues(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const diagnostics = useMemo(() => {
        const detectedTags: { name: string; type: 'contact' | 'placeholder' | 'unsupported'; status: 'valid' | 'invalid'; message?: string }[] = [];
        
        const singleBraceRegex = /\{([^{}|]+)\}/g;
        let match;
        const contactTags = new Set(['firstname', 'lastname', 'number']);
        
        while ((match = singleBraceRegex.exec(template)) !== null) {
            const tagName = match[1].trim();
            const lowerTag = tagName.toLowerCase();
            
            if (contactTags.has(lowerTag)) {
                detectedTags.push({
                    name: `{${tagName}}`,
                    type: 'contact',
                    status: 'valid'
                });
            } else {
                detectedTags.push({
                    name: `{${tagName}}`,
                    type: 'unsupported',
                    status: 'invalid',
                    message: `Tag "${tagName}" is not a recognized contact field. Recognized fields: {FirstName}, {LastName}`
                });
            }
        }
        
        const doubleBraceRegex = /\{\{([^}]+)\}\}/g;
        const placeholderKeys = new Set((globalPlaceholders || []).map(p => p.key.toLowerCase()));
        
        while ((match = doubleBraceRegex.exec(template)) !== null) {
            const keyName = match[1].trim();
            const lowerKey = keyName.toLowerCase();
            
            if (placeholderKeys.has(lowerKey)) {
                detectedTags.push({
                    name: `{{${keyName}}}`,
                    type: 'placeholder',
                    status: 'valid'
                });
            } else {
                detectedTags.push({
                    name: `{{${keyName}}}`,
                    type: 'placeholder',
                    status: 'invalid',
                    message: `Placeholder "${keyName}" is not defined in Global Placeholders.`
                });
            }
        }
        
        return detectedTags;
    }, [template, globalPlaceholders]);

    const renderedOutput = useMemo(() => {
        let text = template;
        
        text = text.replace(/\{FirstName\}/gi, contact.firstName);
        text = text.replace(/\{LastName\}/gi, contact.lastName);
        
        Object.entries(customPlaceholderValues).forEach(([key, val]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
            text = text.replace(regex, val);
        });
        
        return text;
    }, [template, contact, customPlaceholderValues]);

    return (
        <Card title="Personalization Tag Validator">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Preview how message templates will render with recipient properties and global brand placeholders.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Message Template (with Personalization Tags)</label>
                        <textarea
                            rows={6}
                            value={template}
                            onChange={e => setTemplate(e.target.value)}
                            placeholder="Enter template with {FirstName} or {{placeholder_name}} tags..."
                            className="w-full p-3 bg-white dark:bg-gray-700/50 rounded-lg font-mono border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] resize-none utilities-scrollbar"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Rendered Preview</label>
                        <div className="p-4 bg-green-50/30 dark:bg-green-950/10 border border-green-200 dark:border-green-900/50 text-gray-800 dark:text-gray-200 rounded-lg min-h-24 text-sm font-sans whitespace-pre-wrap">
                            {renderedOutput || <span className="text-gray-400">Rendered message will appear here...</span>}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg space-y-4">
                        <h3 className="font-semibold text-base text-gray-800 dark:text-gray-200">Contact Variable Preview</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">First Name ({'{FirstName}'})</label>
                                <input
                                    type="text"
                                    value={contact.firstName}
                                    onChange={e => setContact(prev => ({ ...prev, firstName: e.target.value }))}
                                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Last Name ({'{LastName}'})</label>
                                <input
                                    type="text"
                                    value={contact.lastName}
                                    onChange={e => setContact(prev => ({ ...prev, lastName: e.target.value }))}
                                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {globalPlaceholders && globalPlaceholders.length > 0 && (
                        <div className="p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg space-y-4">
                            <h3 className="font-semibold text-base text-gray-800 dark:text-gray-200">Global Placeholders Preview</h3>
                            <div className="space-y-3 max-h-48 overflow-y-auto utilities-scrollbar">
                                {globalPlaceholders.map(p => (
                                    <div key={p.id}>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{'{{' + p.key + '}}'}</label>
                                        <input
                                            type="text"
                                            value={customPlaceholderValues[p.key] ?? p.value}
                                            onChange={e => handlePlaceholderValueChange(p.key, e.target.value)}
                                            className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {diagnostics.length > 0 && (
                <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Detected Tag Status</label>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tag</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800/40 divide-y divide-gray-200 dark:divide-gray-700">
                                {diagnostics.map((tag, idx) => (
                                    <tr key={idx} className="text-xs">
                                        <td className="px-4 py-2 font-mono font-semibold text-gray-700 dark:text-gray-300">{tag.name}</td>
                                        <td className="px-4 py-2 text-gray-500">{tag.type === 'contact' ? 'Contact Variable' : 'Global Placeholder'}</td>
                                        <td className="px-4 py-2">
                                            {tag.status === 'valid' ? (
                                                <span className="text-green-600 dark:text-green-400 font-semibold">Ready</span>
                                            ) : (
                                                <span className="text-red-500 font-semibold">Error</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{tag.message || 'Successfully resolved'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Card>
    );
};

const AIMessageAnalyzer: React.FC = () => {
    const [message, setMessage] = useState('');
    const [analysis, setAnalysis] = useState<MessageAnalysis | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!message.trim()) return;
        setIsLoading(true);
        setError(null);
        setAnalysis(null);
        try {
            const result = await analyzeCampaignMessage(message);
            setAnalysis(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getSpamScoreColor = (score: number) => {
        if (score <= 3) return '#22c55e'; // tailwind green-500
        if (score <= 6) return '#eab308'; // tailwind yellow-500
        return '#ef4444'; // tailwind red-500
    };

    return (
        <Card title="AI Message Analyzer">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Paste your campaign message below to get an AI-powered analysis on its clarity, tone, and spam risk.
            </p>
            <textarea
                rows={6}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Enter your campaign message here..."
                className="w-full p-3 bg-white dark:bg-gray-700/50 rounded-lg font-mono border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] resize-y utilities-scrollbar"
            />
            <Button
                onClick={handleAnalyze}
                disabled={isLoading || !message.trim()}
                variant="primary"
                icon={<SparklesIcon />}
                className="mt-4 w-full md:w-auto"
            >
                {isLoading ? 'Analyzing...' : 'Analyze Message'}
            </Button>

            <div className="mt-6">
                {isLoading && (
                    <div className="text-center text-gray-500 dark:text-gray-400">
                        <p>AI is analyzing your message...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-500/10 border-l-4 border-red-400 rounded-r-lg text-red-700 dark:text-red-300">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                    </div>
                )}
                {analysis && (
                    <div className="space-y-6">
                        <div>
                             <h4 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">Spam Risk Score</h4>
                             <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white" style={{ backgroundColor: getSpamScoreColor(analysis.spamScore) }}>
                                    {analysis.spamScore}/10
                                </div>
                                <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">{analysis.spamReasoning}</p>
                             </div>
                        </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">Clarity & Tone</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-300"><strong className="text-gray-700 dark:text-gray-200">Clarity:</strong> {analysis.clarity}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2"><strong className="text-gray-700 dark:text-gray-200">Tone:</strong> {analysis.tone}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">Suggestions for Improvement</h4>
                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                    {analysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

const Utilities: React.FC = () => {
    return (
        <div className="space-y-8">
            <PhoneNumberConverter />
            <div className="my-8 h-1.5 rounded-full bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]"></div>
            <PhoneNumberReplicator />
            <div className="my-8 h-1.5 rounded-full bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]"></div>
            <SpintaxValidator />
            <div className="my-8 h-1.5 rounded-full bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]"></div>
            <PersonalizationValidator />
            <div className="my-8 h-1.5 rounded-full bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]"></div>
            <AIMessageAnalyzer />
        </div>
    );
};

export default Utilities;
