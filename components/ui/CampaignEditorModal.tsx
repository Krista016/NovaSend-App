







import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Campaign, CampaignStatus, DayOfWeek, CampaignAttachment, CampaignTemplate } from '../../types';
import Button from './Button';
import { InfoIcon, UploadIcon, TrashIcon, SparklesIcon, ChevronDownIcon, RefreshIcon } from '../icons/Icons';
import AnimatedCheckbox from './AnimatedCheckbox';
import AICopywriterModal from './AICopywriterModal';
import CustomDropdown from './CustomDropdown';
import { uploadApi } from '../../services/api';
import { useAppContext } from '../../hooks/useAppContext';
import { processMessageForContact } from '../../services/messageProcessor';


interface CampaignEditorModalProps {
    onClose: () => void;
    onSave: (campaign: Campaign) => void;
    campaignToEdit: Campaign | null;
}

const daysOfWeek: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const timezones = [
  { value: 'Etc/GMT+12', label: '(GMT-12:00) International Date Line West' },
  { value: 'Pacific/Midway', label: '(GMT-11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time (US & Canada)' },
  { value: 'America/Denver', label: '(GMT-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Chicago', label: '(GMT-06:00) Central Time (US & Canada)' },
  { value: 'America/New_York', label: '(GMT-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Halifax', label: '(GMT-04:00) Atlantic Time (Canada)' },
  { value: 'Etc/Greenwich', label: '(GMT+00:00) Greenwich Mean Time, London' },
  { value: 'Europe/Amsterdam', label: '(GMT+01:00) Amsterdam, Berlin, Rome' },
  { value: 'Africa/Cairo', label: '(GMT+02:00) Cairo, Jerusalem' },
  { value: 'Europe/Moscow', label: '(GMT+03:00) Moscow, St. Petersburg' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) Beijing, Perth, Singapore, Hong Kong' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo, Seoul, Osaka, Sapporo, Yakutsk' },
  { value: 'Australia/Sydney', label: '(GMT+10:00) Eastern Australia, Guam' },
  { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland, Wellington' },
];

const scheduleTypeOptions: { value: 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING', label: string }[] = [
    { value: 'IMMEDIATE', label: 'Send Immediately' },
    { value: 'SCHEDULED', label: 'Schedule for Later' },
    { value: 'RECURRING', label: 'Set up Recurring Campaign' },
];
const recurringFrequencyOptions: { value: Campaign['recurringFrequency'], label: string }[] = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
];

const TimePicker: React.FC<{ value: string; onChange: (newValue: string) => void; }> = ({ value, onChange }) => {
    const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const periods = ['AM', 'PM'];

    const [currentHour, currentMinute, currentPeriod] = useMemo(() => {
        if (!value) return ['09', '00', 'AM'];
        const [h, m] = value.split(':');
        const hour24 = parseInt(h, 10);
        const period = hour24 >= 12 ? 'PM' : 'AM';
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        return [String(hour12).padStart(2, '0'), String(m).padStart(2, '0'), period];
    }, [value]);

    const setTime = (part: 'h' | 'm' | 'p', val: string) => {
        let h = currentHour, m = currentMinute, p = currentPeriod;
        if (part === 'h') h = val;
        if (part === 'm') m = val;
        if (part === 'p') p = val;

        let hour24 = parseInt(h, 10);
        if (p === 'PM' && hour24 < 12) hour24 += 12;
        if (p === 'AM' && hour24 === 12) hour24 = 0;
        
        onChange(`${String(hour24).padStart(2, '0')}:${m}`);
    };
    
    const TimeColumn: React.FC<{ values: string[], selectedValue: string, onSelect: (v: string) => void }> = ({ values, selectedValue, onSelect }) => (
        <div className="h-48 overflow-y-scroll snap-y snap-mandatory time-picker-scrollbar">
            {values.map(v => (
                 <div key={v} onClick={() => onSelect(v)} className={`w-16 py-2 text-center text-lg cursor-pointer snap-center transition-colors ${selectedValue === v ? 'text-white bg-blue-500 rounded-md' : 'text-gray-400 hover:text-white'}`}>
                    {v}
                 </div>
            ))}
        </div>
    );

    return (
        <div className="flex bg-gray-800/80 dark:bg-gray-900/80 backdrop-blur-sm p-2 rounded-lg text-white">
            <TimeColumn values={hours} selectedValue={currentHour} onSelect={(v) => setTime('h', v)} />
            <TimeColumn values={minutes} selectedValue={currentMinute} onSelect={(v) => setTime('m', v)} />
            <TimeColumn values={periods} selectedValue={currentPeriod} onSelect={(v) => setTime('p', v)} />
        </div>
    );
};

