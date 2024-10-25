'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PlaneLanding } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      console.log('Attempting login with:', { username, password });
      console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.message || 'Invalid credentials');
      }

      if (data.success) {
        console.log('Login successful, setting token');
        await login(data.token);
      } else {
        throw new Error(data.message || 'Login failed');
      }
      
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to login. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-full max-w-md p-8 space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl shadow-xl">
              <PlaneLanding className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
            IDS Dock Tracker
          </h1>
          <p className="text-gray-400">
            Sign in to manage dock status
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg">
              <p className="text-rose-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white 
                  focus:border-blue-500 focus:ring-blue-500 transition-all duration-200
                  hover:border-blue-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white 
                  focus:border-blue-500 focus:ring-blue-500 transition-all duration-200
                  hover:border-blue-400"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 
                hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg 
                transition-all duration-200 font-medium shadow-lg shadow-blue-500/20
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
                focus:ring-offset-gray-900"
            >
              Sign In
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500">
          Secure access for authorized personnel only
        </p>
      </div>
    </div>
  );
}
