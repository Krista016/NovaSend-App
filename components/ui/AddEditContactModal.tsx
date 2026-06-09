


import React, { useState, useEffect } from 'react';
import Button from './Button';
import { Contact, Group, ContactStatus } from '../../types';
import { ContactsIcon } from '../icons/Icons';

interface AddEditContactModalProps {
    onClose: () => void;
    onSave: (contact: Contact) => void;
    contactToEdit: Contact | null;
    allGroups: Group[];
}

const allStatuses: ContactStatus[] = ['Pending', 'New', 'Prospect', 'Active', 'Inactive', 'Subscribed', 'Unsubscribed', 'Blocked'];

const AddEditContactModal: React.FC<AddEditContactModalProps> = ({ onClose, onSave, contactToEdit, allGroups }) => {
    const [contact, setContact] = useState<Partial<Contact>>({});
    
    useEffect(() => {
        setContact(contactToEdit || { status: 'New', groups: [] });
    }, [contactToEdit]);

    const handleGroupChange = (groupName: string, isChecked: boolean) => {
        const currentGroups = contact.groups || [];
        if (isChecked) {
            setContact(prev => ({ ...prev, groups: [...currentGroups, groupName] }));
        } else {
            setContact(prev => ({ ...prev, groups: currentGroups.filter(g => g !== groupName) }));
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (contact.number) {
            onSave(contact as Contact);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold flex items-center space-x-2">
                        <ContactsIcon className="w-6 h-6 text-[var(--gradient-via)]" />
                        <span>{contactToEdit ? 'Edit Contact' : 'Add New Contact'}</span>
                    </h2>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                            <input
                                type="tel"
                                id="number"
                                value={contact.number || ''}
                                onChange={e => setContact(prev => ({ ...prev, number: e.target.value }))}
                                placeholder="+1234567890"
                                className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center"
                                required
                            />
                        </div>
                        <div>
                             <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                             <select
                                id="status"
                                value={contact.status || ''}
                                onChange={e => setContact(prev => ({ ...prev, status: e.target.value as ContactStatus }))}
                                className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition px-4 py-2 text-center"
                             >
                                {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                            <input
                                type="text"
                                id="firstName"
                                value={contact.firstName || ''}
                                onChange={e => setContact(prev => ({ ...prev, firstName: e.target.value }))}
                                className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center"
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                            <input
                                type="text"
                                id="lastName"
                                value={contact.lastName || ''}
                                onChange={e => setContact(prev => ({ ...prev, lastName: e.target.value }))}
                                className="w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition text-center"
                            />
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Groups</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {allGroups.map(group => (
                                <label key={group.id} className="flex items-center space-x-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={contact.groups?.includes(group.name)}
                                        onChange={e => handleGroupChange(group.name, e.target.checked)}
                                        className="rounded text-[var(--gradient-via)] focus:ring-[var(--gradient-via)]"
                                    />
                                    <span>{group.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary">Save Contact</Button>
                </div>
            </form>
        </div>
    );
};

export default AddEditContactModal;