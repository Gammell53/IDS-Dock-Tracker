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

// Update the southwest dock names array to match all 16 docks
const southwestDockNames = [
  'H84', 'H85X', 'H86', 'H87', 'H88X', 'H89', 'H90', 'H91X',
  'H92', 'H93', 'H94X', 'H95', 'H96', 'H97X', 'H98', 'H99'
];

// Update these constants to match your nginx configuration
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
    background: 'bg-gray-100',
    header: 'bg-white border-gray-200',
    surface: {
      primary: 'bg-white border border-gray-300 shadow-sm',
      secondary: 'bg-gray-50 border border-gray-200',
    },
    text: {
      primary: 'text-gray-900',
      secondary: 'text-gray-600',
    },
    status: {
      available: {
        bg: 'bg-emerald-50 hover:bg-emerald-100',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      },
      occupied: {
        bg: 'bg-amber-50 hover:bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-200',
      },
      'out-of-service': {
        bg: 'bg-red-50 hover:bg-red-100',
        text: 'text-red-700',
        border: 'border-red-200',
      },
      deiced: {
        bg: 'bg-blue-50 hover:bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-200',
      },
    },
    input: {
      bg: 'bg-white',
      border: 'border-gray-300 focus:border-blue-500',
      text: 'text-gray-900',
    },
    monitor: {
      bg: 'bg-cyan-50',
      text: 'text-cyan-500',
      subtext: 'text-cyan-600',
      button: 'bg-cyan-500 hover:bg-cyan-600 text-white',
    },
  },
  dark: {
    background: 'bg-gray-900',
    header: 'bg-gray-800/80 backdrop-blur-sm border-gray-700',
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
        bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
      },
      occupied: {
        bg: 'bg-amber-500/10 hover:bg-amber-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
      },
      'out-of-service': {
        bg: 'bg-red-500/10 hover:bg-red-500/20',
        text: 'text-red-400',
        border: 'border-red-500/20',
      },
      deiced: {
        bg: 'bg-blue-500/10 hover:bg-blue-500/20',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
      },
    },
    input: {
      bg: 'bg-gray-700',
      border: 'border-gray-600 focus:border-blue-500',
      text: 'text-white',
    },
    monitor: {
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-400',
      subtext: 'text-cyan-400/70',
      button: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400',
    },
  },
};

// Move these type definitions outside the component
interface MonitoredDock extends Dock {
  isMonitored: boolean;
}

// Add these interfaces and helper functions near the top of the file
interface XDockConfig {
  xDockId: number;
  adjacentDockIds: number[];
}

// Define the X dock configurations
const xDockConfigs: XDockConfig[] = [
  // Southwest Terminal X docks (IDs 1-16)
  { xDockId: 2, adjacentDockIds: [1, 3] },     // H85X
  { xDockId: 5, adjacentDockIds: [4, 6] },     // H88X
  { xDockId: 8, adjacentDockIds: [7, 9] },     // H91X
  { xDockId: 11, adjacentDockIds: [10, 12] },  // H94X
  { xDockId: 14, adjacentDockIds: [13, 15] },  // H97X
  
  // Southeast Terminal X docks (IDs 17-30)
  { xDockId: 25, adjacentDockIds: [24, 26] },  // Q91X
  { xDockId: 28, adjacentDockIds: [27, 29] },  // Q88X
  { xDockId: 30, adjacentDockIds: [29] },      // Q86X
];

// Add this function to check if a dock should be hidden due to X dock absorption
const isDockAbsorbed = (dock: Dock, allDocks: Dock[]): boolean => {
  // Find if this dock is adjacent to any X dock
  const xConfig = xDockConfigs.find(config => 
    config.adjacentDockIds.includes(dock.id)
  );

  if (!xConfig) return false;

  // Find the X dock that could absorb this dock
  const xDock = allDocks.find(d => d.id === xConfig.xDockId);
  
  // If the X dock exists and is not available, this dock should be absorbed
  return xDock ? xDock.status !== 'available' : false;
};

