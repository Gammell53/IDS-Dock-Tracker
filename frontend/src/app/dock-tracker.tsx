'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PlaneLanding, PlaneIcon, AlertTriangle, Snowflake, Loader, RefreshCw, Eye } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'

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

// First, let's type the theme properly
type ThemeType = 'light' | 'dark';

interface ThemeConfig {
  light: {
    background: string;
    header: string;
    surface: {
      primary: string;
      secondary: string;
    };
    text: {
      primary: string;
      secondary: string;
    };
    status: {
      [key in DockStatus]: {
        bg: string;
        text: string;
        border: string;
      };
    };
    input: {
      bg: string;
      border: string;
      text: string;
    };
    monitor: {
      bg: string;
      text: string;
      subtext: string;
      button: string;
    };
  };
  dark: {
    // Same structure as light
    background: string;
    header: string;
    surface: {
      primary: string;
      secondary: string;
    };
    text: {
      primary: string;
      secondary: string;
    };
    status: {
      [key in DockStatus]: {
        bg: string;
        text: string;
        border: string;
      };
    };
    input: {
      bg: string;
      border: string;
      text: string;
    };
    monitor: {
      bg: string;
      text: string;
      subtext: string;
      button: string;
    };
  };
}

// Type the THEME constant
const THEME: ThemeConfig = {
  light: {
    background: 'bg-gray-100',  // Darker background
    header: 'bg-white border-gray-200',
    surface: {
      primary: 'bg-white border border-gray-300',  // Darker border
      secondary: 'bg-gray-50 border border-gray-200',
    },
    text: {
      primary: 'text-gray-900',  // Already dark
      secondary: 'text-gray-600',  // Darker secondary text
    },
    status: {
      available: {
        bg: 'bg-emerald-100',  // Slightly darker green
        text: 'text-emerald-800',  // Darker text
        border: 'border-emerald-200',
      },
      occupied: {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border-amber-200',
      },
      'out-of-service': {
        bg: 'bg-red-100',
        text: 'text-red-800',
        border: 'border-red-200',
      },
      deiced: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        border: 'border-blue-200',
      },
    },
    input: {
      bg: 'bg-gray-50',  // Slightly darker input background
      border: 'border-gray-300',  // Darker border
      text: 'text-gray-900',
    },
    monitor: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
      subtext: 'text-emerald-700',
      button: 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800',
    },
  },
  dark: {
    // Dark theme remains unchanged
    background: 'bg-gray-900',
    header: 'bg-gray-800 border-gray-700',
    surface: {
      primary: 'bg-gray-800 border border-gray-700',
      secondary: 'bg-gray-800/50 border border-gray-700',
    },
    text: {
      primary: 'text-white',
      secondary: 'text-gray-400',
    },
    status: {
      available: {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
      },
      occupied: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
      },
      'out-of-service': {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
      },
      deiced: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
      },
    },
    input: {
      bg: 'bg-gray-700',
      border: 'border-gray-600',
      text: 'text-white',
    },
    monitor: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      subtext: 'text-emerald-300/70',
      button: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400',
    },
  },
};

// Move these type definitions outside the component
interface MonitoredDock extends Dock {
  isMonitored: boolean;
}