const DateTimePicker: React.FC<{ value?: string; onChange: (newValue: string) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    const initialDate = useMemo(() => value ? new Date(value) : new Date(), [value]);
    const [currentDisplayDate, setCurrentDisplayDate] = useState(initialDate);
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const baseInputClasses = "w-full h-12 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-[var(--gradient-via)] focus:outline-none focus:border-transparent transition p-3 text-base text-left cursor-pointer";

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleTimeChange = (newTime: string) => {
        const [h, m] = newTime.split(':');
        const newDate = new Date(selectedDate);
        newDate.setHours(parseInt(h, 10), parseInt(m, 10));
        setSelectedDate(newDate);
    };

    const handleDateSelect = (day: number) => {
        const newDate = new Date(currentDisplayDate);
        newDate.setDate(day);
        const oldHours = selectedDate.getHours();
        const oldMinutes = selectedDate.getMinutes();
        newDate.setHours(oldHours, oldMinutes);
        setSelectedDate(newDate);
    }
    
    const changeMonth = (delta: number) => {
        setCurrentDisplayDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + delta);
            return newDate;
        });
    };

    const handleConfirm = () => {
        onChange(selectedDate.toISOString());
        setIsOpen(false);
    };

    const formattedDateTime = value 
        ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) 
        : 'Select Date & Time';

    const Calendar: React.FC = () => {
        const daysInMonth = new Date(currentDisplayDate.getFullYear(), currentDisplayDate.getMonth() + 1, 0).getDate();
        const firstDayOfMonth = new Date(currentDisplayDate.getFullYear(), currentDisplayDate.getMonth(), 1).getDay();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
        const selectedDay = selectedDate.getDate();
        const selectedMonth = selectedDate.getMonth();
        const selectedYear = selectedDate.getFullYear();

        return (
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg text-gray-800 dark:text-gray-200">
                <div className="flex justify-between items-center mb-2">
                    <button type="button" onClick={() => changeMonth(-1)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&lt;</button>
                    <span className="font-semibold">{currentDisplayDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                    <button type="button" onClick={() => changeMonth(1)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&gt;</button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
                    {blanks.map(b => <div key={`b-${b}`}></div>)}
                    {days.map(day => {
                        const isSelected = day === selectedDay && currentDisplayDate.getMonth() === selectedMonth && currentDisplayDate.getFullYear() === selectedYear;
                        return (
                            <button key={day} type="button" onClick={() => handleDateSelect(day)} className={`w-8 h-8 rounded-full transition-colors ${isSelected ? 'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                {day}
                            </button>
                        )
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="relative" ref={pickerRef}>
            <button 
                type="button"
                onClick={() => setIsOpen(true)}
                className={baseInputClasses}
            >
              {formattedDateTime}
            </button>
            {isOpen && (
                <div className="absolute top-full mt-2 bg-gray-900/50 backdrop-blur-sm p-2 rounded-lg shadow-2xl z-20 flex flex-col sm:flex-row gap-4">
                    <Calendar />
                    <div>
                         <TimePicker 
                            value={`${String(selectedDate.getHours()).padStart(2,'0')}:${String(selectedDate.getMinutes()).padStart(2,'0')}`}
                            onChange={handleTimeChange}
                        />
                         <Button variant="primary" onClick={handleConfirm} className="w-full mt-2">Confirm</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Section: React.FC<{ title: string, children: React.ReactNode, initiallyOpen?: boolean }> = ({ title, children, initiallyOpen = false }) => {
    const [isOpen, setIsOpen] = useState(initiallyOpen);
    return (
        <div>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full text-left flex justify-between items-center py-2">
                <label className="block text-sm font-medium">{title}</label>
                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4 mt-1">{children}</div>}
        </div>
    );
};

const CampaignEditorModal: React.FC<CampaignEditorModalProps> = ({ onClose, onSave, campaignToEdit }) => {
    // FIX: Added call to useAppContext to bring context values into scope. This resolves numerous 'Cannot find name' errors throughout the component. The other reported errors were likely a result of these missing variables causing cascading type inference failures.
    const { campaignTemplates, setCampaignTemplates, showNotification, globalPlaceholders, groups, contacts } = useAppContext();
    const [campaign, setCampaign] = useState<Partial<Campaign>>(
        campaignToEdit || {
            name: '',
            status: CampaignStatus.DRAFT,
            message: '',
            sendAsCaption: true,
            useAttachmentFromFolder: false,
            scheduleType: 'IMMEDIATE',
            targetGroups: [],
            batchSize: 20,
            batchDelayMin: 5,
            batchDelayMax: 10,
            simulateTyping: true,
            recurringDays: [],
            sendWindowStart: '00:00',
            sendWindowEnd: '00:00',
            timezone: 'Asia/Kolkata',
            sendInContactTimezone: false,
            pacingMessagesPerHour: 100,
            staggerDurationHours: 1,
            warmUpMode: false,
            detectOptOut: false,
        }
    );
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isGuidePopoverOpen, setIsGuidePopoverOpen] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const guidePopoverRef = useRef<HTMLDivElement>(null);
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

    const [attachmentFilename, setAttachmentFilename] = useState<string | null>(campaignToEdit?.attachment?.name || null);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);

    const mockContactForPreview = useMemo(() => ({
        id: 'preview',
        number: '+1234567890',
        firstName: 'John',
        lastName: 'Doe',
        status: 'Active' as const,
    }), []);

    const previewMessage = useMemo(() => {
        if (!campaign.message || !globalPlaceholders) return '';
        return processMessageForContact(campaign.message, mockContactForPreview, globalPlaceholders);
    }, [campaign.message, globalPlaceholders, mockContactForPreview, previewRefreshKey]);

    const targetedContactCount = useMemo(() => {
        if (!campaign.targetGroups || campaign.targetGroups.length === 0) {
            return 0;
        }
        const targetGroupSet = new Set(campaign.targetGroups);
        return new Set(
            contacts
                .filter(c => c.status !== 'Unsubscribed' && c.groups?.some(g => targetGroupSet.has(g)))
                .map(c => c.id)
        ).size;
    }, [campaign.targetGroups, contacts]);

    useEffect(() => {
        const fetchAttachmentName = async () => {
            if (campaign.useAttachmentFromFolder) {
                setAttachmentFilename('Checking...');
                setAttachmentError(null);
                try {
                    const data = await uploadApi.getAttachmentFilename();
                    if (data.filename) {
                        setAttachmentFilename(data.filename);
                        // Also update the campaign object so its name is saved
                        setCampaign(p => ({ ...p, attachment: { name: data.filename, type: 'Document' } }));
                    } else {
                        setAttachmentFilename(null);
                        setAttachmentError(data.message || 'No file found in folder.');
                    }
                } catch (error) {
                    setAttachmentFilename(null);
                    setAttachmentError('Agent is offline or unreachable.');
                }
            } else {
                setAttachmentFilename(null);
                setAttachmentError(null);
                setCampaign(p => ({ ...p, attachment: undefined }));
            }
        };

        fetchAttachmentName();
    }, [campaign.useAttachmentFromFolder]);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (guidePopoverRef.current && !guidePopoverRef.current.contains(event.target as Node)) {
                setIsGuidePopoverOpen(false);
            }
        };
        if (isGuidePopoverOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isGuidePopoverOpen]);
    
    const baseInputClasses = "w-full h-12 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-[var(--gradient-via)] focus:outline-none focus:border-transparent transition p-3 text-base";

    const handleSave = () => {
        if (!campaign.name || (!campaign.message && !campaign.useAttachmentFromFolder)) {
            alert('Please fill in a campaign name and either a message or an attachment.');
            return;
        }
        if (!campaign.targetGroups || campaign.targetGroups.length === 0) {
            alert('Please select at least one target group for the campaign.');
            return;
        }
        onSave(campaign as Campaign);
    };

    const handleLoadTemplate = (templateId: string) => {
        if (!templateId) return;
        const template = campaignTemplates.find(t => t.id === templateId);
        if (template) {
            const newName = campaignToEdit ? campaign.name : template.name;
            let messageContent = template.message;
            let useAsCaption = false;
            if (template.attachment && template.caption) {
                messageContent = template.caption;
                useAsCaption = true;
            }
            const campaignDataFromTemplate = { ...template, message: messageContent, sendAsCaption: useAsCaption };
            delete (campaignDataFromTemplate as any).caption;

            setCampaign(prev => ({ ...prev, ...campaignDataFromTemplate, id: prev.id, name: newName }));
        }
    };
    
    const handleSaveTemplate = () => {
        if (!newTemplateName.trim()) {
            showNotification({ message: 'Please enter a name for the template.', type: 'warning' });
            return;
        }
        const newTemplate: any = {
            ...campaign,
            id: `template_${Date.now()}`,
            name: newTemplateName.trim(),
        };
        // Clean up campaign-specific fields before saving as template
        delete newTemplate.status;
        delete newTemplate.sent;
        delete newTemplate.failed;
        delete newTemplate.total;
        
        setCampaignTemplates(prev => [...prev, newTemplate]);
        showNotification({ message: `Template "${newTemplate.name}" saved successfully!`, type: 'success' });
        setNewTemplateName('');
        setIsSavingTemplate(false);
    };
    
    const handleDayToggle = (day: DayOfWeek) => {
        setCampaign(prev => {
            const days = new Set(prev.recurringDays || []);
            if (days.has(day)) days.delete(day);
            else days.add(day);
            return { ...prev, recurringDays: Array.from(days) };
        });
    };
    
    const handleGroupToggle = (groupName: string) => {
        setCampaign(prev => {
            const groups = new Set(prev.targetGroups || []);
            if (groups.has(groupName)) {
                groups.delete(groupName);
            } else {
                groups.add(groupName);
            }
            return { ...prev, targetGroups: Array.from(groups) };
        });
    };

    const templateOptions = [{ value: '', label: 'Select a template...' }, ...campaignTemplates.map(t => ({ value: t.id, label: t.name }))];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl transform transition-all flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold">{campaignToEdit ? 'Edit Campaign' : 'Create New Campaign'}</h2>
                    <div className="w-64">
                         <CustomDropdown options={templateOptions} value={''} onChange={handleLoadTemplate} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 modal-scrollbar" style={{ maxHeight: 'calc(100vh - 220px)'}}>
                    <div>
                        <label htmlFor="campaignName" className="block text-sm font-medium mb-1">Campaign Name</label>
                        <input type="text" id="campaignName" value={campaign.name} onChange={e => setCampaign(p => ({ ...p, name: e.target.value }))} className={baseInputClasses} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Target Audience</label>
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            {groups.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {groups.map(group => (
                                        <label key={group.id} className="flex items-center space-x-3 p-3 rounded-md bg-gray-100 dark:bg-gray-700/50 cursor-pointer">
                                            <AnimatedCheckbox
                                                id={`group-${group.id}`}
                                                checked={campaign.targetGroups?.includes(group.name) || false}
                                                onChange={() => handleGroupToggle(group.name)}
                                            />
                                            <span className="text-sm font-medium select-none">{group.name}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 text-center">No contact groups found. Please create groups on the Contacts page first.</p>
                            )}
                            <p className="text-right text-sm font-semibold mt-3 text-[var(--gradient-via)]">
                                {targetedContactCount} contact{targetedContactCount !== 1 ? 's' : ''} will be targeted.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2">
                             <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
                            <div className="relative">
                                <textarea 
                                    id="message" 
                                    rows={8} 
                                    value={campaign.message} 
                                    onChange={e => setCampaign(p => ({ ...p, message: e.target.value }))} 
                                    className={`${baseInputClasses} !h-auto resize-none font-mono`} 
                                    placeholder="{Hi|Hello} {FirstName}, this is our message..."
                                ></textarea>
                                <Button 
                                    onClick={() => setIsAiModalOpen(true)} 
                                    className="!absolute !bottom-3 !right-3 !py-1.5 !px-3 !bg-gray-200/50 dark:!bg-gray-900/50 hover:!bg-gray-300 dark:hover:!bg-gray-900 !backdrop-blur-sm" 
                                >
                                    <div className="flex items-center justify-center space-x-2">
                                        <SparklesIcon className="w-5 h-5 text-[var(--gradient-via)]"/>
                                        <span className="gemini-glow font-bold text-base">QuickCompose</span>
                                    </div>
                                </Button>
                            </div>
                            <div className="relative mt-2">
                                <button type="button" onClick={() => setIsGuidePopoverOpen(v => !v)} className="text-xs text-gray-500 flex items-center gap-1 hover:text-[var(--gradient-via)]">
                                    <InfoIcon className="w-3 h-3"/> 
                                    How to draft your message
                                </button>
                                {isGuidePopoverOpen && (
                                    <div ref={guidePopoverRef} className="absolute bottom-full left-0 mb-2 w-full max-w-lg bg-gray-800/80 dark:bg-black/60 backdrop-blur-md rounded-lg shadow-2xl z-20 border border-gray-700 text-white p-1">
                                        <div className="p-4 max-h-80 overflow-y-auto utilities-scrollbar relative">
                                            <button type="button" onClick={() => setIsGuidePopoverOpen(false)} className="absolute top-2 right-2 text-gray-400 hover:text-white z-10">
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                                            </button>
                                            <h4 className="font-bold text-base mb-3 text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]">Message Drafting Guide</h4>
                                            <div className="space-y-4 text-gray-300 text-sm">
                                                <div>
                                                    <p className="font-semibold text-gray-100">Text Formatting</p>
                                                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                                                        <li>For bold text, wrap it in asterisks. Example: <code className="bg-gray-900 px-1 rounded text-xs">*your text*</code> becomes <b>your text</b>.</li>
                                                        <li>For italics, use underscores. Example: <code className="bg-gray-900 px-1 rounded text-xs">_your text_</code> becomes <i>your text</i>.</li>
                                                        <li>For strikethrough, use tildes. Example: <code className="bg-gray-900 px-1 rounded text-xs">~your text~</code> becomes <s>your text</s>.</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-100">Spintax (Message Variations)</p>
                                                    <p>Use curly braces <code className="bg-gray-900 px-1 rounded">{'{...}'}</code> and pipes <code className="bg-gray-900 px-1 rounded">|</code> to create variations, which helps in reducing message blocking.</p>
                                                    <p className="mt-1">Example: <code className="bg-gray-900 px-1 rounded">{'{Hi|Hello|Greetings}'} {', {FirstName}!|!'}</code> will randomly generate messages like "Hi, John!" or "Hello!"</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-100">Personalization Tags</p>
                                                    <p>Automatically insert contact details into your messages.</p>
                                                    <ul className="list-disc list-inside pl-4 mt-1">
                                                        <li><code className="bg-gray-900 px-1 rounded">{'{FirstName}'}</code> - Inserts the contact's first name.</li>
                                                        <li><code className="bg-gray-900 px-1 rounded">{'{LastName}'}</code> - Inserts the contact's last name.</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-100">Global Placeholders</p>
                                                    <p>Use globally defined values from the Settings page. This is great for your business name, promotions, or links.</p>
                                                    <p className="mt-1">Example: <code className="bg-gray-900 px-1 rounded">{'Check out our website at {{website_url}}'}</code>.</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-100">Line Breaks & Emojis</p>
                                                    <ul className="list-disc list-inside pl-4 mt-1">
                                                        <li>Use a single pipe character (<code className="bg-gray-900 px-1 rounded">|</code>) to create a new line.</li>
                                                        <li>You can copy and paste emojis directly into the message box 😊👍.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                         <div className="md:col-span-1">
                            <label className="block text-sm font-medium mb-1">Attachment</label>
                            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-full flex flex-col justify-center items-center">
                                <div className="flex items-center">
                                    <AnimatedCheckbox 
                                        id="useAttachmentFromFolder" 
                                        checked={!!campaign.useAttachmentFromFolder} 
                                        onChange={c => setCampaign(p => ({ ...p, useAttachmentFromFolder: c }))} 
                                    />
                                    <label htmlFor="useAttachmentFromFolder" className="ml-3 text-sm font-medium cursor-pointer select-none">
                                        Attach file from shared folder
                                    </label>
                                </div>
                                
                                {campaign.useAttachmentFromFolder && (
                                    <div className="mt-3 text-center text-xs w-full">
                                        {attachmentFilename && attachmentFilename !== 'Checking...' && (
                                            <div className="p-2 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded-md">
                                                <p className="font-semibold">File Found:</p>
                                                <p className="font-mono truncate" title={attachmentFilename}>{attachmentFilename}</p>
                                            </div>
                                        )}
                                        {attachmentFilename === 'Checking...' && <p className="text-gray-500">Checking for file...</p>}
                                        {attachmentError && (
                                            <div className="p-2 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded-md">
                                                <p className="font-semibold">Error:</p>
                                                <p>{attachmentError}</p>
                                            </div>
                                        )}
                                        <p className="text-gray-500 dark:text-gray-400 mt-2">Place one file in your <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">Downloads/Attach</code> folder.</p>
                                    </div>
                                )}
                            </div>
                            {campaign.useAttachmentFromFolder && attachmentFilename && !attachmentError && (
                                <div className="flex items-center pt-4">
                                    <AnimatedCheckbox id="sendAsCaption" checked={!!campaign.sendAsCaption} onChange={c => setCampaign(p => ({...p, sendAsCaption: c}))} />
                                    <label htmlFor="sendAsCaption" className="ml-3 text-sm font-medium cursor-pointer select-none">Send message as caption</label>
                                </div>
                            )}
                        </div>
                    </div>

                    {campaign.message && campaign.message.trim() !== '' && (
                        <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium">Smart Live Preview</label>
                                <button 
                                    type="button" 
                                    onClick={() => setPreviewRefreshKey(k => k + 1)}
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-[var(--gradient-via)] transition-colors"
                                    title="Refresh to see spintax variation"
                                >
                                    <RefreshIcon className="w-3 h-3"/>
                                    <span>Refresh</span>
                                </button>
                            </div>
                            <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 text-sm">
                                {previewMessage}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Preview uses a sample contact (John Doe) and your global placeholders.</p>
                        </div>
                    )}

                    <Section title="Advanced Scheduling">
                        <div>
                            <label className="text-sm font-medium">Schedule Type</label>
                             <CustomDropdown 
                                options={scheduleTypeOptions}
                                value={campaign.scheduleType || 'IMMEDIATE'}
                                onChange={val => setCampaign(p => ({...p, scheduleType: val as any}))}
                            />
                        </div>
                        {(campaign.scheduleType === 'SCHEDULED' || campaign.scheduleType === 'RECURRING') && (
                            <div className="space-y-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Date & Time</label>
                                    <DateTimePicker value={campaign.scheduledAt} onChange={val => setCampaign(p => ({...p, scheduledAt: val}))} />
                                </div>
                                 <div>
                                    <label className="text-sm font-medium">Timezone</label>
                                    <CustomDropdown
                                        options={timezones}
                                        value={campaign.timezone || 'Asia/Kolkata'}
                                        onChange={val => setCampaign(p => ({...p, timezone: val}))}
                                    />
                                </div>
                                {campaign.scheduleType === 'RECURRING' && (
                                    <div className="space-y-4">
                                        <div>
                                             <label className="text-sm font-medium">Frequency</label>
                                            <CustomDropdown
                                                options={recurringFrequencyOptions}
                                                value={campaign.recurringFrequency || 'DAILY'}
                                                onChange={val => setCampaign(p => ({...p, recurringFrequency: val as any}))}
                                            />
                                        </div>
                                        {campaign.recurringFrequency === 'WEEKLY' && (
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">Send on Days</label>
                                                <div className="flex justify-around bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
                                                    {daysOfWeek.map(day => (
                                                        <button key={day} type="button" onClick={() => handleDayToggle(day)} className={`w-12 h-10 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 ${campaign.recurringDays?.includes(day) ? 'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>{day}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </Section>
                    
                    <Section title="Delivery Pacing">
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium">Stagger delivery over (hours)</label>
                                <input type="number" value={campaign.staggerDurationHours} onChange={e => setCampaign(p => ({...p, staggerDurationHours: +e.target.value}))} className={`${baseInputClasses} mt-1`}/>
                            </div>
                             <div>
                                <label className="text-sm font-medium">Limit to (messages per hour)</label>
                                <input type="number" value={campaign.pacingMessagesPerHour} onChange={e => setCampaign(p => ({...p, pacingMessagesPerHour: +e.target.value}))} className={`${baseInputClasses} mt-1`}/>
                            </div>
                        </div>
                        <div className="flex items-center pt-3">
                            <AnimatedCheckbox id="warmUpMode" checked={!!campaign.warmUpMode} onChange={c => setCampaign(p => ({...p, warmUpMode: c}))} />
                            <label htmlFor="warmUpMode" className="ml-3 text-sm font-medium cursor-pointer select-none">Enable Warm-Up Mode (Progressively increases daily limit starting from 20/day)</label>
                        </div>
                    </Section>
                    
                    <Section title="Anti-Blocking Settings">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium">Batch Size</label>
                                <input type="number" value={campaign.batchSize} onChange={e => setCampaign(p => ({...p, batchSize: +e.target.value}))} className={`${baseInputClasses} mt-1`}/>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Min Delay (sec)</label>
                                <input type="number" value={campaign.batchDelayMin} onChange={e => setCampaign(p => ({...p, batchDelayMin: +e.target.value}))} className={`${baseInputClasses} mt-1`}/>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Max Delay (sec)</label>
                                <input type="number" value={campaign.batchDelayMax} onChange={e => setCampaign(p => ({...p, batchDelayMax: +e.target.value}))} className={`${baseInputClasses} mt-1`}/>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-6 pt-4">
                            <div className="flex items-center">
                                <AnimatedCheckbox id="simulateTyping" checked={!!campaign.simulateTyping} onChange={c => setCampaign(p => ({...p, simulateTyping: c}))} />
                                <label htmlFor="simulateTyping" className="ml-3 text-sm font-medium cursor-pointer select-none">Simulate Typing</label>
                            </div>
                            <div className="flex items-center">
                                <AnimatedCheckbox id="detectOptOut" checked={!!campaign.detectOptOut} onChange={c => setCampaign(p => ({...p, detectOptOut: c}))} />
                                <label htmlFor="detectOptOut" className="ml-3 text-sm font-medium cursor-pointer select-none">Auto Opt-Out Detection (STOP/unsubscribe)</label>
                            </div>
                        </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Send between</label>
                                <CustomDropdown
                                    options={Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`).map(t => ({ value: t, label: t }))}
                                    value={campaign.sendWindowStart || '09:00'}
                                    onChange={val => setCampaign(p => ({ ...p, sendWindowStart: val }))}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">and</label>
                                 <CustomDropdown
                                    options={Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`).map(t => ({ value: t, label: t }))}
                                    value={campaign.sendWindowEnd || '17:00'}
                                    onChange={val => setCampaign(p => ({ ...p, sendWindowEnd: val }))}
                                />
                            </div>
                        </div>
                    </Section>

                </div>

                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-between items-center rounded-b-2xl">
                     <Button variant="secondary" onClick={() => setIsSavingTemplate(true)}>Save as Template</Button>
                    <div className="flex space-x-3">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave}>Save Campaign</Button>
                    </div>
                </div>
                
                {isAiModalOpen && <AICopywriterModal onClose={() => setIsAiModalOpen(false)} onInsert={(text) => setCampaign(p => ({...p, message: (p.message || '') + text}))}/>}
                
                {isSavingTemplate && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsSavingTemplate(false)}>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-lg">Save Campaign as Template</h3>
                            <input
                                type="text"
                                placeholder="Enter template name..."
                                value={newTemplateName}
                                onChange={e => setNewTemplateName(e.target.value)}
                                className={baseInputClasses}
                            />
                            <div className="flex justify-end space-x-2">
                                <Button variant="secondary" onClick={() => setIsSavingTemplate(false)}>Cancel</Button>
                                <Button variant="primary" onClick={handleSaveTemplate}>Save</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CampaignEditorModal;