// Add this function to get the display status for a dock
const getEffectiveStatus = (dock: Dock, allDocks: Dock[]): DockStatus => {
  // If this is an X dock, return its actual status
  if (dock.name.includes('X')) {
    return dock.status;
  }

  // Find if this dock is adjacent to any X dock
  const xConfig = xDockConfigs.find(config => 
    config.adjacentDockIds.includes(dock.id)
  );

  if (!xConfig) return dock.status;

  // Find the X dock that could affect this dock
  const xDock = allDocks.find(d => d.id === xConfig.xDockId);
  
  // If the X dock is not available, this dock inherits its status
  if (xDock && xDock.status !== 'available') {
    return xDock.status;
  }

  return dock.status;
};

// Add this helper function to get absorbed dock names
const getAbsorbedDockNames = (dock: Dock, allDocks: Dock[]): string[] => {
  // Only process X docks
  if (!dock.name.includes('X')) return [];

  // Find the X dock config
  const xConfig = xDockConfigs.find(config => config.xDockId === dock.id);
  if (!xConfig) return [];

  // If dock is available, no absorption is happening
  if (dock.status === 'available') return [];

  // Get the names of absorbed docks
  return xConfig.adjacentDockIds
    .map(id => allDocks.find(d => d.id === id))
    .filter((d): d is Dock => d !== undefined)
    .map(d => d.name);
};

