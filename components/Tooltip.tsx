import React, { ReactNode } from 'react';

interface TooltipProps {
    message: string;
    children: ReactNode;
}

export default function Tooltip({ message, children }: TooltipProps) {
    return (
        <div className="group relative flex">
            {children}
            <span className="absolute bottom-10 scale-0 transition-all rounded bg-gray-800 p-2 text-xs text-white group-hover:scale-100">
                {message}
            </span>
        </div>
    );
}
