const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config()

async function updateStationInfo() {

    if (!process.env.CAMERA_URL) {
        throw new Error('CAMERA_URL environment variable is not set');
    }
    if (!process.env.SUPABASE_URL) {
        throw new Error('SUPABASE_URL environment variable is not set');
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('SUPABASE_SERVICE_KEY environment variable is not set');
    }
    const cameraUrl = process.env.CAMERA_URL;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);


    try {
        const { data: districts, error: districtsError } = await supabase
            .from('districts')
            .select('id');

        if (districtsError) throw new Error(`Error fetching districts: ${districtsError.message}`);

        for (const district of districts) {
            const response = await axios.get(`${cameraUrl}${district.id}`);
            if (response.status !== 200) throw new Error(`Network response was not ok for district ${district.id}`);

            const cameraJPS = response.data;
            if (!cameraJPS) continue;

            const cameraUpdates = cameraJPS.map(async (cameraJPS) => {
                const { data: camera } = await supabase
                    .from('cameras')
                    .select('id')
                    .eq('JPS_camera_id', cameraJPS.id)
                    .single();

                if (camera) {
                    return supabase
                        .from('cameras')
                        .update({
                            camera_brand: cameraJPS.cameraBrand,
                            camera_name: cameraJPS.cameraName,
                            district_id: cameraJPS.districtId,
                            img_url: cameraJPS.imageUrl,
                            is_enabled: cameraJPS.isEnabled,
                            is_online: cameraJPS.isOnline,
                            latitude: cameraJPS.latitude,
                            longitude: cameraJPS.longitude,
                            main_basin: cameraJPS.mainRiverBasin,
                            sub_basin: cameraJPS.subRiverBasin,
                            updated_at: new Date(),
                        })
                        .eq('id', camera.id);
                } else {
                    return supabase
                        .from('stations')
                        .insert([
                            {
                                camera_brand: cameraJPS.cameraBrand,
                                camera_name: cameraJPS.cameraName,
                                district_id: cameraJPS.districtId,
                                img_url: cameraJPS.imageUrl,
                                is_enabled: cameraJPS.isEnabled,
                                is_online: cameraJPS.isOnline,
                                latitude: cameraJPS.latitude,
                                longitude: cameraJPS.longitude,
                                main_basin: cameraJPS.mainRiverBasin,
                                sub_basin: cameraJPS.subRiverBasin,
                                updated_at: new Date(),
                                created_at: new Date(),
                            },
                        ]);
                }
            });

            await Promise.all(cameraUpdates);
        }

        console.log('Camera updated successfully.');
    } catch (error) {
        console.error('Error updating camera info:', error.message);
    }
}
updateStationInfo();

module.exports = updateStationInfo;