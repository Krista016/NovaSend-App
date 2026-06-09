
import { createContext, useContext } from 'react';
import type { AppContextType } from '../types';

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppContext.Provider');
    }
    return context;
};
