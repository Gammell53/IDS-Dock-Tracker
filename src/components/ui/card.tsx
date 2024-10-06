import React from 'react';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div className="bg-white shadow-md rounded-lg p-6" {...props}>{children}</div>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div className="mt-4" {...props}>{children}</div>
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div className="mb-4" {...props}>{children}</div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, ...props }) => (
  <h2 className="text-2xl font-bold" {...props}>{children}</h2>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div className="mt-6" {...props}>{children}</div>
);
