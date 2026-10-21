import React from 'react';

interface ErrorNotificationProps {
  message: string;
  onClose: () => void;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({ message, onClose }) => {
  return (
    <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-md shadow-lg flex items-center gap-4 z-50">
      <span>{message}</span>
      <button onClick={onClose} className="text-white hover:text-gray-200 font-bold">
        ✕
      </button>
    </div>
  );
};
