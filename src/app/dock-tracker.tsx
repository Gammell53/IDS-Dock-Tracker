'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { PlaneLanding, PlaneIcon, AlertTriangle, Snowflake, Loader, RefreshCw } from 'lucide-react'

type DockStatus = 'available' | 'occupied' | 'out-of-service' | 'deiced'
type DockLocation = 'southeast' | 'southwest'

interface Dock {
  id: number
  location: DockLocation
  number: number
  name: string
  status: DockStatus
}

const southwestDockNames = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99']

export default function DockTracker() {
  const [docks, setDocks] = useState<Dock[]>([])
  const [activeTab, setActiveTab] = useState<DockLocation>('southwest')
  const [statusFilter, setStatusFilter] = useState<DockStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  console.log('DockTracker rendering, loading:', loading, 'docks:', docks);

  const fetchDocks = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching docks...');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/docks', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      console.log('Fetch response:', response);
      if (!response.ok) {
        throw new Error(`Failed to fetch docks: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Fetched data:', data);
      if (data.length === 0) {
        console.log('No docks returned from API');
      }
      const formattedDocks = data.map((dock: Dock) => ({
        ...dock,
        name: getDockName(dock)
      }));
      console.log('Formatted docks:', formattedDocks);
      setDocks(formattedDocks);
      setError(null);
    } catch (error) {
      console.error('Error fetching docks:', error);
      setError('Failed to fetch docks. Please try again.');
    } finally {
      setLoading(false);
      console.log('Fetch completed, loading set to false');
    }
  }, []);

  useEffect(() => {
    console.log('Setting up SSE connection');
    const eventSource = new EventSource('/sse');

    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('Received SSE message:', event.data);
      const data = JSON.parse(event.data);
      if (data.type === 'dock_updated') {
        console.log('Processing dock_updated event:', data.data);
        setDocks(prevDocks => 
          prevDocks.map(dock => 
            dock.id === data.data.id ? {...data.data, name: getDockName(data.data)} : dock
          )
        );
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      console.log('Closing SSE connection');
      eventSource.close();
    };
  }, []);

  const getDockName = (dock: Dock) => {
    if (dock.location === 'southwest') {
      return southwestDockNames[dock.number - 1] || `Unknown SW Dock ${dock.number}`
    }
    return `Dock ${dock.number}`
  }

  const updateDockStatus = async (id: number, status: DockStatus) => {
    try {
      console.log(`Updating dock ${id} to status ${status}`);
      const token = localStorage.getItem('token');
      
      // Optimistic update
      setDocks(prevDocks => 
        prevDocks.map(dock => 
          dock.id === id ? {...dock, status} : dock
        )
      );

      const response = await fetch(`/api/docks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Failed to update dock status: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`)
      }

      console.log(`Successfully updated dock ${id} to status ${status}`);
    } catch (error) {
      console.error('Error updating dock status:', error)
      // Revert the optimistic update
      fetchDocks()
    }
  }

  const filteredDocks = useMemo(() => {
    let filtered = docks.filter(dock => dock.location === activeTab)
    if (statusFilter) {
      filtered = filtered.filter(dock => dock.status === statusFilter)
    }
    return filtered
  }, [docks, activeTab, statusFilter])

  const statusCounts = useMemo(() => {
    const counts = docks
      .filter(dock => dock.location === activeTab)
      .reduce((acc, dock) => {
        acc[dock.status]++
        return acc
      }, { available: 0, occupied: 0, 'out-of-service': 0, deiced: 0 } as Record<DockStatus, number>)
    
    return counts
  }, [docks, activeTab])

  const getStatusIcon = (status: DockStatus) => {
    switch (status) {
      case 'available': return <PlaneLanding className="h-6 w-6 text-green-600" />
      case 'occupied': return <PlaneIcon className="h-6 w-6 text-yellow-600" />
      case 'out-of-service': return <AlertTriangle className="h-6 w-6 text-red-600" />
      case 'deiced': return <Snowflake className="h-6 w-6 text-blue-600" />
    }
  }

  const handleStatusClick = (status: DockStatus) => {
    setStatusFilter(prevStatus => prevStatus === status ? null : status)
  }

  useEffect(() => {
    fetchDocks();
  }, [fetchDocks]);

  if (loading) {
    console.log('Rendering loading state');
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-12 w-12 text-white" />
        <p className="ml-2 text-white">Loading docks...</p>
      </div>
    );
  }

  if (error) {
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
    <div className="space-y-6 bg-gray-900 text-white p-6 rounded-lg">
      <div className="bg-gray-800 shadow-lg rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-indigo-400">Dock Location</h2>
        <select 
          value={activeTab} 
          onChange={(e) => setActiveTab(e.target.value as DockLocation)}
          className="w-full p-2 border border-gray-700 rounded-md bg-gray-700 text-white focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="southwest">Southwest</option>
          <option value="southeast">Southeast</option>
        </select>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div 
            key={status} 
            className={`bg-gray-800 shadow-lg rounded-lg p-4 cursor-pointer transition-all duration-200 
              ${statusFilter === status 
                ? 'ring-4 ring-indigo-400 shadow-xl transform scale-105' 
                : 'hover:shadow-xl hover:scale-102'}`}
            onClick={() => handleStatusClick(status as DockStatus)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-indigo-400 uppercase">{status}</p>
                <p className="text-2xl sm:text-3xl font-semibold text-white">{count}</p>
              </div>
              {getStatusIcon(status as DockStatus)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800 shadow-lg rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-indigo-400">Dock Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {filteredDocks.map(dock => (
            <div key={dock.id} className="bg-gray-700 shadow-lg rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-white">{dock.name}</h2>
                {getStatusIcon(dock.status)}
              </div>
              <select 
                value={dock.status}
                onChange={(e) => updateDockStatus(dock.id, e.target.value as DockStatus)}
                className="w-full p-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="out-of-service">Out of Service</option>
                <option value="deiced">Deiced</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}