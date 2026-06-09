import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { SystemSetting } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const CATEGORIES = ['general', 'email', 'security', 'rate_limits', 'registration', 'maintenance'];

const AdminSettings: React.FC = () => {
    const { showNotification } = useAppContext();
    const [settings, setSettings] = useState<SystemSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('general');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await adminApi.getSettings(activeCategory);
            setSettings(res.settings || []);
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [activeCategory]);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async (key: string) => {
        try {
            setSaving(true);
            await adminApi.updateSettings([{ key, value: editValue, category: activeCategory }]);
            showNotification({ message: `Setting "${key}" updated`, type: 'success' });
            setEditingKey(null);
            fetchSettings();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleAddSetting = async () => {
        const key = prompt('Setting key:');
        if (!key) return;
        const value = prompt('Setting value:') || '';
        try {
            await adminApi.updateSettings([{ key, value, category: activeCategory }]);
            showNotification({ message: 'Setting added', type: 'success' });
            fetchSettings();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const startEdit = (setting: SystemSetting) => {
        setEditingKey(setting.key);
        setEditValue(setting.value);
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Settings</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure site-wide parameters</p>
                </div>
                <button onClick={handleAddSetting}
                    className="px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90">
                    + Add Setting
                </button>
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
                            activeCategory === cat
                                ? 'bg-[var(--gradient-from)] text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}>
                        {cat.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {/* Settings List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : settings.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        No settings in this category.
                        <button onClick={handleAddSetting} className="ml-2 text-[var(--gradient-from)] hover:underline">Add one</button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {settings.map(s => (
                            <div key={s.key} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900 dark:text-white">{s.key}</div>
                                    {editingKey === s.key ? (
                                        <div className="mt-2 flex gap-2">
                                            <input type="text" value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                                                autoFocus onKeyDown={e => e.key === 'Enter' && handleSave(s.key)} />
                                            <button onClick={() => handleSave(s.key)} disabled={saving}
                                                className="px-3 py-1.5 bg-emerald-500 text-white rounded text-sm hover:bg-emerald-600">Save</button>
                                            <button onClick={() => setEditingKey(null)}
                                                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm">Cancel</button>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{s.value || '(empty)'}</div>
                                    )}
                                </div>
                                <div className="text-xs text-gray-400">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''}</div>
                                {editingKey !== s.key && (
                                    <button onClick={() => startEdit(s)}
                                        className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                        Edit
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSettings;