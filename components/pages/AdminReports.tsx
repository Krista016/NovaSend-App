import React, { useState } from 'react';
import { adminApi } from '../../services/api';
import { useAppContext } from '../../hooks/useAppContext';

const AdminReports: React.FC = () => {
    const { showNotification } = useAppContext();
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [format, setFormat] = useState('json');
    const [loading, setLoading] = useState(false);

    const handleGenerateReport = async () => {
        try {
            setLoading(true);
            const params: Record<string, string> = { format };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.getUserReport(params);

            let content: string;
            let mime: string;
            if (format === 'csv') {
                content = res.data;
                mime = 'text/csv';
            } else {
                content = JSON.stringify(res.data, null, 2);
                mime = 'application/json';
            }

            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `user_report.${format}`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification({ message: 'Report downloaded', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleExportErrors = async (exportFormat: string) => {
        try {
            setLoading(true);
            const params: Record<string, string> = { format: exportFormat };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.exportErrors(params);

            let content: string;
            let mime: string;
            if (exportFormat === 'csv') {
                content = res.data;
                mime = 'text/csv';
            } else {
                content = JSON.stringify(res.data, null, 2);
                mime = 'application/json';
            }

            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `error_report.${exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification({ message: 'Error report downloaded', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleExportAudit = async (exportFormat: string) => {
        try {
            setLoading(true);
            const params: Record<string, string> = { format: exportFormat };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.exportAuditLogs(params);

            let content: string;
            let mime: string;
            if (exportFormat === 'csv') {
                content = res.data;
                mime = 'text/csv';
            } else {
                content = JSON.stringify(res.data, null, 2);
                mime = 'application/json';
            }

            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `audit_report.${exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification({ message: 'Audit report downloaded', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Generate and download reports in various formats</p>
            </div>

            {/* Date Range & Format */}
            <div className="flex flex-wrap gap-3 items-end p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Date From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Date To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Format</label>
                    <select value={format} onChange={e => setFormat(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                    </select>
                </div>
            </div>

            {/* Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ReportCard
                    title="User Report"
                    description="Complete user statistics including registrations, roles, statuses, and plans."
                    icon="👥"
                    formats={['json', 'csv']}
                    onGenerate={handleGenerateReport}
                    loading={loading}
                />
                <ReportCard
                    title="Error Report"
                    description="All error logs with stack traces, affected users, and resolution status."
                    icon="🐛"
                    formats={['json', 'csv']}
                    onGenerate={(fmt) => handleExportErrors(fmt)}
                    loading={loading}
                />
                <ReportCard
                    title="Audit Report"
                    description="Full audit trail of admin actions with timestamps and IP addresses."
                    icon="📋"
                    formats={['json', 'csv']}
                    onGenerate={(fmt) => handleExportAudit(fmt)}
                    loading={loading}
                />
            </div>
        </div>
    );
};

const ReportCard: React.FC<{
    title: string; description: string; icon: string;
    formats: string[]; onGenerate: (format: string) => void; loading: boolean;
}> = ({ title, description, icon, formats, onGenerate, loading }) => (
    <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">{description}</p>
        <div className="flex gap-2">
            {formats.map(fmt => (
                <button key={fmt} onClick={() => onGenerate(fmt)} disabled={loading}
                    className="flex-1 px-3 py-2 text-sm bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 uppercase">
                    {fmt}
                </button>
            ))}
        </div>
    </div>
);

export default AdminReports;