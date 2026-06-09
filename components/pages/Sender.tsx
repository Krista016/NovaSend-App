

import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import { Contact, CampaignStatus } from '../../types';
import { processMessageForContact } from '../../services/messageProcessor';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { PauseIcon, PlayIcon } from '../icons/Icons';

const Sender: React.FC = () => {
    // FIX: Get allContacts from useAppContext instead of using a non-existent mock import.
    const { runningCampaignId, campaigns, setCampaigns, globalPlaceholders, showNotification, contacts: allContacts } = useAppContext();
    const [currentContactIndex, setCurrentContactIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    
    const campaign = useMemo(() => campaigns.find(c => c.id === runningCampaignId), [campaigns, runningCampaignId]);
    
    // FIX: Filter contacts from the context based on the current campaign's target groups.
    const contacts = useMemo(() => {
        if (!campaign) return [];
        const targetGroupSet = new Set(campaign.targetGroups || []);
        if (targetGroupSet.size === 0) return [];
        return allContacts.filter(c => 
            c.status !== 'Unsubscribed' &&
            c.groups?.some(g => targetGroupSet.has(g))
        );
    }, [campaign, allContacts]);

    const currentContact = contacts[currentContactIndex];
    
    const processedMessage = useMemo(() => {
        if (!campaign || !currentContact) return '';
        // FIX: The Campaign type does not have a `caption` property. The message, whether for a caption or standalone, is stored in the `message` field.
        const template = campaign.message || '';
        return processMessageForContact(template, currentContact, globalPlaceholders);
    }, [campaign, currentContact, globalPlaceholders]);

    // The main sending loop
    useEffect(() => {
        if (!campaign || isPaused || !currentContact) return;

        // Determine delay before next step
        const typingDelay = campaign.simulateTyping ? Math.random() * 2000 + 1000 : 500;
        let nextDelay = typingDelay;
        const batchSize = campaign.batchSize || 20;
        if (currentContactIndex > 0 && currentContactIndex % batchSize === 0) {
            const min = (campaign.batchDelayMin || 3) * 1000;
            const max = (campaign.batchDelayMax || 8) * 1000;
            const batchDelay = Math.random() * (max - min) + min;
            nextDelay += batchDelay;
            showNotification({ message: `Batch of ${batchSize} done. Pausing for ${(batchDelay / 1000).toFixed(1)}s.`, type: 'info' });
        }

        const timer = setTimeout(() => {
            // Update campaign stats
            setCampaigns(prev => prev.map(c => 
                c.id === campaign.id ? { ...c, sent: c.sent + 1 } : c
            ));
            
            // Move to next contact or complete
            if (currentContactIndex < contacts.length - 1) {
                setCurrentContactIndex(prev => prev + 1);
            } else {
                showNotification({ message: `Campaign "${campaign.name}" completed!`, type: 'success' });
                setCampaigns(prev => prev.map(c => 
                    c.id === campaign.id ? { ...c, status: CampaignStatus.COMPLETED } : c
                ));
            }
        }, nextDelay);

        return () => clearTimeout(timer);
    // FIX: Added missing dependencies to useEffect hook for correctness.
    }, [currentContactIndex, campaign, isPaused, contacts, setCampaigns, showNotification]);

    // Initialize state when campaign changes
    useEffect(() => {
        if (campaign) {
            const startIndex = campaign.sent + campaign.failed;
            setCurrentContactIndex(startIndex < contacts.length ? startIndex : 0);
            setIsPaused(campaign.status === CampaignStatus.PAUSED);
        }
    // FIX: Add campaign and contacts to dependency array for correctness.
    }, [campaign, contacts]);

    const handlePauseToggle = () => {
        const newStatus = !isPaused ? CampaignStatus.PAUSED : CampaignStatus.RUNNING;
        setIsPaused(!isPaused);
        setCampaigns(prev => prev.map(c => 
            c.id === campaign?.id ? { ...c, status: newStatus } : c
        ));
        showNotification({
            message: `Campaign has been ${!isPaused ? 'paused' : 'resumed'}.`,
            type: !isPaused ? 'warning' : 'info'
        });
    };
    
    const handleStop = () => {
        if (window.confirm("Are you sure you want to stop this campaign? Progress will be saved.")) {
            setCampaigns(prev => prev.map(c => 
                c.id === campaign?.id ? { ...c, status: CampaignStatus.PAUSED } : c
            ));
        }
    };
    
    if (!campaign || !currentContact) {
        return (
            <Card>
                <h2 className="text-xl font-bold">No active campaign</h2>
                <p>Please start a campaign from the Campaigns page.</p>
            </Card>
        );
    }
    
    const progressPercent = contacts.length > 0 ? (campaign.sent / contacts.length) * 100 : 0;
    
    return (
        <div className="space-y-6">
             <Card>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">{campaign.name}</h2>
                        <p className="text-gray-500 dark:text-gray-400">Sending message {campaign.sent + 1} of {contacts.length}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button onClick={handlePauseToggle} icon={isPaused ? <PlayIcon/> : <PauseIcon/>}>
                            {isPaused ? 'Resume' : 'Pause'}
                        </Button>
                         <Button onClick={handleStop} variant="secondary" className="!bg-red-500/10 !text-red-500 hover:!bg-red-500/20">Stop Campaign</Button>
                    </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-4">
                    <div className="bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] h-2.5 rounded-full transition-all duration-500" style={{width: `${progressPercent}%`}}></div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Step 1: Message Content">
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-semibold">Recipient:</label>
                            <div className="flex items-center space-x-2 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                                <input type="text" readOnly value={currentContact.number} className="flex-1 bg-transparent font-mono focus:outline-none"/>
                                <Button className="!py-1 !px-2 !text-xs" onClick={() => navigator.clipboard.writeText(currentContact.number)}>Copy Number</Button>
                            </div>
                        </div>
                         <div>
                            <label className="text-sm font-semibold">{campaign.attachment ? 'Caption:' : 'Message:'}</label>
                            <div className="relative">
                                <textarea
                                    readOnly
                                    value={processedMessage}
                                    rows={8}
                                    className="w-full p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md font-mono"
                                />
                                <Button className="!absolute !bottom-2 !right-2 !py-1 !px-2 !text-xs" onClick={() => navigator.clipboard.writeText(processedMessage)}>Copy Message</Button>
                            </div>
                        </div>
                        {campaign.attachment && (
                            <div>
                                <label className="text-sm font-semibold">Attachment:</label>
                                 <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                                    <p className="font-semibold">{campaign.attachment.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{campaign.attachment.type}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
                 <Card title="Step 2: Send in WhatsApp">
                    <div className="space-y-4 text-center h-full flex flex-col justify-center items-center">
                        <h3 className="text-lg font-bold">Action Required</h3>
                        <ol className="list-decimal list-inside text-left space-y-2">
                             <li>
                                Open{' '}
                                <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer" className="text-[var(--gradient-via)] hover:underline font-semibold">
                                    WhatsApp Web
                                </a>{' '}
                                in an adjacent window.
                            </li>
                            <li>In WhatsApp, start a new chat with the copied number.</li>
                            <li>Paste the message.</li>
                            {campaign.attachment && <li>Attach the specified file: <strong>{campaign.attachment.name}</strong></li>}
                            <li>Click Send.</li>
                        </ol>
                        <p className="text-sm text-gray-500 dark:text-gray-400 pt-4">
                            The next contact will be loaded automatically after a short delay.
                        </p>
                        {isPaused && (
                            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded-lg">
                                <p className="font-bold">Campaign Paused</p>
                                <p>Click "Resume" to continue sending.</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Sender;