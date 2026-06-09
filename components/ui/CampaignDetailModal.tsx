import React, { useState, useEffect, useMemo } from 'react';
import { Campaign, CampaignStatus } from '../../types';
import Button from './Button';
import Card from './Card';
import { campaignApi } from '../../services/api';
import { useAppContext } from '../../hooks/useAppContext';
import { TrashIcon, SearchIcon, RefreshIcon, InfoIcon } from '../icons/Icons';

interface CampaignDetailModalProps {
    onClose: () => void;
    campaign: Campaign;
}

interface LogEntry {
    id: number;
    number: string;
    status: string;
    message_preview: string;
    timestamp: string;
}

const DetailStat: React.FC<{ 
    label: string; 
    value: string | number; 
    themeClass: string; 
}> = ({ label, value, themeClass }) => (
    <div className={`p-4 rounded-2xl border transition-all duration-300 hover:shadow-md ${themeClass}`}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-2xl font-bold mt-1 font-sans">{value}</p>
    </div>
);

const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({ onClose, campaign }) => {
    const { campaigns, setCampaigns, showNotification } = useAppContext();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Sent' | 'Failed'>('All');
    const [confirmClear, setConfirmClear] = useState<boolean>(false);
    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

    // Grab the latest synced campaign details from the App Context
    const currentCampaign = useMemo(() => {
        return campaigns.find(c => String(c.id) === String(campaign.id)) || campaign;
    }, [campaigns, campaign]);

    const successRate = useMemo(() => {
        if (currentCampaign.sent === 0) return '0.0';
        const successful = currentCampaign.sent - currentCampaign.failed;
        return ((successful / currentCampaign.sent) * 100).toFixed(1);
    }, [currentCampaign.sent, currentCampaign.failed]);

    const progress = useMemo(() => {
        if (currentCampaign.total === 0) return 0;
        return (currentCampaign.sent / currentCampaign.total) * 100;
    }, [currentCampaign.sent, currentCampaign.total]);

    const fetchLogs = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const data = await campaignApi.getLogs(currentCampaign.id);
            if (data.status === 'success') {
                setLogs(data.logs || []);
            }
        } catch (err: any) {
            console.error('Failed to fetch campaign logs:', err);
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    // Initial fetch of logs
    useEffect(() => {
        fetchLogs();
    }, [currentCampaign.id]);

    // Live sync polling: refetch logs every 2 seconds if campaign is running
    useEffect(() => {
        if (currentCampaign.status !== CampaignStatus.RUNNING) return;

        const intervalId = setInterval(() => {
            fetchLogs(true);
        }, 2000);

        return () => clearInterval(intervalId);
    }, [currentCampaign.status, currentCampaign.id]);

    const handleClearLogs = async () => {
        try {
            await campaignApi.clearLogs(currentCampaign.id);
            setCampaigns(prev => prev.map(c => 
                String(c.id) === String(currentCampaign.id) ? { ...c, sent: 0, failed: 0 } : c
            ));
            setLogs([]);
            setConfirmClear(false);
            showNotification({ message: 'Campaign logs cleared and counts reset.', type: 'success' });
        } catch (err: any) {
            showNotification({ message: `Failed to clear logs: ${err.message}`, type: 'error' });
        }
    };

    // Filter and search logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = 
                log.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.message_preview.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = 
                statusFilter === 'All' || 
                (statusFilter === 'Sent' && log.status.toLowerCase() === 'sent') ||
                (statusFilter === 'Failed' && log.status.toLowerCase() === 'failed');

            return matchesSearch && matchesStatus;
        });
    }, [logs, searchTerm, statusFilter]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl transform transition-all overflow-hidden" onClick={(e) => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                    <div>
                        <div className="flex items-center space-x-3">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{currentCampaign.name}</h2>
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                currentCampaign.status === CampaignStatus.RUNNING ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400 animate-pulse' :
                                currentCampaign.status === CampaignStatus.COMPLETED ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' :
                                currentCampaign.status === CampaignStatus.PAUSED ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400' :
                                currentCampaign.status === CampaignStatus.FAILED ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                            }`}>{currentCampaign.status}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Created on: {new Date(currentCampaign.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    
                    {/* Overall Progress */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300">Execution Progress</h3>
                            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                {currentCampaign.sent.toLocaleString()} / {currentCampaign.total.toLocaleString()} sent
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-5 relative overflow-hidden p-0.5 border dark:border-gray-700">
                            <div
                                className="bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailStat 
                            label="Sent" 
                            value={currentCampaign.sent.toLocaleString()} 
                            themeClass="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" 
                        />
                        <DetailStat 
                            label="Failed" 
                            value={currentCampaign.failed.toLocaleString()} 
                            themeClass="border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400" 
                        />
                        <DetailStat 
                            label="Total" 
                            value={currentCampaign.total.toLocaleString()} 
                            themeClass="border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400" 
                        />
                        <DetailStat 
                            label="Success Rate" 
                            value={`${successRate}%`} 
                            themeClass="border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400" 
                        />
                    </div>

                    {/* Logs Catalog and Actions */}
                    <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 bg-gray-50/50 dark:bg-gray-900/30">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                            <div className="relative w-full md:w-72">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search logs by phone or text..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all outline-none"
                                />
                            </div>
                            
                            <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
                                <div className="flex p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-semibold">
                                    {(['All', 'Sent', 'Failed'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setStatusFilter(tab)}
                                            className={`px-3 py-1.5 rounded-md transition-all ${
                                                statusFilter === tab
                                                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => fetchLogs()}
                                    title="Reload Logs"
                                    className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors border dark:border-gray-700"
                                >
                                    <RefreshIcon className="w-4 h-4" />
                                </button>

                                {logs.length > 0 && (
                                    <div className="relative">
                                        {!confirmClear ? (
                                            <button
                                                onClick={() => setConfirmClear(true)}
                                                className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 rounded-lg transition-colors"
                                            >
                                                <TrashIcon className="w-3.5 h-3.5" />
                                                <span>Clear Logs</span>
                                            </button>
                                        ) : (
                                            <div className="flex items-center space-x-1 bg-rose-500/20 border border-rose-500/30 p-1 rounded-lg text-[10px] font-bold">
                                                <button
                                                    onClick={handleClearLogs}
                                                    className="px-2 py-1 bg-rose-500 text-white rounded hover:bg-rose-600 transition"
                                                >
                                                    Yes, Clear
                                                </button>
                                                <button
                                                    onClick={() => setConfirmClear(false)}
                                                    className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 transition"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Logs Table */}
                        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 max-h-80 overflow-y-auto">
                            {loading ? (
                                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mb-2"></div>
                                    <p className="text-sm">Fetching logs...</p>
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 dark:text-gray-500 flex flex-col items-center">
                                    <InfoIcon className="w-8 h-8 opacity-50 mb-2" />
                                    <p className="text-sm font-semibold">No logs match your filter/search.</p>
                                    <p className="text-xs mt-1">Logs populate here once messages are being sent.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 sticky top-0 z-10 border-b dark:border-gray-800">
                                        <tr>
                                            <th className="p-3 font-semibold w-1/4">Recipient</th>
                                            <th className="p-3 font-semibold w-1/6">Status</th>
                                            <th className="p-3 font-semibold">Message Preview</th>
                                            <th className="p-3 font-semibold text-right w-1/6">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {filteredLogs.map((log) => {
                                            const isSent = log.status.toLowerCase() === 'sent';
                                            const isExpanded = expandedLogId === log.id;
                                            return (
                                                <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors">
                                                    <td className="p-3 font-mono text-gray-700 dark:text-gray-300 font-medium">
                                                        {log.number}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                            isSent
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isSent ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                            <span>{log.status}</span>
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-gray-600 dark:text-gray-400">
                                                        <div 
                                                            className={`cursor-pointer break-all transition-all ${isExpanded ? '' : 'truncate max-w-[280px]'}`}
                                                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                                            title="Click to expand"
                                                        >
                                                            {log.message_preview || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right text-xs text-gray-400 dark:text-gray-500">
                                                        {log.timestamp}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/60 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3 rounded-b-3xl">
                    <Button variant="secondary" onClick={onClose}>
                        Close Window
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CampaignDetailModal;