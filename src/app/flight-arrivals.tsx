'use client'

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card"
import { PlaneLanding, Loader } from 'lucide-react'

interface Flight {
  icao24: string;
  callsign: string;
  estDepartureAirport: string;
  estimatedArrivalTime: string;
  minutesUntilArrival: number;
  arrivalAirport: string;
}

const FlightArrivals: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFlights = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/mock-flights');
        if (!response.ok) {
          throw new Error('Failed to fetch flights');
        }
        const data = await response.json();
        setFlights(data);
        setError(null);
      } catch (error) {
        console.error('Error fetching flights:', error);
        setError('Failed to fetch flights. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 60000); // Fetch every minute

    return () => clearInterval(interval);
  }, []);

  const formatArrivalTime = (utcTimeString: string) => {
    const utcDate = new Date(utcTimeString);
    return utcDate.toLocaleString('en-US', { 
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  };

  const renderFlightCard = (flight: Flight) => (
    <Card key={flight.icao24} className="bg-white shadow-lg mb-4 hover:shadow-xl transition-shadow duration-300">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-blue-800">{flight.callsign}</h3>
          <PlaneLanding className="h-5 w-5 text-blue-600" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
          <p><span className="font-semibold">From:</span> {flight.estDepartureAirport}</p>
          <p><span className="font-semibold">Arrival:</span> {formatArrivalTime(flight.estimatedArrivalTime)}</p>
          <p className="col-span-2"><span className="font-semibold">Minutes until arrival:</span> {flight.minutesUntilArrival}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader className="animate-spin h-8 w-8 text-blue-600" />
    </div>
  );
  
  if (error) return <div className="text-center p-4 text-red-500 font-semibold text-xl bg-red-100 rounded-lg">{error}</div>;
  if (flights.length === 0) return <div className="text-center p-4 text-gray-500 text-xl">No flights available at the moment.</div>;

  return (
    <div className="overflow-x-auto bg-gray-100 rounded-lg shadow-inner">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-blue-600 text-white">
          <tr>
            <th className="p-3 text-left">Available Jobs</th>
            <th className="p-3 text-left">Scheduled Jobs</th>
            <th className="p-3 text-left">Ongoing Jobs</th>
            <th className="p-3 text-left">Finished Jobs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-4 align-top">{flights.map(renderFlightCard)}</td>
            <td className="p-4 align-top"></td>
            <td className="p-4 align-top"></td>
            <td className="p-4 align-top"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default FlightArrivals;