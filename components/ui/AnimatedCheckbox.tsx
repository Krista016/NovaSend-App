import React from 'react';

interface AnimatedCheckboxProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

const AnimatedCheckbox: React.FC<AnimatedCheckboxProps> = ({ id, checked, onChange, disabled = false }) => {
    return (
        <label htmlFor={id} className={`relative flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-colors duration-300 ${disabled ? 'cursor-not-allowed' : ''}`}>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className="sr-only"
            />
            <div
                className={`w-5 h-5 rounded-full border-2 transition-all duration-300 
                ${checked ? 'bg-green-500 border-green-500' : 'bg-transparent border-gray-400 dark:border-gray-500'}
                ${!disabled ? 'group-hover:border-green-400' : ''}`}
            >
                <svg
                    className={`w-full h-full text-white transform transition-transform duration-300 ${checked ? 'scale-100' : 'scale-0'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </label>
    );
};

export default AnimatedCheckbox;