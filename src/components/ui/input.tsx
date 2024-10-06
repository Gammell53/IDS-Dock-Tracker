import React from 'react';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input className="w-full p-2 border rounded" {...props} />
);