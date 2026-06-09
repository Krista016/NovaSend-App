import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'outline';
    className?: string;
    icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ children, variant = 'secondary', className = '', icon, ...props }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-[var(--gradient-via)]';

    const variantClasses = {
        primary: 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] hover:shadow-lg hover:shadow-[var(--gradient-via)]/30',
        secondary: 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600',
        outline: 'bg-transparent dark:bg-transparent p-[2px] group',
    };
    
    if (variant === 'outline') {
        return (
            <button className={`${baseClasses} ${variantClasses.outline} ${className}`} {...props}>
                <div className="w-full h-full px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-900 group-hover:bg-transparent dark:group-hover:bg-transparent transition-colors">
                     <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] font-semibold">
                       {icon && <span>{icon}</span>}
                       <span>{children}</span>
                    </span>
                </div>
            </button>
        )
    }
    
    // Dark mode outline variant (neon aura effect)
    const primaryDarkOutlineClasses = `
        dark:bg-transparent dark:text-gray-100 dark:relative dark:p-[2px] dark:overflow-hidden
        dark:before:content-[''] dark:before:absolute dark:before:-top-1/2 dark:before:-left-1/2 dark:before:w-[200%] dark:before:h-[200%]
        dark:before:bg-gradient-to-r dark:before:from-[var(--gradient-from)] dark:before:via-[var(--gradient-via)] dark:before:to-[var(--gradient-to)]
        dark:before:animate-[spin_4s_linear_infinite]
        dark:hover:shadow-lg dark:hover:shadow-[var(--gradient-via)]/30
    `;

    if (variant === 'primary') {
        return (
            <button className={`${baseClasses} ${variantClasses.primary} ${className} relative overflow-hidden`} {...props}>
                <span className="relative z-10 flex items-center justify-center space-x-2">
                    {icon && <span>{icon}</span>}
                    <span>{children}</span>
                </span>
                <div className={`absolute inset-0 dark:bg-gray-800 rounded-lg z-0 ${primaryDarkOutlineClasses}`}>
                    <span className="dark:hidden"></span>
                </div>
            </button>
        );
    }

    return (
        <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
            {icon && <span>{icon}</span>}
            <span>{children}</span>
        </button>
    );
};

export default Button;