



import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Contact, Group, ContactStatus } from '../../types';
import { UploadIcon, ArrowUpIcon, ArrowDownIcon, UsersIcon, InfoIcon, ChevronDownIcon } from '../icons/Icons';
import ImportContactsModal from '../ui/ImportContactsModal';
import AddEditContactModal from '../ui/AddEditContactModal';
import ManageGroupsModal from '../ui/ManageGroupsModal';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import AnimatedCheckbox from '../ui/AnimatedCheckbox';
import { useAppContext } from '../../hooks/useAppContext';
import { contactApi } from '../../services/api';

const StatusBadge: React.FC<{ status: ContactStatus }> = ({ status }) => {
    const statusClasses = {
        'Subscribed': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
        'Active': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
        'New': 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
        'Pending': 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
        'Prospect': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
        'Inactive': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
        'Unsubscribed': 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
        'Blocked': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status] || statusClasses['Unsubscribed']}`}>{status}</span>;
}

interface AssignGroupModalProps {
    onClose: () => void;
    onAssign: (selectedGroupNames: string[]) => void;
    allGroups: Group[];
    contactCount: number;
}
const AssignGroupModal: React.FC<AssignGroupModalProps> = ({ onClose, onAssign, allGroups, contactCount }) => {
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

    const handleToggleGroup = (groupName: string) => {
        setSelectedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupName)) {
                newSet.delete(groupName);
            } else {
                newSet.add(groupName);
            }
            return newSet;
        });
    };
    
    const handleSubmit = () => {
        onAssign(Array.from(selectedGroups));
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold">Assign to Groups</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Assigning {contactCount} selected contacts.</p>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
                     {allGroups.map(group => (
                        <div key={group.id} onClick={() => handleToggleGroup(group.name)} className="flex items-center p-4 rounded-lg bg-gray-100 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <AnimatedCheckbox
                                id={`assign-group-${group.id}`}
                                checked={selectedGroups.has(group.name)}
                                onChange={() => handleToggleGroup(group.name)}
                            />
                            <span className="flex-grow text-center font-medium">{group.name}</span>
                        </div>
                    ))}
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit}>Assign</Button>
                </div>
            </div>
        </div>
    );
};

const Contacts: React.FC = () => {
    const { showNotification, contacts, setContacts, groups, setGroups } = useAppContext();
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
    const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [isAssignGroupModalOpen, setIsAssignGroupModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Contact; direction: 'ascending' | 'descending' } | null>(null);
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
    const groupDropdownRef = useRef<HTMLDivElement>(null);

    const sortedAndFilteredContacts = useMemo(() => {
        let filteredItems = [...contacts];

        if (searchTerm) {
            filteredItems = filteredItems.filter(contact =>
                contact.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (groupFilter !== 'all') {
            filteredItems = filteredItems.filter(contact => contact.groups?.includes(groupFilter));
        }

        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [contacts, searchTerm, sortConfig, groupFilter]);

    useEffect(() => {
        // Clear selection if filtered contacts change to prevent stale selections
        const visibleIds = new Set(sortedAndFilteredContacts.map(c => c.id));
        setSelectedContactIds(prev => new Set([...prev].filter(id => visibleIds.has(id))));
    }, [sortedAndFilteredContacts]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target as Node)) {
                setIsGroupDropdownOpen(false);
            }
        };

        if (isGroupDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isGroupDropdownOpen]);

    const handleImport = async (newContacts: Contact[]) => {
        try {
            await contactApi.createBulk(newContacts.map(c => ({
                number: c.number,
                firstName: c.firstName,
                lastName: c.lastName,
                status: c.status || 'Active',
                groups: c.groups || []
            })));
            const result = await contactApi.list();
            if (result && result.contacts) {
                const serverContacts = result.contacts.map((c: any) => ({
                    id: String(c.id),
                    number: c.number,
                    firstName: c.first_name || '',
                    lastName: c.last_name || '',
                    groups: c.groups || [],
                    status: c.status || 'Subscribed',
                }));
                setContacts(serverContacts);
            }
            showNotification({
                message: `${newContacts.length} ${newContacts.length > 1 ? 'contacts have' : 'contact has'} been imported.`,
                type: 'success'
            });
        } catch (err: any) {
            showNotification({ message: `Failed to import contacts: ${err.message}`, type: 'error' });
        }
    };

    const handleDeleteContact = async () => {
        if (deletingContact) {
            try {
                await contactApi.delete(deletingContact.id);
                setContacts(prev => prev.filter(c => c.id !== deletingContact.id));
                showNotification({ 
                    message: `Contact ${deletingContact.firstName || deletingContact.number} deleted.`, 
                    type: 'error' 
                });
            } catch (err: any) {
                showNotification({ message: `Failed to delete contact: ${err.message}`, type: 'error' });
            }
            setIsDeleteModalOpen(false);
            setDeletingContact(null);
        }
    };
    
    const handleAddContact = () => {
        setEditingContact(null);
        setIsAddEditModalOpen(true);
    };

    const handleEditContact = (contact: Contact) => {
        setEditingContact(contact);
        setIsAddEditModalOpen(true);
    };

    const handleSaveContact = async (contactToSave: Contact) => {
        const isNew = !contactToSave.id || contactToSave.id.startsWith('contact_') || !contacts.some(c => c.id === contactToSave.id);
        if (isNew) {
            try {
                const res = await contactApi.create({
                    number: contactToSave.number,
                    first_name: contactToSave.firstName,
                    last_name: contactToSave.lastName,
                    status: contactToSave.status || 'Subscribed',
                    groups: contactToSave.groups || []
                });
                if (res && res.contact) {
                    const saved: Contact = {
                        id: String(res.contact.id),
                        number: res.contact.number,
                        firstName: res.contact.first_name || '',
                        lastName: res.contact.last_name || '',
                        groups: res.contact.groups || [],
                        status: (res.contact.status || 'Subscribed') as ContactStatus
                    };
                    setContacts(prev => [...prev, saved]);
                    showNotification({ message: `Contact ${saved.number} added.`, type: 'success' });
                }
            } catch (err: any) {
                showNotification({ message: `Failed to add contact: ${err.message}`, type: 'error' });
            }
        } else {
            try {
                const res = await contactApi.update(contactToSave.id, {
                    number: contactToSave.number,
                    first_name: contactToSave.firstName,
                    last_name: contactToSave.lastName,
                    status: contactToSave.status || 'Subscribed',
                    groups: contactToSave.groups || []
                });
                if (res && res.contact) {
                    const updated: Contact = {
                        id: String(res.contact.id),
                        number: res.contact.number,
                        firstName: res.contact.first_name || '',
                        lastName: res.contact.last_name || '',
                        groups: res.contact.groups || [],
                        status: (res.contact.status || 'Subscribed') as ContactStatus
                    };
                    setContacts(prev => prev.map(c => c.id === contactToSave.id ? updated : c));
                    showNotification({ message: `Contact ${updated.number} updated.`, type: 'info' });
                }
            } catch (err: any) {
                showNotification({ message: `Failed to update contact: ${err.message}`, type: 'error' });
            }
        }
        setIsAddEditModalOpen(false);
    };

    const requestSort = (key: keyof Contact) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const handleSelect = (contactId: string) => {
        setSelectedContactIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(contactId)) {
                newSet.delete(contactId);
            } else {
                newSet.add(contactId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (isChecked: boolean) => {
        if (isChecked) {
            setSelectedContactIds(new Set(sortedAndFilteredContacts.map(c => c.id)));
        } else {
            setSelectedContactIds(new Set());
        }
    };
    
    const confirmBulkDelete = async () => {
        const count = selectedContactIds.size;
        try {
            for (const id of selectedContactIds) {
                await contactApi.delete(id);
            }
            setContacts(prev => prev.filter(c => !selectedContactIds.has(c.id)));
            showNotification({
                message: `${count} ${count > 1 ? 'contacts' : 'contact'} deleted successfully.`,
                type: 'error'
            });
        } catch (err: any) {
            showNotification({ message: `Failed to delete some contacts: ${err.message}`, type: 'error' });
        }
        setSelectedContactIds(new Set());
        setIsBulkDeleteModalOpen(false);
    };
    
    const handleBulkStatusChange = async (status: ContactStatus) => {
        const count = selectedContactIds.size;
        if (count === 0) return;

        try {
            for (const id of selectedContactIds) {
                const contact = contacts.find(c => c.id === id);
                if (contact) {
                    await contactApi.update(id, {
                        number: contact.number,
                        first_name: contact.firstName,
                        last_name: contact.lastName,
                        status: status,
                        groups: contact.groups || []
                    });
                }
            }
            setContacts(prev => prev.map(c => selectedContactIds.has(c.id) ? {...c, status} : c));
            showNotification({ 
                message: `${count} ${count > 1 ? 'contacts have' : 'contact has'} been updated to "${status}".`,
                type: 'success'
            });
        } catch (err: any) {
            showNotification({ message: `Failed to update status: ${err.message}`, type: 'error' });
        }
        setSelectedContactIds(new Set());
    };
    
    const handleAssignGroups = async (selectedGroupNames: string[]) => {
        const count = selectedContactIds.size;
        try {
            for (const id of selectedContactIds) {
                const contact = contacts.find(c => c.id === id);
                if (contact) {
                    const newGroups = Array.from(new Set([...(contact.groups || []), ...selectedGroupNames]));
                    await contactApi.update(id, {
                        number: contact.number,
                        first_name: contact.firstName,
                        last_name: contact.lastName,
                        status: contact.status || 'Subscribed',
                        groups: newGroups
                    });
                }
            }
            setContacts(prev => prev.map(c => {
                if (selectedContactIds.has(c.id)) {
                    const newGroups = new Set([...(c.groups || []), ...selectedGroupNames]);
                    return { ...c, groups: Array.from(newGroups) };
                }
                return c;
            }));
            showNotification({
                message: `${count} ${count > 1 ? 'contacts' : 'contact'} assigned to groups.`,
                type: 'success'
            });
        } catch (err: any) {
            showNotification({ message: `Failed to assign groups: ${err.message}`, type: 'error' });
        }
        setSelectedContactIds(new Set());
        setIsAssignGroupModalOpen(false);
    };

    const SortableHeader: React.FC<{ columnKey: keyof Contact, title: string }> = ({ columnKey, title }) => (
        <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400 cursor-pointer" onClick={() => requestSort(columnKey)}>
            <div className="flex items-center space-x-1">
                <span>{title}</span>
                {sortConfig?.key === columnKey && (
                    sortConfig.direction === 'ascending' ? <ArrowUpIcon /> : <ArrowDownIcon />
                )}
            </div>
        </th>
    );

    return (
        <>
            <div className="space-y-6">
                <Card>
                    <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
                        <h2 className="text-2xl font-bold">Contacts ({contacts.length})</h2>
                        <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch gap-2">
                             <input
                                type="text"
                                placeholder="Search contacts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full md:w-48 bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-[var(--gradient-via)] focus:border-[var(--gradient-via)] transition px-3 py-2 text-sm"
                            />
                            <div className="relative" ref={groupDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                                    className="w-full sm:w-auto h-full px-4 py-2 flex items-center justify-center space-x-2 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition text-sm"
                                >
                                    <span>{groupFilter === 'all' ? 'All Contact Groups' : groups.find(g => g.name === groupFilter)?.name}</span>
                                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isGroupDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isGroupDropdownOpen && (
                                    <div className="absolute left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-200 dark:border-gray-700">
                                        <div className="p-1">
                                            <a
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setGroupFilter('all');
                                                    setIsGroupDropdownOpen(false);
                                                }}
                                                className={`block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md ${groupFilter === 'all' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold' : ''}`}
                                            >
                                                All Contact Groups
                                            </a>
                                            {groups.map(group => (
                                                <a
                                                    key={group.id}
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setGroupFilter(group.name);
                                                        setIsGroupDropdownOpen(false);
                                                    }}
                                                    className={`block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md ${groupFilter === group.name ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold' : ''}`}
                                                >
                                                    {group.name}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <Button variant="secondary" onClick={() => setIsGroupsModalOpen(true)} icon={<UsersIcon className="w-4 h-4"/>}>Manage Groups</Button>
                            <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} icon={<UploadIcon className="w-4 h-4"/>}>Import</Button>
                            <Button variant="primary" onClick={handleAddContact}>Add Contact</Button>
                        </div>
                    </div>

                    {selectedContactIds.size > 0 && (
                        <div className="flex flex-col md:flex-row justify-between items-center my-4 gap-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                            <span className="font-semibold text-cyan-500">{selectedContactIds.size} selected</span>
                            <div className="flex flex-wrap gap-2">
                               <Button onClick={() => setIsAssignGroupModalOpen(true)} className="!py-1 !px-2 !text-xs">Assign Group</Button>
                               <Button onClick={() => handleBulkStatusChange('Subscribed')} className="!py-1 !px-2 !text-xs">Subscribe</Button>
                               <Button onClick={() => handleBulkStatusChange('Unsubscribed')} className="!py-1 !px-2 !text-xs">Unsubscribe</Button>
                               <Button onClick={() => setIsBulkDeleteModalOpen(true)} className="!py-1 !px-2 !text-xs !bg-red-500/10 !text-red-500 hover:!bg-red-500/20">Delete</Button>
                            </div>
                        </div>
                    )}
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b dark:border-gray-700">
                                    <th className="p-3 w-12 text-center">
                                        <AnimatedCheckbox
                                            id="select-all"
                                            checked={selectedContactIds.size === sortedAndFilteredContacts.length && sortedAndFilteredContacts.length > 0}
                                            onChange={handleSelectAll}
                                            disabled={sortedAndFilteredContacts.length === 0}
                                        />
                                    </th>
                                    <SortableHeader columnKey="number" title="Number" />
                                    <SortableHeader columnKey="firstName" title="First Name" />
                                    <SortableHeader columnKey="lastName" title="Last Name" />
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Groups</th>
                                    <SortableHeader columnKey="status" title="Status" />
                                    <th className="p-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAndFilteredContacts.map(c => (
                                    <tr key={c.id} className="border-b dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                        <td className="p-3 w-12 text-center">
                                            <AnimatedCheckbox
                                                id={`select-${c.id}`}
                                                checked={selectedContactIds.has(c.id)}
                                                onChange={() => handleSelect(c.id)}
                                            />
                                        </td>
                                        <td className="p-3 font-mono text-sm text-gray-800 dark:text-gray-200">{c.number}</td>
                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-300">{c.firstName || '-'}</td>
                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-300">{c.lastName || '-'}</td>
                                        <td className="p-3 text-sm">
                                            <div className="flex flex-wrap gap-1">
                                                {c.groups?.map(g => <span key={g} className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded-md">{g}</span>) || '-'}
                                            </div>
                                        </td>
                                        <td className="p-3 text-sm">
                                            <StatusBadge status={c.status || 'Unsubscribed'} />
                                        </td>
                                        <td className="p-3 text-sm space-x-2 whitespace-nowrap">
                                            <button onClick={() => handleEditContact(c)} className="text-blue-500 hover:underline">Edit</button>
                                            <button onClick={() => { setDeletingContact(c); setIsDeleteModalOpen(true); }} className="text-red-500 hover:underline">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                <div className="p-4 bg-blue-50 dark:bg-gray-800/50 border-l-4 border-blue-400 dark:border-blue-500 rounded-r-lg flex items-start space-x-3">
                    <InfoIcon className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-1 shrink-0" />
                    <div>
                        <h4 className="font-semibold text-blue-800 dark:text-blue-200">Phone Number Formatting</h4>
                         <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
                            <li>Numbers without a country code are automatically treated as Indian numbers (+91).</li>
                            <li>For all other countries, please provide the full number, including the plus sign (+) and country code (e.g., +1 202-555-0144).</li>
                        </ul>
                    </div>
                </div>
            </div>
            {isImportModalOpen && <ImportContactsModal existingContacts={contacts} onClose={() => setIsImportModalOpen(false)} onImport={handleImport} />}
            {isAddEditModalOpen && <AddEditContactModal contactToEdit={editingContact} allGroups={groups} onClose={() => setIsAddEditModalOpen(false)} onSave={handleSaveContact} />}
            {isGroupsModalOpen && <ManageGroupsModal groups={groups} setGroups={setGroups} onClose={() => setIsGroupsModalOpen(false)} />}
            {isDeleteModalOpen && <ConfirmDeleteModal title="Delete Contact" message={`Are you sure you want to delete ${deletingContact?.firstName || deletingContact?.number}? This action cannot be undone.`} onConfirm={handleDeleteContact} onClose={() => setIsDeleteModalOpen(false)} />}
            {isBulkDeleteModalOpen && <ConfirmDeleteModal title="Delete Contacts" message={`Are you sure you want to delete ${selectedContactIds.size} selected contacts? This action cannot be undone.`} onConfirm={confirmBulkDelete} onClose={() => setIsBulkDeleteModalOpen(false)} />}
            {isAssignGroupModalOpen && <AssignGroupModal contactCount={selectedContactIds.size} allGroups={groups} onAssign={handleAssignGroups} onClose={() => setIsAssignGroupModalOpen(false)} />}
        </>
    );
};

export default Contacts;