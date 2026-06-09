import React, { useState } from 'react';
import Button from './Button';
import { Group } from '../../types';
import { UsersIcon, TrashIcon } from '../icons/Icons';
import { groupApi } from '../../services/api';
import { useAppContext } from '../../hooks/useAppContext';

interface ManageGroupsModalProps {
    onClose: () => void;
    groups: Group[];
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

const ManageGroupsModal: React.FC<ManageGroupsModalProps> = ({ onClose, groups, setGroups }) => {
    const { showNotification } = useAppContext();
    const [newGroupName, setNewGroupName] = useState('');

    const handleAddGroup = async () => {
        const trimmed = newGroupName.trim();
        if (trimmed && !groups.some(g => g.name === trimmed)) {
            try {
                const res = await groupApi.create(trimmed);
                if (res && res.group) {
                    const newGroup = { id: String(res.group.id), name: res.group.name };
                    setGroups(prev => [...prev, newGroup]);
                    showNotification({ message: `Group "${trimmed}" created.`, type: 'success' });
                }
            } catch (err: any) {
                showNotification({ message: `Failed to create group: ${err.message}`, type: 'error' });
            }
            setNewGroupName('');
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (window.confirm("Are you sure? Deleting a group will not delete the contacts within it.")) {
            try {
                await groupApi.delete(groupId);
                setGroups(prev => prev.filter(g => g.id !== groupId));
                showNotification({ message: `Group deleted.`, type: 'error' });
            } catch (err: any) {
                showNotification({ message: `Failed to delete group: ${err.message}`, type: 'error' });
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold flex items-center space-x-2">
                        <UsersIcon className="w-6 h-6 text-[var(--gradient-via)]" />
                        <span>Manage Contact Groups</span>
                    </h2>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="New group name..."
                            className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center"
                        />
                        <Button variant="primary" onClick={handleAddGroup}>Add</Button>
                    </div>
                    <div className="space-y-2">
                        {groups.map(group => (
                            <div key={group.id} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                                <span className="font-medium">{group.name}</span>
                                <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-full">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Done</Button>
                </div>
            </div>
        </div>
    );
};

export default ManageGroupsModal;