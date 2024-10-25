'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PlaneLanding, PlaneIcon, AlertTriangle, Snowflake, Loader, RefreshCw, Eye } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

type DockStatus = 'available' | 'occupied' | 'out-of-service' | 'deiced'
type DockLocation = 'southeast' | 'southwest'

interface Dock {
  id: number
  location: DockLocation
  number: number
  name: string
  status: DockStatus
}

// Update the southwest dock names array
const southwestDockNames = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99']

// Use an environment variable for the API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://idsdock.com/api';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://idsdock.com/ws';
const STALE_DATA_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

// Define WebSocket message interfaces
interface FullSyncMessage {
  type: 'full_sync';
  docks: Dock[];
  timestamp: number;
}

interface DockUpdateMessage {
  type: 'dock_updated';
  data: Dock;
  timestamp: number;
}

type WebSocketMessage = FullSyncMessage | DockUpdateMessage;

// Add these theme constants at the top of the file
const THEME = {
  primary: {
    gradient: 'from-blue-600 to-indigo-600',
    hover: 'from-blue-700 to-indigo-700',
  },
  card: {
    base: 'bg-white/5 backdrop-blur-lg border border-white/10',
    hover: 'hover:border-blue-500/50 hover:bg-white/10',
  },
  status: {
    available: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      icon: 'text-emerald-500',
    },
    occupied: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
      icon: 'text-amber-500',
    },
    'out-of-service': {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
      icon: 'text-rose-500',
    },
    deiced: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/20',
      icon: 'text-sky-500',
    },
  },
};

// Move these type definitions outside the component
interface MonitoredDock extends Dock {
  isMonitored: boolean;
}

