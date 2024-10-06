import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" {...props}>{children}</button>
);