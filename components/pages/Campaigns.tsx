

import React, { useState, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { PauseIcon, TrashIcon, EditIcon, CampaignsIcon, SearchIcon, InfoIcon } from '../icons/Icons';
import { useAppContext } from '../../hooks/useAppContext';
import { Campaign, CampaignStatus } from '../../types';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import CampaignDetailModal from '../ui/CampaignDetailModal';

const StatusBadge: React.FC<{ status: CampaignStatus }> = ({ status }) => {
    const statusClasses = {
        [CampaignStatus.DRAFT]: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
        [CampaignStatus.SCHEDULED]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
        [CampaignStatus.RUNNING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 animate-pulse',
        [CampaignStatus.PAUSED]: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
        [CampaignStatus.COMPLETED]: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
        [CampaignStatus.FAILED]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status]}`}>{status}</span>;
}

const ProgressBar: React.FC<{ sent: number; total: number }> = ({ sent, total }) => {
    const percentage = total > 0 ? (sent / total) * 100 : 0;
    return (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative overflow-hidden">
            <div
                className="bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] h-4 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
            ></div>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white mix-blend-lighten">
                {sent.toLocaleString()}/{total.toLocaleString()}
            </span>
        </div>
    );
};

const Campaigns: React.FC = () => {
    const { 
        campaigns, 
        setCampaigns, 
        showNotification,
        setIsCampaignEditorOpen,
        setEditingCampaign,
        handleCampaignStatusChange
    } = useAppContext();
    const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
    const [selectedCampaignDetail, setSelectedCampaignDetail] = useState<Campaign | null>(null);
    const [isClearingHistory, setIsClearingHistory] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
    const [historyMode, setHistoryMode] = useState(false);

    const filteredCampaigns = useMemo(() => {
        return campaigns.filter(campaign => {
            const isHistoryItem = campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.FAILED;
            
            if (historyMode && !isHistoryItem) return false;
            if (!historyMode && isHistoryItem) return false;

            const statusMatch = statusFilter === 'all' || campaign.status === statusFilter;
            const searchMatch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase());
            return statusMatch && searchMatch;
        });
    }, [campaigns, searchTerm, statusFilter, historyMode]);

    const confirmDeleteCampaign = () => {
        if (deletingCampaign) {
            setCampaigns(prev => prev.filter(c => c.id !== deletingCampaign.id));
            showNotification({ message: `Campaign "${deletingCampaign.name}" deleted.`, type: 'error' });
            setDeletingCampaign(null);
        }
    };
    
    const confirmClearHistory = () => {
        setCampaigns(prev => prev.filter(c => c.status !== CampaignStatus.COMPLETED && c.status !== CampaignStatus.FAILED));
        showNotification({ message: "Campaign history cleared.", type: 'info' });
        setIsClearingHistory(false);
    };

    const handleEditCampaign = (campaign: Campaign) => {
        setEditingCampaign(campaign);
        setIsCampaignEditorOpen(true);
    };
    
    const handleCreateCampaign = () => {
        setEditingCampaign(null);
        setIsCampaignEditorOpen(true);
    };

    const CampaignActions: React.FC<{ campaign: Campaign }> = ({ campaign }) => (
        <div className="flex items-center justify-end space-x-2">
            <button title="View Logs & Details" onClick={(e) => { e.stopPropagation(); setSelectedCampaignDetail(campaign); }} className="p-1.5 text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10 rounded-full transition-colors"><InfoIcon className="w-5 h-5" /></button>
            <button title="Edit" onClick={(e) => { e.stopPropagation(); handleEditCampaign(campaign); }} className="p-1.5 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-colors"><EditIcon /></button>
            { (campaign.status === CampaignStatus.SCHEDULED || campaign.status === CampaignStatus.PAUSED || campaign.status === CampaignStatus.DRAFT) &&
                 <Button onClick={(e) => { e.stopPropagation(); handleCampaignStatusChange(campaign.id, CampaignStatus.RUNNING); }} className="!text-xs !py-1 !px-2.5 !bg-green-500 hover:!bg-green-600">Launch</Button>
            }
            { campaign.status === CampaignStatus.RUNNING &&
                 <Button onClick={(e) => { e.stopPropagation(); handleCampaignStatusChange(campaign.id, CampaignStatus.PAUSED); }} icon={<PauseIcon />} className="!text-xs !py-1 !px-2.5 !bg-orange-500 hover:!bg-orange-600">Pause</Button>
            }
            { campaign.status !== CampaignStatus.RUNNING &&
                <button title="Delete" onClick={(e) => { e.stopPropagation(); setDeletingCampaign(campaign); }} className="p-1.5 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"><TrashIcon /></button>
            }
        </div>
    );

    const statusFilterOptions: (CampaignStatus | 'all')[] = historyMode 
        ? ['all', CampaignStatus.COMPLETED, CampaignStatus.FAILED]
        : ['all', CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.RUNNING, CampaignStatus.PAUSED];

    return (
        <>
            <div className="space-y-8">
                <Card>
                     <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                             <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Campaign Management</h2>
                             <p className="text-gray-500 dark:text-gray-400 mt-1">Oversee, edit, and launch all your campaigns from here.</p>
                        </div>
                        <Button variant="primary" onClick={handleCreateCampaign} icon={<CampaignsIcon className="w-5 h-5" />}>
                           Create New Campaign
                        </Button>
                    </div>
                </Card>

                <Card title={historyMode ? "Campaign History" : "All Campaigns"}>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex-shrink-0 p-1 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center">
                            <button onClick={() => setHistoryMode(false)} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${!historyMode ? 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>Current</button>
                            <button onClick={() => setHistoryMode(true)} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${historyMode ? 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>History</button>
                        </div>
                         {historyMode && (
                             <Button onClick={() => setIsClearingHistory(true)} className="!bg-red-500/10 !text-red-500 hover:!bg-red-500/20" icon={<TrashIcon />}>
                                Clear All History
                            </Button>
                        )}
                    </div>
                     <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                        <div className="relative w-full md:w-64">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search campaigns..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition"
                            />
                        </div>
                        <div className="flex-shrink-0 p-1 rounded-lg bg-gray-200 dark:bg-gray-700/50 flex flex-wrap justify-center">
                            {statusFilterOptions.map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${statusFilter === status ? 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}
                                >
                                    {status === 'all' ? 'All' : status}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b dark:border-gray-700">
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Name</th>
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Status</th>
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400 w-1/3">Progress</th>
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Date</th>
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCampaigns.map(c => (
                                    <tr key={c.id} onClick={() => setSelectedCampaignDetail(c)} className="border-b dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/20 cursor-pointer transition-colors duration-200">
                                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{c.name}</td>
                                        <td className="p-3"><StatusBadge status={c.status} /></td>
                                        <td className="p-3 text-sm text-gray-500 dark:text-gray-400">
                                            {c.status === CampaignStatus.SCHEDULED || c.status === CampaignStatus.DRAFT ? 'Not Started' : <ProgressBar sent={c.sent} total={c.total} />}
                                        </td>
                                        <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{c.scheduledAt || c.createdAt}</td>
                                        <td className="p-3 text-right"><CampaignActions campaign={c} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {selectedCampaignDetail && <CampaignDetailModal campaign={selectedCampaignDetail} onClose={() => setSelectedCampaignDetail(null)} />}
                {deletingCampaign && <ConfirmDeleteModal title="Delete Campaign" message={`Are you sure you want to permanently delete the "${deletingCampaign.name}" campaign? This action cannot be undone.`} onConfirm={confirmDeleteCampaign} onClose={() => setDeletingCampaign(null)} />}
                {isClearingHistory && <ConfirmDeleteModal title="Clear Campaign History" message={`Are you sure you want to permanently delete all completed and failed campaigns from your history? This action cannot be undone.`} onConfirm={confirmClearHistory} onClose={() => setIsClearingHistory(null)} />}
            </div>
        </>
    );
};

export default Campaigns;