export default function DockTracker() {
  // Add the monitor mode states here with the other state declarations
  const [docks, setDocks] = useState<Dock[]>([])
  const [activeTab, setActiveTab] = useState<DockLocation>('southwest')
  const [statusFilter, setStatusFilter] = useState<DockStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMonitorMode, setIsMonitorMode] = useState(false)
  const [monitoredDockIds, setMonitoredDockIds] = useState<Set<number>>(new Set())
  // Add this line for tracking recently changed docks
  const [recentlyChanged, setRecentlyChanged] = useState<Set<number>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncTimestampRef = useRef<number>(0)
  const { logout } = useAuth()

  console.log('DockTracker rendering, loading:', loading, 'docks:', docks);

  const fetchDocks = useCallback(async () => {
    try {
      console.log('[fetchDocks] Fetching docks...')
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('No token found')
      }
      const response = await fetch(`${API_URL}/docks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch docks')
      }
      const data = await response.json()
      setDocks(data.map((dock: Dock) => ({...dock, name: getDockName(dock)})))
      setError(null) // Clear any previous errors
      setLoading(false)
    } catch (error) {
      console.error('[fetchDocks] Error fetching docks:', error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('An unknown error occurred')
      }
      setLoading(false)
    }
  }, [])

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);

        if (data.type === 'dock_updated') {
            // Check timestamp first
            if (data.timestamp <= lastSyncTimestampRef.current) {
                console.log('Ignoring outdated update');
                return;
            }
            
            // Update timestamp
            lastSyncTimestampRef.current = data.timestamp;
            
            // Update docks and trigger animation atomically
            const updatedDock = { ...data.data, name: getDockName(data.data) };
            
            setDocks(prevDocks => 
                prevDocks.map(dock => 
                    dock.id === updatedDock.id ? updatedDock : dock
                )
            );
            
            // Set animation after confirming the update
            setRecentlyChanged(prev => new Set(prev).add(data.data.id));
            
        } else if (data.type === 'full_sync') {
            if (data.timestamp > lastSyncTimestampRef.current) {
                lastSyncTimestampRef.current = data.timestamp;
                setDocks(data.docks.map((dock: Dock) => ({...dock, name: getDockName(dock)})));
            }
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "request_full_sync" }));
        }
    }
  }, []);

  const setupWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket connection already open');
        return;
    }

    console.log('Setting up new WebSocket connection');
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connection opened');
        // Request immediate sync on connection
        ws.send(JSON.stringify({ type: "request_full_sync" }));
        // Clear any pending reconnect timeouts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        // Attempt immediate reconnect
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(setupWebSocket, 1000);
        // Also fetch latest data via HTTP
        fetchDocks();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
    };

    wsRef.current = ws;
}, [handleWebSocketMessage, fetchDocks]);

  useEffect(() => {
    fetchDocks()
    setupWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [fetchDocks, setupWebSocket])

  const checkDataFreshness = useCallback(() => {
    const now = Date.now();
    if (now - lastSyncTimestampRef.current > STALE_DATA_THRESHOLD) {
      console.log('Data is stale, requesting full sync');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "request_full_sync" }));
      } else {
        console.log('WebSocket not connected, fetching docks via API');
        fetchDocks();
      }
    }
  }, [fetchDocks]);

  useEffect(() => {
    console.log('Setting up WebSocket connection');
    setupWebSocket();
    fetchDocks(); // Initial fetch of docks

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page became visible, checking WebSocket connection and data freshness');
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('WebSocket not connected, reconnecting...');
          setupWebSocket();
        }
        checkDataFreshness();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Ping the server every 30 seconds to keep the connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
      checkDataFreshness();
    }, 30000);

    return () => {
      console.log('Cleaning up WebSocket connection');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(pingInterval);
    };
  }, [setupWebSocket, checkDataFreshness, fetchDocks]);

  const updateDockStatus = async (dockId: number, newStatus: DockStatus) => {
    // Find the previous status
    const previousDock = docks.find(dock => dock.id === dockId);
    if (!previousDock) {
      console.error('Dock not found');
      return;
    }
    const previousStatus = previousDock.status;

    // Optimistically update local state
    setDocks((prevDocks) =>
      prevDocks.map((dock) =>
        dock.id === dockId ? { ...dock, status: newStatus } : dock
      )
    );

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/docks/${dockId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Include the Authorization header
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update dock status');
      }
    } catch (error) {
      console.error('Error updating dock status:', error);

      // Revert to previous state
      setDocks((prevDocks) =>
        prevDocks.map((dock) =>
          dock.id === dockId ? { ...dock, status: previousStatus } : dock
        )
      );

      // Notify user of the error
      setError('Failed to update dock status. Please try again.');
    }
  };

  const filteredDocks = useMemo(() => {
    let filtered = docks.filter(dock => dock.location === activeTab)
    if (statusFilter) {
      filtered = filtered.filter(dock => dock.status === statusFilter)
    }
    if (isMonitorMode) {
      filtered = filtered.filter(dock => monitoredDockIds.has(dock.id))
    }
    return filtered
  }, [docks, activeTab, statusFilter, isMonitorMode, monitoredDockIds])

  const statusCounts = useMemo(() => {
    const counts = docks
      .filter(dock => dock.location === activeTab)
      .reduce((acc, dock) => {
        acc[dock.status]++
        return acc
      }, { available: 0, occupied: 0, 'out-of-service': 0, deiced: 0 } as Record<DockStatus, number>)
    
    return counts
  }, [docks, activeTab])

  const getStatusIcon = (status: DockStatus, dockId: number) => {
    const baseClasses = "transition-all duration-300 transform hover:scale-110"
    const isRecent = recentlyChanged.has(dockId)
    const animationClass = isRecent ? "animate-pulse" : ""
    const statusTheme = THEME.status[status]

    if (isRecent) {
      setTimeout(() => {
        setRecentlyChanged(prev => {
          const next = new Set(prev)
          next.delete(dockId)
          return next
        })
      }, 1000)
    }

    switch (status) {
      case 'available':
        return (
          <div className="relative group">
            <PlaneLanding className={`${baseClasses} ${animationClass} h-8 w-8 ${statusTheme.icon}`} />
            <span className="absolute hidden group-hover:block -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              Available
            </span>
          </div>
        )
      case 'occupied':
        return (
          <div className="relative group">
            <PlaneIcon className={`${baseClasses} ${animationClass} h-8 w-8 ${statusTheme.icon}`} />
            <span className="absolute hidden group-hover:block -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              Occupied
            </span>
          </div>
        )
      case 'out-of-service':
        return (
          <div className="relative group">
            <AlertTriangle className={`${baseClasses} ${animationClass} h-8 w-8 ${statusTheme.icon}`} />
            <span className="absolute hidden group-hover:block -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              Out of Service
            </span>
          </div>
        )
      case 'deiced':
        return (
          <div className="relative group">
            <Snowflake className={`${baseClasses} ${animationClass} h-8 w-8 ${statusTheme.icon}`} />
            <span className="absolute hidden group-hover:block -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              Deiced
            </span>
          </div>
        )
    }
  }

  const handleStatusClick = (status: DockStatus) => {
    setStatusFilter(prevStatus => prevStatus === status ? null : status)
  }

  // Update the toggleDockMonitoring function to remove the 3-dock limit
  const toggleDockMonitoring = useCallback((dockId: number) => {
    setMonitoredDockIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dockId)) {
        newSet.delete(dockId);
      } else {
        newSet.add(dockId);
      }
      return newSet;
    });
  }, []);

  if (loading) {
    console.log('Rendering loading state');
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-12 w-12 text-white" />
        <p className="ml-2 text-white">Loading docks...</p>
      </div>
    );
  }

  if (error && docks.length === 0) {
    console.log('Rendering error state');
    return (
      <div className="bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-6 text-center">
        <p className="text-red-500 font-semibold text-xl mb-4">{error}</p>
        <button 
          onClick={fetchDocks} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (docks.length === 0) {
    console.log('No docks found');
    return (
      <div className="bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-6 text-center">
        <p className="text-yellow-500 font-semibold text-xl mb-4">No docks found.</p>
        <button 
          onClick={fetchDocks} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Professional Header */}
      <header className="bg-black/20 backdrop-blur-lg border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg">
                <PlaneLanding className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                IDS Dock Tracker
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {isMonitorMode ? (
                <button
                  onClick={() => setMonitoredDockIds(new Set())}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200"
                >
                  Clear All
                </button>
              ) : (
                <button
                  onClick={() => setMonitoredDockIds(new Set(docks.filter(d => d.location === activeTab).map(d => d.id)))}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200"
                >
                  Monitor All
                </button>
              )}
              <button
                onClick={() => setIsMonitorMode(!isMonitorMode)}
                className={`px-4 py-2 rounded-lg transition-all duration-200 font-medium shadow-lg
                  ${isMonitorMode 
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/20' 
                    : 'bg-gray-600 hover:bg-gray-700 text-white shadow-gray-500/20'}`}
              >
                {isMonitorMode ? 'Exit Monitor Mode' : 'Monitor Mode'}
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all duration-200 font-medium shadow-lg shadow-blue-500/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Location Selector */}
        <div className={`${THEME.card.base} rounded-xl p-6 mb-8`}>
          <h2 className="text-xl font-semibold text-white mb-4">Select Terminal</h2>
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value as DockLocation)}
            className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white 
              focus:border-blue-500 focus:ring-blue-500 transition-all duration-200
              hover:border-blue-400"
          >
            <option value="southwest" className="bg-gray-800 text-white hover:bg-gray-700">
              Southwest Terminal
            </option>
            <option value="southeast" className="bg-gray-800 text-white hover:bg-gray-700">
              Southeast Terminal
            </option>
          </select>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {Object.entries(statusCounts).map(([status, count]) => {
            const statusTheme = THEME.status[status as DockStatus];
            return (
              <div 
                key={status} 
                className={`${THEME.card.base} ${THEME.card.hover} ${statusTheme.bg} rounded-xl p-6 cursor-pointer transition-all duration-300
                  ${statusFilter === status ? 'ring-2 ring-blue-500 shadow-lg scale-105' : ''}`}
                onClick={() => handleStatusClick(status as DockStatus)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium uppercase tracking-wider ${statusTheme.text}`}>
                      {status}
                    </p>
                    <p className="text-3xl font-bold text-white mt-1">{count}</p>
                  </div>
                  {getStatusIcon(status as DockStatus, -1)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dock Status Grid */}
        <div className={`${THEME.card.base} rounded-xl p-6`}>
          <h2 className="text-xl font-semibold text-white mb-6">Dock Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {filteredDocks.map(dock => {
              const statusTheme = THEME.status[dock.status];
              return (
                <div 
                  key={dock.id} 
                  className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50"
                >
                  {/* Status Indicator Strip */}
                  <div className={`absolute top-0 left-0 w-full h-1 ${statusTheme.bg}`} />
                  
                  {/* Card Content */}
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">{dock.name}</h3>
                        <span className={`text-sm font-medium ${statusTheme.text} mt-1 block`}>
                          {dock.status.charAt(0).toUpperCase() + dock.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!isMonitorMode && (
                          <button
                            onClick={() => toggleDockMonitoring(dock.id)}
                            className={`p-2 rounded-lg transition-all duration-200
                              ${monitoredDockIds.has(dock.id)
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                        )}
                        <div className={`p-2 rounded-lg ${statusTheme.bg} ${statusTheme.border}`}>
                          {getStatusIcon(dock.status, dock.id)}
                        </div>
                      </div>
                    </div>

                    {/* Status Selector */}
                    <div className="relative">
                      <select 
                        value={dock.status}
                        onChange={(e) => updateDockStatus(dock.id, e.target.value as DockStatus)}
                        className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white 
                          focus:border-blue-500 focus:ring-blue-500 transition-all duration-200
                          hover:border-blue-400 appearance-none cursor-pointer"
                      >
                        <option value="available" className="bg-gray-800 text-white">Available</option>
                        <option value="occupied" className="bg-gray-800 text-white">Occupied</option>
                        <option value="out-of-service" className="bg-gray-800 text-white">Out of Service</option>
                        <option value="deiced" className="bg-gray-800 text-white">Deiced</option>
                      </select>
                      {/* Custom dropdown arrow */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
      {isMonitorMode && (
        <div className="mb-8 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-green-400">Monitoring Mode Active</h3>
              <p className="text-sm text-green-300/70">
                Showing {monitoredDockIds.size} monitored dock{monitoredDockIds.size !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setIsMonitorMode(false)}
              className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200"
            >
              Exit Monitoring
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Update the getDockName function to handle the new names
function getDockName(dock: Dock) {
  if (dock.location === 'southwest') {
    return southwestDockNames[dock.number - 1] || `Unknown SW Dock ${dock.number}`
  }
  return `Dock ${dock.number}`
}
