const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config()

const stationURL = process.env.STATION_URL;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


async function updateStationInfo() {
    try {
        const { data: districts, error: districtsError } = await supabase
            .from('districts')
            .select('id');

        if (districtsError) throw new Error(`Error fetching districts: ${districtsError.message}`);

        for (const district of districts) {
            const response = await axios.get(`${stationURL}${district.id}`);
            if (response.status !== 200) throw new Error(`Network response was not ok for district ${district.id}`);

            const stationsJps = response.data;
            if (!stationsJps || !stationsJps.stations) continue;

            const stationUpdates = stationsJps.stations.map(async (stationJps) => {
                const { data: station } = await supabase
                    .from('stations')
                    .select('id')
                    .eq('JPS_sel_id', stationJps.id)
                    .single();

                if (station) {
                    return supabase
                        .from('stations')
                        .update({
                            JPS_sel_id: stationJps.id,
                            public_info_id: stationJps.stationId,
                            district_id: district.id,
                            station_name: stationJps.stationName,
                            station_code: stationJps.stationCode,
                            ref_name: stationJps.referenceName,
                            latitude: stationJps.latitude,
                            longitude: stationJps.longitude,
                            gsmNumber: stationJps.gsmNumber,
                            normal_water_level: stationJps.wlth_normal,
                            alert_water_level: stationJps.wlth_alert,
                            warning_water_level: stationJps.wlth_warning,
                            danger_water_level: stationJps.wlth_danger,
                            station_status: stationJps.stationStatus,
                            mode: stationJps.mode,
                            z1: stationJps.z1,
                            z2: stationJps.z2,
                            z3: stationJps.z3,
                            battery_level: stationJps.batteryLevel,
                            updated_at: new Date(),
                        })
                        .eq('id', station.id);
                } else {
                    return supabase
                        .from('stations')
                        .insert([
                            {
                                JPS_sel_id: stationJps.id,
                                public_info_id: stationJps.stationId,
                                district_id: district.id,
                                station_name: stationJps.stationName,
                                station_code: stationJps.stationCode,
                                ref_name: stationJps.referenceName,
                                latitude: stationJps.latitude,
                                longitude: stationJps.longitude,
                                gsmNumber: stationJps.gsmNumber,
                                normal_water_level: stationJps.wlth_normal,
                                alert_water_level: stationJps.wlth_alert,
                                warning_water_level: stationJps.wlth_warning,
                                danger_water_level: stationJps.wlth_danger,
                                station_status: stationJps.stationStatus,
                                mode: stationJps.mode,
                                z1: stationJps.z1,
                                z2: stationJps.z2,
                                z3: stationJps.z3,
                                battery_level: stationJps.batteryLevel,
                                updated_at: new Date(),
                                created_at: new Date(),
                            },
                        ]);
                }
            });

            await Promise.all(stationUpdates);
        }

        console.log('Station updated successfully.');
    } catch (error) {
        console.error('Error updating station info:', error.message);
    }
}
updateStationInfo();

module.exports = updateStationInfo;