import React, { useState } from 'react';
import Button from './Button';
import { AccountsIcon } from '../icons/Icons';

interface AddAccountModalProps {
    onClose: () => void;
    onAdd: (accountName: string) => void;
}

const AddAccountModal: React.FC<AddAccountModalProps> = ({ onClose, onAdd }) => {
    const [accountName, setAccountName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (accountName.trim()) {
            onAdd(accountName.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold flex items-center space-x-2">
                        <AccountsIcon className="w-6 h-6 text-[var(--gradient-via)]" />
                        <span>Add New Account</span>
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter a name for your new WhatsApp account.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <label htmlFor="accountName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
                        <input
                            type="text"
                            id="accountName"
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            placeholder="e.g., Marketing Team"
                            className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center"
                            required
                        />
                    </div>
                    <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button type="submit" variant="primary">Add Account</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddAccountModal;