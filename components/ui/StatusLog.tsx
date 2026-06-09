
import React from 'react';
import { CampaignLogEntry } from '../../types';
import Card from './Card';

export const StatusLog: React.FC<{ logs: CampaignLogEntry[] }> = ({ logs }) => {
    return (
        <Card title="Live Campaign Status">
            <div className="h-96 overflow-y-auto utilities-scrollbar">
                {logs.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 mt-4">
                        No campaign running. Launch a campaign to see live status updates here.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                                <tr className="border-b dark:border-gray-700">
                                    <th className="p-2 font-semibold text-gray-500 dark:text-gray-400">Number</th>
                                    <th className="p-2 font-semibold text-gray-500 dark:text-gray-400">Text</th>
                                    <th className="p-2 font-semibold text-gray-500 dark:text-gray-400">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...logs].reverse().map(log => {
                                    const statusColorClasses = {
                                        green: 'text-green-500 dark:text-green-400',
                                        red: 'text-red-500 dark:text-red-400',
                                        yellow: 'text-yellow-500 dark:text-yellow-400',
                                        gray: 'text-gray-500 dark:text-gray-400'
                                    };
                                    return (
                                    <tr key={log.id} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/20">
                                        <td className="p-2 font-mono text-gray-800 dark:text-gray-200">{log.number}</td>
                                        <td className="p-2 text-gray-600 dark:text-gray-300 truncate max-w-xs" title={log.text}>{log.text}</td>
                                        <td className={`p-2 font-semibold ${statusColorClasses[log.statusColor]}`}>
                                            {log.status} <span className="text-xs text-gray-500 font-normal">({log.timestamp})</span>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    );
};
