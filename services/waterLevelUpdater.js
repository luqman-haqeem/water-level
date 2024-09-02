
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config()

// Initialize Supabase client (replace with your credentials)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const stationURL = process.env.STATION_URL;

const updateWaterLevels = async () => {
    try {
        // Fetch all districts at once
        const { data: districts, error: districtsError } = await supabase.from('districts').select('*');
        if (districtsError) throw districtsError;

        // Fetch data for all districts in parallel
        const districtPromises = districts.map(district =>
            axios.get(`${stationURL}${district.id}`)
        );
        const districtResponses = await Promise.all(districtPromises);

        // Process each district response
        for (const response of districtResponses) {
            const stationsJps = response.data;
            const stationUpdates = [];

            for (const stationJps of stationsJps.stations) {
                const { data: station } = await supabase
                    .from('stations')
                    .select('*')
                    .eq('JPS_sel_id', stationJps.id)
                    .single();

                if (station) {
                    const alertLevel = getAlertLevel(
                        stationJps.waterLevel,
                        station.danger_water_level,
                        station.warning_water_level,
                        station.alert_water_level
                    );

                    stationUpdates.push({
                        station_id: station.id,
                        current_level: stationJps.waterLevel,
                        alert_level: alertLevel,
                        updated_at: new Date(),
                    });
                } else {
                    console.log('Station not found:', stationJps.id);
                }
            }

            // Bulk update or insert current levels
            const { data: currentLevels } = await supabase
                .from('current_levels')
                .select('station_id, id')
                .in('station_id', stationUpdates.map(update => update.station_id));

            const updates = stationUpdates.map(update => {
                const existing = currentLevels.find(level => level.station_id === update.station_id);
                return existing
                    ? supabase.from('current_levels').update(update).eq('id', existing.id)
                    : supabase.from('current_levels').insert(update);
            });

            await Promise.all(updates);
        }

        console.log('Water levels updated successfully.');
    } catch (error) {
        console.error('Error updating water levels:', error);
    }
};

// Helper function to determine the alert level
function getAlertLevel(waterLevel, dangerLevel, warningLevel, alertLevel) {
    if (waterLevel >= dangerLevel) return 3;
    if (waterLevel >= warningLevel) return 2;
    if (waterLevel >= alertLevel) return 1;
    return 0;
}
updateWaterLevels();
module.exports = { updateWaterLevels };
