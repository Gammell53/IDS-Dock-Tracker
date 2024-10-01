'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaneLanding, PlaneIcon, AlertTriangle } from 'lucide-react'

type DockStatus = 'available' | 'occupied' | 'out-of-service'

interface Dock {
  id: number
  status: DockStatus
}

export default function DockTracker() {
  const [docks, setDocks] = useState<Dock[]>(
    Array.from({ length: 13 }, (_, i) => ({ id: i + 1, status: 'available' }))
  )

  const updateDockStatus = (id: number, status: DockStatus) => {
    setDocks(docks.map(dock => 
      dock.id === id ? { ...dock, status } : dock
    ))
  }

  const statusCounts = useMemo(() => {
    return docks.reduce((acc, dock) => {
      acc[dock.status]++
      return acc
    }, { available: 0, occupied: 0, 'out-of-service': 0 })
  }, [docks])

  const getStatusIcon = (status: DockStatus) => {
    switch (status) {
      case 'available': return <PlaneLanding className="h-6 w-6 text-green-500" />
      case 'occupied': return <PlaneIcon className="h-6 w-6 text-blue-500" />
      case 'out-of-service': return <AlertTriangle className="h-6 w-6 text-yellow-500" />
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-gray-800">IDS DFW Dock Tracker</h1>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Card key={status} className="bg-white shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase">{status}</p>
                    <p className="text-2xl sm:text-3xl font-semibold text-gray-800">{count}</p>
                  </div>
                  {getStatusIcon(status as DockStatus)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {docks.map(dock => (
            <Card key={dock.id} className="bg-white shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Dock {dock.id}</h2>
                  {getStatusIcon(dock.status)}
                </div>
                <Select onValueChange={(value: DockStatus) => updateDockStatus(dock.id, value)}>
                  <SelectTrigger className="w-full text-sm sm:text-base">
                    <SelectValue placeholder={dock.status.charAt(0).toUpperCase() + dock.status.slice(1)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="out-of-service">Out of Service</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}