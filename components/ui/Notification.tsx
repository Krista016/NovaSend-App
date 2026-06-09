import React, { useEffect, useState } from 'react';
import { Notification } from '../../types';

interface NotificationProps {
    notification: Notification | null;
}

const NotificationComponent: React.FC<NotificationProps> = ({ notification }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (notification) {
            setVisible(true);
            const timer = setTimeout(() => setVisible(false), 3500); // Start fade out before it's removed
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [notification]);

    if (!notification) return null;
    
    // Using darker, more subtle 700-level colors as requested
    const baseStyles = {
        success: 'bg-green-700 text-white',
        warning: 'bg-amber-700 text-white',
        error: 'bg-red-700 text-white',
        info: 'bg-sky-700 text-white',
    };

    const typeTitle = {
        success: 'Success',
        warning: 'Warning',
        error: 'Alert',
        info: 'Info'
    }

    return (
        <div
            // Key forces re-mount and re-triggers animation if a new notification appears while one is visible
            key={notification.message + Date.now()}
            className={`w-full rounded-lg shadow-lg overflow-hidden transform transition-all duration-300 ease-in-out ${baseStyles[notification.type]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
            role="alert"
        >
            <div className="p-4">
                <p className="font-bold">{typeTitle[notification.type]}</p>
                <p>{notification.message}</p>
            </div>
        </div>
    );
};

export default NotificationComponent;