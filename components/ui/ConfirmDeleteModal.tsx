import React from 'react';
import Button from './Button';

interface ConfirmDeleteModalProps {
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ onClose, onConfirm, title, message }) => {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{title}</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">{message}</p>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 flex justify-end space-x-3 rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="secondary"
                        className="!bg-red-500 !text-white hover:!bg-red-600 dark:hover:!bg-red-600"
                        onClick={onConfirm}
                    >
                        Yes, Delete
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDeleteModal;
