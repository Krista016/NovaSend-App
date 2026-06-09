

import React, { useState, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { CampaignsIcon, ContactsIcon, AccountsIcon, PauseIcon, TrashIcon, EditIcon } from '../icons/Icons';
import { useAppContext } from '../../hooks/useAppContext';
import { Campaign, CampaignStatus } from '../../types';
import CampaignDetailModal from '../ui/CampaignDetailModal';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import { StatusLog } from '../ui/StatusLog';

const StatCard: React.FC<{ title: string; value: string; change?: string; isUp?: boolean }> = ({ title, value, change, isUp }) => (
    <Card>
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-3xl font-bold text-gray-800 dark:text-gray-200 mt-1">{value}</p>
        {change && (
            <div className={`text-sm mt-2 flex items-center ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                {isUp ? '▲' : '▼'} {change} vs last month
            </div>
        )}
    </Card>
);

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

const Dashboard: React.FC = () => {
    const { 
        setCurrentPage, 
        campaigns, 
        setCampaigns, 
        showNotification,
        setIsCampaignEditorOpen,
        setEditingCampaign,
        handleCampaignStatusChange,
        campaignLogs,
        contacts,
    } = useAppContext();
    const [selectedCampaignDetail, setSelectedCampaignDetail] = useState<Campaign | null>(null);
    const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);

    const dashboardStats = useMemo(() => {
        const totalSent = campaigns.reduce((acc, c) => acc + c.sent, 0);
        const totalFailed = campaigns.reduce((acc, c) => acc + c.failed, 0);
        const totalLaunched = campaigns.filter(c => 
            c.status !== CampaignStatus.DRAFT && c.status !== CampaignStatus.SCHEDULED
        ).length;

        const successRate = totalSent > 0 ? (((totalSent - totalFailed) / totalSent) * 100).toFixed(1) : '0.0';
        
        const formatNumber = (num: number) => {
            if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
            if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
            return num.toLocaleString();
        }

        return {
            totalMessagesSent: formatNumber(totalSent),
            successRate: `${successRate}%`,
            campaignsLaunched: totalLaunched.toLocaleString(),
            totalContacts: contacts.length.toLocaleString(),
        }
    }, [campaigns, contacts]);

    const confirmDeleteCampaign = () => {
        if (deletingCampaign) {
            setCampaigns(prev => prev.filter(c => c.id !== deletingCampaign.id));
            showNotification({ message: `Campaign "${deletingCampaign.name}" deleted.`, type: 'error' });
            setDeletingCampaign(null);
        }
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

    const recentCampaigns = [...campaigns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

    return (
        <>
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Total Messages Sent" value={dashboardStats.totalMessagesSent} change="12.5%" isUp={true} />
                    <StatCard title="Overall Success Rate" value={dashboardStats.successRate} change="0.2%" isUp={true} />
                    <StatCard title="Campaigns Launched" value={dashboardStats.campaignsLaunched} />
                    <StatCard title="Contacts" value={dashboardStats.totalContacts} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card title="Recent Campaigns" className="h-full">
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
                                        {recentCampaigns.map(c => (
                                            <tr key={c.id} onClick={() => setSelectedCampaignDetail(c)} className="border-b dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/20 cursor-pointer transition-colors duration-200">
                                                <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{c.name}</td>
                                                <td className="p-3"><StatusBadge status={c.status} /></td>
                                                <td className="p-3 text-sm text-gray-500 dark:text-gray-400">
                                                    {c.status === CampaignStatus.SCHEDULED ? 'Not Started' : <ProgressBar sent={c.sent} total={c.total} />}
                                                </td>
                                                <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{c.scheduledAt || c.createdAt}</td>
                                                <td className="p-3 text-sm text-gray-500 dark:text-gray-400"><CampaignActions campaign={c} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                    <Card title="Quick Actions" className="h-full">
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Start something new with just one click.</p>
                            <Button variant="primary" className="w-full" icon={<CampaignsIcon className="w-5 h-5"/>} onClick={handleCreateCampaign}>
                                Create New Campaign
                            </Button>
                            <Button variant="secondary" className="w-full" icon={<ContactsIcon className="w-5 h-5"/>} onClick={() => setCurrentPage('Contacts')}>
                                Add New Contacts
                            </Button>
                            <Button variant="secondary" className="w-full" icon={<AccountsIcon className="w-5 h-5"/>} onClick={() => setCurrentPage('Accounts')}>
                                Add New Account
                            </Button>
                        </div>
                    </Card>
                </div>
                <StatusLog logs={campaignLogs} />
            </div>
            {selectedCampaignDetail && <CampaignDetailModal campaign={selectedCampaignDetail} onClose={() => setSelectedCampaignDetail(null)} />}
            {deletingCampaign && <ConfirmDeleteModal title="Delete Campaign" message={`Are you sure you want to permanently delete the "${deletingCampaign.name}" campaign? This action cannot be undone.`} onConfirm={confirmDeleteCampaign} onClose={() => setDeletingCampaign(null)} />}
        </>
    );
};

export default Dashboard;