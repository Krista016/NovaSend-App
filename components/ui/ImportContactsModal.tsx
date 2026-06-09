

import React, { useState } from 'react';
import { Contact } from '../../types';
import Button from './Button';
import { UploadIcon } from '../icons/Icons';
import { validateAndNormalizePhoneNumber } from '../../services/phoneValidator';

declare global {
  interface Window {
    XLSX: any;
  }
}

type ImportStep = 'UPLOAD' | 'MAP_COLUMNS' | 'PREVIEW';

interface ImportContactsModalProps {
    onClose: () => void;
    onImport: (contacts: Contact[]) => void;
    existingContacts: Contact[];
}

interface ParsedResult {
    contact: Omit<Contact, 'id' | 'status'>;
    normalizedNumber: string | null;
    importStatus: 'NEW' | 'DUPLICATE' | 'INVALID';
}

const ImportContactsModal: React.FC<ImportContactsModalProps> = ({ onClose, onImport, existingContacts }) => {
    const [step, setStep] = useState<ImportStep>('UPLOAD');
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<any[][]>([]);
    const [columnMap, setColumnMap] = useState<{ number: string; firstName: string; lastName: string }>({ number: '', firstName: 'unmapped', lastName: 'unmapped' });
    const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const resetState = () => {
        setStep('UPLOAD');
        setFile(null);
        setHeaders([]);
        setRows([]);
        setColumnMap({ number: '', firstName: 'unmapped', lastName: 'unmapped' });
        setParsedResults([]);
        setError(null);
        setIsLoading(false);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            resetState();
            setFile(selectedFile);
            parseFile(selectedFile);
        }
    };
    
    const parseFile = (selectedFile: File) => {
        setIsLoading(true);
        setError(null);
        const reader = new FileReader();
        const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();

        const processData = (sheetData: any[][]) => {
            if (sheetData.length === 0) throw new Error("File is empty or could not be read.");
            
            const firstRow = sheetData[0].map(h => String(h).trim());
            // A row is considered a header if it contains common header keywords AND does not contain any valid phone numbers.
            const isHeaderPresent = 
                firstRow.some(cell => /number|phone|contact|first|last|name|ip/i.test(cell)) && 
                !firstRow.some(cell => validateAndNormalizePhoneNumber(cell).isValid);

            const fileHeaders = isHeaderPresent ? firstRow : firstRow.map((_, index) => `Column ${index + 1}`);
            const fileRows = isHeaderPresent ? sheetData.slice(1) : sheetData;
            
            setHeaders(fileHeaders);
            setRows(fileRows);

            const lowerCaseHeaders = fileHeaders.map(h => h.toLowerCase());
            const findHeader = (keywords: string[]) => {
                const foundHeader = lowerCaseHeaders.find(h => keywords.some(k => h.includes(k)));
                return foundHeader ? fileHeaders[lowerCaseHeaders.indexOf(foundHeader)] : undefined;
            };

            // Also check for generic column names for files without headers
            const numberHeader = findHeader(['number', 'phone', 'ip', 'contact', 'column 1']);
            const firstNameHeader = findHeader(['first', 'fname', 'given', 'user', 'column 2']);
            const lastNameHeader = findHeader(['last', 'lname', 'surname', 'pass', 'column 3']);

            const newColumnMap = {
                number: numberHeader || (fileHeaders.length === 1 ? fileHeaders[0] : ''),
                firstName: firstNameHeader || 'unmapped',
                lastName: lastNameHeader || 'unmapped'
            };
            setColumnMap(newColumnMap);

            if (newColumnMap.number && newColumnMap.number !== '') {
                const numberIndex = fileHeaders.indexOf(newColumnMap.number);
                const firstNameIndex = newColumnMap.firstName !== 'unmapped' ? fileHeaders.indexOf(newColumnMap.firstName) : -1;
                const lastNameIndex = newColumnMap.lastName !== 'unmapped' ? fileHeaders.indexOf(newColumnMap.lastName) : -1;

                const contactsToProcess = fileRows.map(row => ({
                    number: String(row[numberIndex] || ''),
                    firstName: firstNameIndex > -1 ? String(row[firstNameIndex] || '') : undefined,
                    lastName: lastNameIndex > -1 ? String(row[lastNameIndex] || '') : undefined
                })).filter(c => c.number);
                
                previewData(contactsToProcess);
                setStep('PREVIEW');
            } else {
                setStep('MAP_COLUMNS');
            }
        }

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) throw new Error("Could not read file content.");
                
                if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                    if (!window.XLSX) {
                        throw new Error("Could not load the file parsing library. Please check your connection.");
                    }
                    const workbook = window.XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const sheetData: any[][] = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                    processData(sheetData);
                } else { // Handle CSV/TXT
                    const text = data as string;
                    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
                    const sheetData = lines.map(line => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(field => field.trim().replace(/^"|"$/g, '')));
                    processData(sheetData);
                }

            } catch (err: any) {
                setError(err.message || "An error occurred while parsing the file.");
            } finally {
                setIsLoading(false);
            }
        };

        reader.onerror = () => {
             setError("Error reading the file.");
             setIsLoading(false);
        }

        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            reader.readAsArrayBuffer(selectedFile);
        } else {
            reader.readAsText(selectedFile);
        }
    };

    const handleMapProceed = () => {
        if (!columnMap.number || columnMap.number === 'unmapped') {
            setError("You must map a column for the phone number.");
            return;
        }
        setError(null);

        const numberIndex = headers.indexOf(columnMap.number);
        const firstNameIndex = columnMap.firstName !== 'unmapped' ? headers.indexOf(columnMap.firstName) : -1;
        const lastNameIndex = columnMap.lastName !== 'unmapped' ? headers.indexOf(columnMap.lastName) : -1;

        const contactsToProcess = rows.map(row => ({
            number: String(row[numberIndex] || ''),
            firstName: firstNameIndex > -1 ? String(row[firstNameIndex] || '') : undefined,
            lastName: lastNameIndex > -1 ? String(row[lastNameIndex] || '') : undefined
        })).filter(c => c.number);
        
        previewData(contactsToProcess);
        setStep('PREVIEW');
    };

    const previewData = (data: Omit<Contact, 'id' | 'status'>[]) => {
        const existingNumbers = new Set(existingContacts.map(c => c.number.replace(/\D/g, '')));
        const seenInFile = new Set<string>();

        const results = data.map(c => {
            const { isValid, normalizedNumber } = validateAndNormalizePhoneNumber(c.number);
            
            if (!isValid || !normalizedNumber) {
                return { contact: c, normalizedNumber: null, importStatus: 'INVALID' as const };
            }
            
            const normalizedForCheck = normalizedNumber.replace(/\D/g, '');

            if (existingNumbers.has(normalizedForCheck) || seenInFile.has(normalizedForCheck)) {
                 if (!seenInFile.has(normalizedForCheck)) seenInFile.add(normalizedForCheck);
                return { contact: c, normalizedNumber, importStatus: 'DUPLICATE' as const };
            }

            seenInFile.add(normalizedForCheck);
            return { contact: c, normalizedNumber, importStatus: 'NEW' as const };
        });
        setParsedResults(results);
    };

    const handleImportClick = () => {
        const validContacts: Contact[] = parsedResults
            .filter(r => r.importStatus === 'NEW')
            .map((r, index) => ({
                ...r.contact,
                number: r.normalizedNumber!,
                id: `imported-${Date.now()}-${index}`,
                status: 'Pending' as const,
            }));
        
        if (validContacts.length > 0) {
            onImport(validContacts);
            onClose();
        }
    };
    
    const newContactsCount = parsedResults.filter(p => p.importStatus === 'NEW').length;
    const duplicateContactsCount = parsedResults.filter(p => p.importStatus === 'DUPLICATE').length;
    const invalidContactsCount = parsedResults.filter(p => p.importStatus === 'INVALID').length;
    
    const StatusBadge: React.FC<{ status: ParsedResult['importStatus'] }> = ({ status }) => {
        const styles = {
            NEW: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
            DUPLICATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
            INVALID: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        };
        return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>;
    }

    const renderContent = () => {
        switch (step) {
            case 'UPLOAD': return (
                 <div className="p-6 space-y-4">
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                        <UploadIcon className="w-12 h-12 mx-auto text-gray-400" />
                        <p className="mt-2 text-gray-600 dark:text-gray-300">{file ? file.name : 'Drag & drop your file here'}</p>
                        <p className="text-xs text-gray-500">or</p>
                        <label htmlFor="file-upload" className="font-semibold text-[var(--gradient-via)] cursor-pointer hover:underline">
                            Choose a file
                        </label>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv,.xls,.xlsx,.txt" onChange={handleFileChange} />
                    </div>
                </div>
            );
            case 'MAP_COLUMNS': return (
                <div className="p-6 space-y-6">
                    <h3 className="font-semibold">Map your columns</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Match the columns from your file to the contact fields in NovaSend.</p>
                    <div className="space-y-4">
                        {(['number', 'firstName', 'lastName'] as const).map(field => (
                             <div key={field}>
                                <label htmlFor={field} className="block font-medium text-sm text-gray-700 dark:text-gray-300 mb-2 capitalize">{field.replace('Name', ' Name')} {field === 'number' && <span className="text-red-500">*</span>}</label>
                                <select 
                                    id={field} 
                                    value={columnMap[field]}
                                    onChange={e => setColumnMap(prev => ({...prev, [field]: e.target.value}))}
                                    className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-sm p-3"
                                >
                                     {field !== 'number' && <option value="unmapped">-- Don't Import --</option>}
                                     {field === 'number' && <option value="">-- Select Column --</option>}
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                             </div>
                        ))}
                    </div>
                </div>
            );
            case 'PREVIEW': return (
                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 max-h-[50vh] overflow-y-auto">
                    <div className="font-semibold mb-2 flex flex-wrap gap-x-4 gap-y-1">
                        <h3>{parsedResults.length} contacts found.</h3>
                        <span className="text-green-600 dark:text-green-400">New: {newContactsCount}</span>
                        <span className="text-yellow-600 dark:text-yellow-400">Duplicate: {duplicateContactsCount}</span>
                        <span className="text-red-600 dark:text-red-400">Invalid: {invalidContactsCount}</span>
                    </div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm table-fixed">
                            <thead>
                                <tr className="border-b dark:border-gray-700 bg-white dark:bg-gray-700/50">
                                    <th className="p-2 font-semibold text-cyan-400 w-28">Status</th>
                                    <th className="p-2 font-semibold text-cyan-400">Number</th>
                                    <th className="p-2 font-semibold text-cyan-400">First Name</th>
                                    <th className="p-2 font-semibold text-cyan-400">Last Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedResults.slice(0, 100).map((r, i) => (
                                    <tr key={i} className={`border-b dark:border-gray-700/50 last:border-b-0`}>
                                        <td className="p-2"><StatusBadge status={r.importStatus} /></td>
                                        <td className="p-2 font-mono text-cyan-400 truncate" title={r.contact.number}>{r.contact.number}</td>
                                        <td className="p-2 dark:text-white truncate" title={r.contact.firstName || ''}>{r.contact.firstName || '-'}</td>
                                        <td className="p-2 dark:text-white truncate" title={r.contact.lastName || ''}>{r.contact.lastName || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold flex items-center space-x-2">
                        <UploadIcon className="w-6 h-6 text-[var(--gradient-via)]" />
                        <span>Import Contacts</span>
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Supported formats: .csv, .xlsx, .txt. The first row will be treated as a header if it contains text.</p>
                </div>
                
                {isLoading && <div className="p-8 text-center">Parsing file...</div>}
                {!isLoading && error && <div className="p-8 text-center text-red-500">{error}</div>}
                {!isLoading && !error && renderContent()}
                
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    {step === 'MAP_COLUMNS' && <Button variant="primary" onClick={handleMapProceed}>Continue to Preview</Button>}
                    {step === 'PREVIEW' && <Button variant="primary" onClick={handleImportClick} disabled={newContactsCount === 0}>Import {newContactsCount > 0 ? newContactsCount : ''} New Contacts</Button>}
                </div>
            </div>
        </div>
    );
};

export default ImportContactsModal;