export default function DockTracker() {
  const { theme, toggleTheme } = useTheme()
  const [docks, setDocks] = useState<Dock[]>([])
  const [activeTab, setActiveTab] = useState<DockLocation>('southwest')
  const [statusFilter, setStatusFilter] = useState<DockStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMonitorMode, setIsMonitorMode] = useState(false)
  const [monitoredDockIds, setMonitoredDockIds] = useState<Set<number>>(new Set())
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
            
            // Update docks and trigger animation
            const updatedDock = { ...data.data, name: getDockName(data.data) };
            
            setDocks(prevDocks => 
                prevDocks.map(dock => 
                    dock.id === updatedDock.id ? updatedDock : dock
                )
            );
            
            // Set animation and play a subtle sound if available
            setRecentlyChanged(prev => new Set(prev).add(updatedDock.id));
            
            // Optional: Play a subtle sound effect
            try {
              const audio = new Audio('/status-change.mp3'); // You'll need to add this sound file
              audio.volume = 0.2;
              audio.play();
            } catch (error) {
              console.log('Sound not available');
            }
            
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
    const baseClasses = "transition-all duration-300 transform"
    const isRecent = recentlyChanged.has(dockId)
    const animationClass = isRecent ? "animate-bounce" : "hover:scale-110"
    const statusTheme = THEME[theme].status[status]

    if (isRecent) {
      setTimeout(() => {
        setRecentlyChanged(prev => {
          const next = new Set(prev)
          next.delete(dockId)
          return next
        })
      }, 2000)
    }

    const iconClasses = `${baseClasses} ${animationClass} h-8 w-8 ${statusTheme.text}`

    const tooltipClasses = `
      absolute invisible group-hover:visible
      -top-12 left-1/2 -translate-x-1/2
      px-3 py-1.5 rounded-md
      bg-gray-900 text-white text-xs
      whitespace-nowrap
      shadow-lg
      z-50
      opacity-0 group-hover:opacity-100
      transition-opacity duration-200
    `

    const icons = {
      available: (
        <div className="relative group cursor-help">
          <PlaneLanding className={iconClasses} />
          <div className={tooltipClasses}>
            Available for Docking
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
              border-t-4 border-x-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ),
      occupied: (
        <div className="relative group cursor-help">
          <PlaneIcon className={iconClasses} />
          <div className={tooltipClasses}>
            Currently Occupied
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
              border-t-4 border-x-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ),
      'out-of-service': (
        <div className="relative group cursor-help">
          <AlertTriangle className={iconClasses} />
          <div className={tooltipClasses}>
            Out of Service
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
              border-t-4 border-x-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ),
      deiced: (
        <div className="relative group cursor-help">
          <Snowflake className={iconClasses} />
          <div className={tooltipClasses}>
            Deiced and Ready
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
              border-t-4 border-x-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ),
    }

    return icons[status]
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
    <div className={`min-h-screen ${THEME[theme].background}`} role="application">
      {/* Accessible Header */}
      <header 
        className={`${THEME[theme].header} backdrop-blur-lg border-b sticky top-0 z-50`}
        role="banner"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div 
                className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg"
                aria-hidden="true" // Hide decorative icon from screen readers
              >
                <PlaneLanding className="h-6 w-6 text-white" />
              </div>
              <h1 className={`text-2xl font-bold ${THEME[theme].text.primary}`}>
                IDS Dock Tracker
              </h1>
            </div>
            <div className="flex items-center space-x-4" role="toolbar" aria-label="Main controls">
              {isMonitorMode ? (
                <button
                  onClick={() => setMonitoredDockIds(new Set())}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200"
                  aria-label="Clear all monitored docks"
                >
                  Clear All
                </button>
              ) : (
                <button
                  onClick={() => setMonitoredDockIds(new Set(docks.filter(d => d.location === activeTab).map(d => d.id)))}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-200"
                  aria-label="Monitor all docks in current terminal"
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
                aria-pressed={isMonitorMode}
                aria-label={`${isMonitorMode ? 'Exit' : 'Enter'} monitor mode`}
              >
                {isMonitorMode ? 'Exit Monitor Mode' : 'Monitor Mode'}
              </button>
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition-all duration-200`}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                aria-pressed={theme === 'dark'}
              >
                <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all duration-200 font-medium shadow-lg shadow-blue-500/20"
                aria-label="Logout from application"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with ARIA landmarks */}
      <main 
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        role="main"
      >
        {/* Location Selector with improved accessibility */}
        <div 
          className={`${THEME[theme].surface.primary} rounded-lg p-4 mb-8`}
          role="region"
          aria-label="Terminal selection"
        >
          <h2 className={`text-xl font-semibold ${THEME[theme].text.primary} mb-4`}>
            Select Terminal
          </h2>
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value as DockLocation)}
            className={`w-full p-2 rounded
              ${THEME[theme].input.bg} 
              ${THEME[theme].input.border}
              ${THEME[theme].input.text}
              border transition-colors focus:ring-2 focus:ring-blue-500`}
            aria-label="Select terminal location"
          >
            <option value="southwest">Southwest Terminal</option>
            <option value="southeast">Southeast Terminal</option>
          </select>
        </div>

        {/* Status Overview with improved accessibility */}
        <div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          role="region"
          aria-label="Dock status overview"
        >
          {Object.entries(statusCounts).map(([status, count]) => {
            const statusTheme = THEME[theme].status[status as DockStatus];
            return (
              <button 
                key={status} 
                className={`${THEME[theme].surface.primary} ${statusTheme.bg} 
                  rounded-lg p-4 cursor-pointer transition-all duration-200
                  ${statusFilter === status ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => handleStatusClick(status as DockStatus)}
                aria-pressed={statusFilter === status}
                aria-label={`Filter by ${status.replace('-', ' ')} status: ${count} docks`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium uppercase tracking-wider ${statusTheme.text}`}>
                      {status.replace('-', ' ')}
                    </p>
                    <p className={`text-3xl font-bold ${THEME[theme].text.primary}`}>
                      {count}
                    </p>
                  </div>
                  <div aria-hidden="true">
                    {getStatusIcon(status as DockStatus, -1)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Dock Status Grid with improved accessibility */}
        <div 
          className={`${THEME[theme].surface.primary} rounded-lg p-6`}
          role="region"
          aria-label="Dock status management"
        >
          <h2 className={`text-xl font-semibold ${THEME[theme].text.primary} mb-6`}>
            Dock Status
          </h2>
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
            role="list"
          >
            {filteredDocks.map(dock => {
              const statusTheme = THEME[theme].status[dock.status];
              return (
                <div
                  key={dock.id}
                  className={`${THEME[theme].surface.secondary} rounded-lg overflow-hidden`}
                  role="listitem"
                >
                  <div className={`${statusTheme.bg} p-4 flex flex-col items-center space-y-2`}>
                    {/* Status Icon */}
                    <div className="transform-gpu">
                      {getStatusIcon(dock.status, dock.id)}
                    </div>
                    {/* Dock Name and Monitor Button */}
                    <div className="flex items-center justify-between w-full">
                      <span className={`font-medium ${statusTheme.text} text-lg`}>
                        {dock.name}
                      </span>
                      {!isMonitorMode && (
                        <button
                          onClick={() => toggleDockMonitoring(dock.id)}
                          className={`p-1.5 rounded-full transition-colors
                            ${monitoredDockIds.has(dock.id) 
                              ? THEME[theme].monitor.button
                              : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                          aria-label={`${monitoredDockIds.has(dock.id) ? 'Stop monitoring' : 'Start monitoring'} dock ${dock.name}`}
                          aria-pressed={monitoredDockIds.has(dock.id)}
                        >
                          <Eye 
                            className={`h-4 w-4 ${monitoredDockIds.has(dock.id) 
                              ? THEME[theme].monitor.text 
                              : THEME[theme].text.secondary}`} 
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <label 
                      htmlFor={`dock-status-${dock.id}`}
                      className="sr-only"
                    >
                      Change status for dock {dock.name}
                    </label>
                    <select 
                      id={`dock-status-${dock.id}`}
                      value={dock.status}
                      onChange={(e) => updateDockStatus(dock.id, e.target.value as DockStatus)}
                      className={`w-full p-2 rounded
                        ${THEME[theme].input.bg} 
                        ${THEME[theme].input.border}
                        ${THEME[theme].input.text}
                        border transition-colors focus:ring-2 focus:ring-blue-500`}
                    >
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="out-of-service">Out of Service</option>
                      <option value="deiced">Deiced</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Monitor Mode Banner with improved accessibility */}
      {isMonitorMode && (
        <div 
          className="fixed bottom-4 left-4 right-4 z-50"
          role="status"
          aria-live="polite"
        >
          <div className={`max-w-xl mx-auto ${THEME[theme].surface.primary} 
            rounded-lg shadow-lg p-4 border border-emerald-200 dark:border-emerald-500/20`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${THEME[theme].monitor.bg}`} aria-hidden="true">
                  <Eye className={`h-5 w-5 ${THEME[theme].monitor.text}`} />
                </div>
                <div>
                  <h3 className={`font-medium ${THEME[theme].monitor.text}`}>
                    Monitor Mode Active
                  </h3>
                  <p className={THEME[theme].monitor.subtext}>
                    Monitoring {monitoredDockIds.size} dock{monitoredDockIds.size !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMonitorMode(false)}
                className={`px-4 py-2 rounded-lg ${THEME[theme].monitor.button}`}
                aria-label="Exit monitor mode"
              >
                Exit Monitor Mode
              </button>
            </div>
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
