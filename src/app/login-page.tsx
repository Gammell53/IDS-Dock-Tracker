'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader, Lock } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: username,
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        router.push('/');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Invalid username or password');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-gray-800 shadow-2xl rounded-2xl p-8 border border-gray-700">
          <div className="flex justify-center mb-8">
            <span className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 p-3 shadow-lg">
              <Lock className="h-8 w-8 text-white" />
            </span>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-white mb-6">
            Login to IDS DFW
          </h2>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-400 text-white bg-gray-700 rounded-t-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition duration-150 ease-in-out"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-600 placeholder-gray-400 text-white bg-gray-700 rounded-b-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition duration-150 ease-in-out"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-900/30 py-2 px-3 rounded-md">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
              >
                {loading ? (
                  <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                ) : null}
                {loading ? 'Logging in...' : 'Sign in'}
              </button>
            </div>
          </form>
          <div className="mt-6 text-sm text-center text-gray-400">
            Secure access for IDS DFW personnel only
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;