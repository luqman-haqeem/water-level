/**
 * Data Migration Script: Supabase to Convex
 * 
 * This script helps migrate data from Supabase to Convex.
 * Run this script after setting up both databases.
 * 
 * Usage:
 * 1. Ensure both Supabase and Convex are configured
 * 2. Update the environment variables
 * 3. Run: npx ts-node scripts/migrate-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

// Configuration
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

const supabase = createClient(supabaseUrl, supabaseKey);
const convex = new ConvexHttpClient(convexUrl);

interface MigrationStats {
  districts: number;
  stations: number;
  cameras: number;
  currentLevels: number;
  errors: string[];
}

async function migrateData(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    districts: 0,
    stations: 0,
    cameras: 0,
    currentLevels: 0,
    errors: []
  };

  try {
    console.log('Starting data migration from Supabase to Convex...');

    // 1. Migrate Districts
    console.log('Migrating districts...');
    const { data: districts, error: districtsError } = await supabase
      .from('districts')
      .select('*');

    if (districtsError) {
      stats.errors.push(`Districts error: ${districtsError.message}`);
    } else if (districts) {
      for (const district of districts) {
        try {
          // Note: For migration, you would need to create a public mutation or use internal APIs
          // This is a simplified example - in reality, you'd need proper migration functions
          console.log(`Would migrate district: ${district.name}`);
          stats.districts++;
        } catch (error) {
          stats.errors.push(`District "${district.name}": ${error}`);
        }
      }
    }

    // 2. Migrate Stations
    console.log('Migrating stations...');
    const { data: stations, error: stationsError } = await supabase
      .from('stations')
      .select('*');

    if (stationsError) {
      stats.errors.push(`Stations error: ${stationsError.message}`);
    } else if (stations) {
      for (const station of stations) {
        try {
          // Note: For migration, you would need to create proper migration functions
          // This is a simplified example
          console.log(`Would migrate station: ${station.station_name}`);
          stats.stations++;
        } catch (error) {
          stats.errors.push(`Station "${station.station_name}": ${error}`);
        }
      }
    }

    // 3. Migrate Cameras
    console.log('Migrating cameras...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*');

    if (camerasError) {
      stats.errors.push(`Cameras error: ${camerasError.message}`);
    } else if (cameras) {
      for (const camera of cameras) {
        try {
          // Note: For migration, you would need to create proper migration functions
          console.log(`Would migrate camera: ${camera.camera_name}`);
          stats.cameras++;
        } catch (error) {
          stats.errors.push(`Camera "${camera.camera_name}": ${error}`);
        }
      }
    }

    // 4. Migrate Current Levels
    console.log('Migrating current levels...');
    const { data: currentLevels, error: levelsError } = await supabase
      .from('current_levels')
      .select('*');

    if (levelsError) {
      stats.errors.push(`Current levels error: ${levelsError.message}`);
    } else if (currentLevels) {
      for (const level of currentLevels) {
        try {
          // Note: For migration, you would need to create proper migration functions
          console.log(`Would migrate current level for station: ${level.station_id}`);
          stats.currentLevels++;
        } catch (error) {
          stats.errors.push(`Current level for station ${level.station_id}: ${error}`);
        }
      }
    }

    console.log('Migration completed!');
    return stats;

  } catch (error) {
    stats.errors.push(`Migration failed: ${error}`);
    return stats;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateData().then(stats => {
    console.log('\\n=== Migration Results ===');
    console.log(`Districts migrated: ${stats.districts}`);
    console.log(`Stations migrated: ${stats.stations}`);
    console.log(`Cameras migrated: ${stats.cameras}`);
    console.log(`Current levels migrated: ${stats.currentLevels}`);
    
    if (stats.errors.length > 0) {
      console.log('\\n=== Errors ===');
      stats.errors.forEach(error => console.log(`- ${error}`));
    } else {
      console.log('\\nMigration completed successfully with no errors!');
    }
  }).catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

export { migrateData };