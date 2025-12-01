import { NextApiRequest, NextApiResponse } from 'next';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { stationId } = req.query;

    if (!stationId || typeof stationId !== 'string') {
        return res.status(400).json({ error: 'Station ID is required' });
    }

    try {
        // Fetch station data from Convex
        const stationData = await convex.query(api.stations.getStationDetailById, {
            stationId: stationId as Id<"stations">
        });

        if (!stationData) {
            return res.status(404).json({ error: 'Station not found' });
        }

        // Return the station data for the edge function
        res.setHeader('Cache-Control', 'public, s-maxage=1800, max-age=1800, stale-while-revalidate=3600'); // Cache for 30 minutes, allow stale for 1 hour
        res.status(200).json(stationData);

    } catch (error) {
        console.error('Error fetching station data:', error);
        res.status(500).json({ error: 'Failed to fetch station data' });
    }
}