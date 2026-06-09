
import React from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import { SunIcon, MoonIcon } from '../icons/Icons';

const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useAppContext();

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
        <button
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200/50 dark:bg-gray-800 hover:bg-gray-300/50 dark:hover:bg-gray-700/50 transition-colors"
        >
            {theme === 'light' ? (
                 <MoonIcon className="text-gray-600 w-5 h-5" />
            ) : (
                 <SunIcon className="text-yellow-400 w-5 h-5" />
            )}
        </button>
    );
};

export default ThemeToggle;
