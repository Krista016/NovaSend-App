
import React from 'react';

// FIX: Extend HTMLAttributes to allow passing props like onClick to the underlying div.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    title?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, ...props }) => {
    return (
        <div className={`bg-white dark:bg-gray-800/50 rounded-xl shadow-md p-6 ${className}`} {...props}>
            {title && <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">{title}</h3>}
            {children}
        </div>
    );
};

export default Card;