// Add this helper function to get all docks in an X dock group
const getXDockGroup = (dockId: number, allDocks: Dock[]): number[] => {
  // Check if this is an X dock
  const xConfig = xDockConfigs.find(config => config.xDockId === dockId);
  if (xConfig) {
    // Return the X dock and its adjacent docks
    return [xConfig.xDockId, ...xConfig.adjacentDockIds];
  }
  
  // Check if this is adjacent to an X dock
  const parentConfig = xDockConfigs.find(config => 
    config.adjacentDockIds.includes(dockId)
  );
  if (parentConfig) {
    // Return the X dock and its adjacent docks
    return [parentConfig.xDockId, ...parentConfig.adjacentDockIds];
  }
  
  // If not part of an X dock group, return just this dock
  return [dockId];
};

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
      console.log('[fetchDocks] Starting fetch...');
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('[fetchDocks] No token found');
        throw new Error('No token found');
      }

      console.log('[fetchDocks] API URL:', `${API_URL}/docks`);
      const response = await fetch(`${API_URL}/docks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[fetchDocks] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[fetchDocks] Response not OK:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(errorText || 'Failed to fetch docks');
      }

      const data = await response.json();
      console.log('[fetchDocks] Data received:', data);
      
      setDocks(data.map((dock: Dock) => ({...dock, name: getDockName(dock)})));
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      console.error('[fetchDocks] Error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(err instanceof Error ? err.message : 'Failed to fetch docks');
      setLoading(false);
    }
  }, []);

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);

        if (data.type === 'dock_updated') {
            setDocks(prevDocks => {
                // Find the dock that was updated
                const updatedDock = { ...data.data, name: getDockName(data.data) };
                
                // If this is an X dock, we need to handle its children
                const xConfig = xDockConfigs.find(config => config.xDockId === updatedDock.id);
                if (xConfig && updatedDock.status !== 'available') {
                    // Create a new array with all updates
                    return prevDocks.map(dock => {
                        if (dock.id === updatedDock.id) {
                            return updatedDock;
                        }
                        // Update adjacent docks to available if this is an X dock becoming unavailable
                        if (xConfig.adjacentDockIds.includes(dock.id)) {
                            return { ...dock, status: 'available' };
                        }
                        return dock;
                    });
                }
                
                // Regular dock update
                return prevDocks.map(dock => 
                    dock.id === updatedDock.id ? updatedDock : dock
                );
            });
            
            // Set animation
            setRecentlyChanged(prev => new Set(prev).add(data.data.id));
            
        } else if (data.type === 'full_sync') {
            // Update timestamp first
            lastSyncTimestampRef.current = data.timestamp;
            
            // Process the full sync data
            const processedDocks = data.docks.map((dock: Dock) => ({
                ...dock,
                name: getDockName(dock)
            }));

            // Handle X dock relationships in the full sync
            const finalDocks = processedDocks.map((dock: Dock) => {
                // If this is an X dock and it's not available
                const xConfig = xDockConfigs.find(config => config.xDockId === dock.id);
                if (xConfig && dock.status !== 'available') {
                    // Ensure its children are available
                    const childDocks = processedDocks.filter((d: Dock) => 
                        xConfig.adjacentDockIds.includes(d.id)
                    );
                    childDocks.forEach((childDock: Dock) => {
                        childDock.status = 'available';
                    });
                }
                return dock;
            });

            setDocks(finalDocks);
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
        // Request a full sync on error
        requestFullSync();
    }
}, []);

// Add a helper function to request full sync
const requestFullSync = useCallback(() => {
    console.log('Requesting full sync...');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "request_full_sync" }));
    } else {
        console.log('WebSocket not connected, fetching docks via API');
        fetchDocks();
    }
}, [fetchDocks]);

const setupWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket connection already open');
        return;
    }

    console.log('Setting up new WebSocket connection');
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connection opened');
        requestFullSync();
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        wsRef.current = null;
        // Attempt reconnect after a short delay
        reconnectTimeoutRef.current = setTimeout(setupWebSocket, 1000);
        // Fetch latest data via HTTP
        fetchDocks();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
    };

    wsRef.current = ws;
}, [handleWebSocketMessage, fetchDocks, requestFullSync]);

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
        requestFullSync();
    }
}, [requestFullSync]);

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

    // Check if this is an X dock
    const xConfig = xDockConfigs.find(config => config.xDockId === dockId);
    const isXDock = !!xConfig;

    // Get the adjacent dock IDs if this is an X dock
    const adjacentDockIds = xConfig?.adjacentDockIds || [];

    // Prepare all updates (X dock and its children if applicable)
    const updates: { id: number; status: DockStatus }[] = [
      { id: dockId, status: newStatus }
    ];

    // If this is an X dock and it's changing from available to non-available,
    // or from non-available to available, update the children
    if (isXDock && previousStatus !== newStatus) {
      if (newStatus !== 'available') {
        // When X dock becomes occupied/out-of-service/deiced, set children to available
        adjacentDockIds.forEach(childId => {
          updates.push({ id: childId, status: 'available' });
        });
      }
    }

    // Optimistically update local state for all changes
    setDocks((prevDocks) =>
      prevDocks.map((dock) => {
        const update = updates.find(u => u.id === dock.id);
        return update ? { ...dock, status: update.status } : dock;
      })
    );

    try {
      // Send all updates to the server
      const token = localStorage.getItem('token');
      
      // Send updates sequentially to maintain order
      for (const update of updates) {
        const response = await fetch(`${API_URL}/docks/${update.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: update.status }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update dock ${update.id} status`);
        }
      }
    } catch (error) {
      console.error('Error updating dock status:', error);

      // Revert all changes on error
      setDocks((prevDocks) =>
        prevDocks.map((dock) => {
          if (dock.id === dockId) {
            return { ...dock, status: previousStatus };
          }
          if (adjacentDockIds.includes(dock.id)) {
            // Find the original status of this dock
            const originalDock = docks.find(d => d.id === dock.id);
            return { ...dock, status: originalDock?.status || dock.status };
          }
          return dock;
        })
      );

      setError('Failed to update dock status. Please try again.');
    }
  };

  const filteredDocks = useMemo(() => {
    let filtered = docks.filter(dock => dock.location === activeTab);
    
    // Filter out absorbed docks unless they're X docks
    filtered = filtered.filter(dock => 
      dock.name.includes('X') || !isDockAbsorbed(dock, docks)
    );
    
    if (statusFilter) {
      filtered = filtered.filter(dock => getEffectiveStatus(dock, docks) === statusFilter);
    }
    
    if (isMonitorMode) {
      filtered = filtered.filter(dock => monitoredDockIds.has(dock.id));
    }
    
    return filtered;
  }, [docks, activeTab, statusFilter, isMonitorMode, monitoredDockIds]);

  const statusCounts = useMemo(() => {
    const counts = docks
      .filter(dock => dock.location === activeTab)
      .reduce((acc, dock) => {
        // Only count visible docks
        if (!isDockAbsorbed(dock, docks)) {
          acc[getEffectiveStatus(dock, docks)]++;
        }
        return acc;
      }, { available: 0, occupied: 0, 'out-of-service': 0, deiced: 0 } as Record<DockStatus, number>);
    
    return counts;
  }, [docks, activeTab]);

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

  // Update the toggleDockMonitoring function
  const toggleDockMonitoring = useCallback((dockId: number) => {
    const groupDockIds = getXDockGroup(dockId, docks);
    const isGroupMonitored = groupDockIds.some(id => monitoredDockIds.has(id));
    
    setMonitoredDockIds(prev => {
      const newSet = new Set(prev);
      if (isGroupMonitored) {
        // Remove all docks in the group
        groupDockIds.forEach(id => newSet.delete(id));
      } else {
        // Add all docks in the group
        groupDockIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  }, [docks, monitoredDockIds]);

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
          {/* Mobile layout - visible only on small screens */}
          <div className="sm:hidden flex flex-col space-y-4">
            {/* Logo and Title */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div 
                  className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg"
                  aria-hidden="true"
                >
                  <PlaneLanding className="h-6 w-6 text-white" />
                </div>
                <h1 className={`text-xl font-bold ${THEME[theme].text.primary}`}>
                  IDS Dock Tracker
                </h1>
              </div>
              {/* Theme and Logout in top row on mobile */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg transition-all duration-200"
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  aria-pressed={theme === 'dark'}
                >
                  <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
                </button>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all duration-200 font-medium"
                  aria-label="Logout from application"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Monitor Controls in second row on mobile */}
            <div className="flex items-center justify-between space-x-2">
              {isMonitorMode ? (
                <button
                  onClick={() => setIsMonitorMode(false)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium
                    bg-red-600 hover:bg-red-700 text-white`}
                  aria-pressed={isMonitorMode}
                  aria-label="Exit monitor mode"
                >
                  Exit Monitor Mode
                </button>
              ) : (
                <button
                  onClick={() => setIsMonitorMode(true)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium
                    bg-cyan-500 hover:bg-cyan-600 text-white`}
                  aria-pressed={isMonitorMode}
                  aria-label="Enter monitor selection mode"
                >
                  Select Monitor
                </button>
              )}
            </div>
          </div>

          {/* Desktop layout - visible only on larger screens */}
          <div className="hidden sm:flex sm:justify-between sm:items-center">
            <div className="flex items-center space-x-3">
              <div 
                className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg"
                aria-hidden="true"
              >
                <PlaneLanding className="h-6 w-6 text-white" />
              </div>
              <h1 className={`text-2xl font-bold ${THEME[theme].text.primary}`}>
                IDS Dock Tracker
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  if (isMonitorMode) {
                    // Exit monitor mode
                    setIsMonitorMode(false);
                  } else {
                    // Enter monitor mode without clearing selections
                    setIsMonitorMode(true);
                  }
                }}
                className={`px-4 py-2 rounded-lg transition-all duration-200 font-medium
                  ${isMonitorMode 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-cyan-500 hover:bg-cyan-600'} text-white`}
                aria-pressed={isMonitorMode}
                aria-label={isMonitorMode ? "Exit monitor mode" : "Enter monitor selection mode"}
              >
                {isMonitorMode ? 'Exit Monitor' : 'Select Monitor'}
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg transition-all duration-200"
              >
                <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all duration-200 font-medium"
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
                  rounded-lg p-4 cursor-pointer transition-all duration-200 h-24
                  ${statusFilter === status ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => handleStatusClick(status as DockStatus)}
                aria-pressed={statusFilter === status}
                aria-label={`Filter by ${status.replace('-', ' ')} status: ${count} docks`}
              >
                <div className="flex items-center justify-between h-full">
                  <div className="flex flex-col justify-center">
                    <p className={`text-sm font-medium uppercase tracking-wider ${statusTheme.text}`}>
                      {status.replace('-', ' ')}
                    </p>
                    <p className={`text-3xl font-bold ${THEME[theme].text.primary} mt-1`}>
                      {count}
                    </p>
                  </div>
                  <div className="flex items-center justify-center" aria-hidden="true">
                    {getStatusIcon(status as DockStatus, -1)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Monitor Mode Banner - Now positioned below status overview */}
        {isMonitorMode && (
          <div 
            className="mb-8"
            role="status"
            aria-live="polite"
          >
            <div className={`${THEME[theme].surface.primary} 
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
              const effectiveStatus = getEffectiveStatus(dock, docks);
              const statusTheme = THEME[theme].status[effectiveStatus];
              const absorbedDocks = getAbsorbedDockNames(dock, docks);
              
              return (
                <div
                  key={dock.id}
                  className={`${THEME[theme].surface.secondary} rounded-lg overflow-hidden`}
                  role="listitem"
                >
                  <div className={`${statusTheme.bg} p-4 flex flex-col items-center space-y-2`}>
                    {/* Status Icon */}
                    <div className="transform-gpu">
                      {getStatusIcon(effectiveStatus, dock.id)}
                    </div>
                    {/* Dock Name and Monitor Button */}
                    <div className="flex flex-col items-center w-full space-y-1">
                      <div className="flex items-center justify-between w-full">
                        <span className={`font-medium ${statusTheme.text} text-lg`}>
                          {dock.name}
                        </span>
                        {!isMonitorMode && (
                          <button
                            onClick={() => toggleDockMonitoring(dock.id)}
                            className={`p-1.5 rounded-full transition-colors
                              ${getXDockGroup(dock.id, docks).some(id => monitoredDockIds.has(id))
                                ? 'bg-cyan-500/20 hover:bg-cyan-500/30'
                                : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                            aria-label={`${monitoredDockIds.has(dock.id) ? 'Stop monitoring' : 'Start monitoring'} dock ${dock.name} group`}
                            aria-pressed={getXDockGroup(dock.id, docks).some(id => monitoredDockIds.has(id))}
                          >
                            <Eye 
                              className={`h-4 w-4 ${getXDockGroup(dock.id, docks).some(id => monitoredDockIds.has(id))
                                ? 'text-cyan-500 dark:text-cyan-400'
                                : THEME[theme].text.secondary}`} 
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>
                      {/* Show absorbed dock names if any */}
                      {absorbedDocks.length > 0 && (
                        <div className={`text-sm ${statusTheme.text} opacity-75 text-center`}>
                          Includes: {absorbedDocks.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Only show status selector for X docks or non-absorbed docks */}
                  {(dock.name.includes('X') || !isDockAbsorbed(dock, docks)) && (
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
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

// Update the getDockName function to handle the full range
function getDockName(dock: Dock) {
  if (dock.location === 'southwest') {
    // Check if the dock number is within the valid range
    if (dock.number >= 1 && dock.number <= southwestDockNames.length) {
      return southwestDockNames[dock.number - 1];
    }
    return `Unknown SW Dock ${dock.number}`;
  }
  
  if (dock.location === 'southeast') {
    const southeastDockNames = [
      'Q99', 'Q98', 'Q97', 'Q96', 'Q95', 'Q94', 'Q93', 'Q92',
      'Q91X', 'Q90', 'Q89', 'Q88X', 'Q87', 'Q86X'
    ];
    if (dock.number >= 1 && dock.number <= southeastDockNames.length) {
      return southeastDockNames[dock.number - 1];
    }
    return `Unknown SE Dock ${dock.number}`;
  }

  return `Dock ${dock.number}`;
}
