import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { AuthProvider } from '@/context/AuthContext'
import { Plane } from 'lucide-react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Airport Dock Tracker',
  description: 'Track and manage airport docks',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-900 text-white`}>
        <AuthProvider>
          <nav className="bg-gray-800 shadow-md">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-3">
                  <Plane className="h-8 w-8 text-indigo-500" />
                  <span className="text-xl font-bold text-white">Airport Dock Tracker</span>
                </Link>
                <div className="flex items-center space-x-4">
                  <Link href="/" className="text-gray-300 hover:text-white hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200">
                    Dock Tracker
                  </Link>
                  <Link href="/login" className="text-gray-300 hover:text-white hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200">
                    Login
                  </Link>
                </div>
              </div>
            </div>
          </nav>
          <main className="container mx-auto p-4">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
