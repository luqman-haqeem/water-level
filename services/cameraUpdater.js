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
                const { data: camera, error: cameraError } = await supabase
                    .from('cameras')
                    .select('id')
                    .eq('jps_camera_id', cameraJPS.id)
                    .single();

                if (cameraError) {
                    console.error(`Error fetching camera: ${cameraError.message}`);
                    console.error(`Query: SELECT id FROM cameras WHERE jps_camera_id = ${cameraJPS.id}`);
                }

                if (camera) {
                    console.log("Updating existing camera");
                    console.log("Name:", cameraJPS.cameraName);
                    const { error: updateError } = await supabase
                        .from('cameras')
                        .update({
                            camera_brand: cameraJPS.cameraBrand,
                            camera_name: cameraJPS.cameraName,
                            district_id: cameraJPS.districtId,
                            img_url: cameraJPS.imageUrl,
                            is_enabled: cameraJPS.isEnabled,
                            is_online: cameraJPS.isOnline,
                            latitude: cameraJPS.latitude ?? 0,
                            longitude: cameraJPS.longitude ?? 0,
                            main_basin: cameraJPS.mainRiverBasin ?? '',
                            sub_basin: cameraJPS.subRiverBasin ?? '',
                            updated_at: new Date(),
                        })
                        .eq('id', camera.id);

                    if (updateError) {
                        console.error(`Error updating camera: ${updateError.message}`);
                        console.error(`Query: UPDATE cameras SET camera_brand = '${cameraJPS.cameraBrand}', camera_name = '${cameraJPS.cameraName}', district_id = ${cameraJPS.districtId}, img_url = '${cameraJPS.imageUrl}', is_enabled = ${cameraJPS.isEnabled}, is_online = ${cameraJPS.isOnline}, latitude = ${cameraJPS.latitude}, longitude = ${cameraJPS.longitude}, main_basin = '${cameraJPS.mainRiverBasin}', sub_basin = '${cameraJPS.subRiverBasin}', updated_at = '${new Date().toISOString()}' WHERE id = ${camera.id}`);
                        throw new Error(`Error updating camera: ${updateError.message}`);
                    }
                } else {
                    console.log("Creating new camera");
                    console.log("Name:", cameraJPS.cameraName);

                    const { error: insertError } = await supabase
                        .from('cameras')
                        .insert([
                            {
                                jps_camera_id: cameraJPS.id,
                                camera_brand: cameraJPS.cameraBrand,
                                camera_name: cameraJPS.cameraName,
                                district_id: cameraJPS.districtId,
                                img_url: cameraJPS.imageUrl,
                                is_enabled: cameraJPS.isEnabled,
                                is_online: cameraJPS.isOnline,
                                latitude: cameraJPS.latitude ?? 0,
                                longitude: cameraJPS.longitude ?? 0,
                                main_basin: cameraJPS.mainRiverBasin ?? '',
                                sub_basin: cameraJPS.subRiverBasin ?? '',
                                updated_at: new Date(),
                                created_at: new Date(),
                            },
                        ]);

                    if (insertError) {
                        console.error(`Error inserting camera: ${insertError.message}`);
                        console.error(`Query: INSERT INTO cameras (jps_camera_id, camera_brand, camera_name, district_id, img_url, is_enabled, is_online, latitude, longitude, main_basin, sub_basin, updated_at, created_at) VALUES ('${cameraJPS.id}', '${cameraJPS.cameraBrand}', '${cameraJPS.cameraName}', ${cameraJPS.districtId}, '${cameraJPS.imageUrl}', ${cameraJPS.isEnabled}, ${cameraJPS.isOnline}, ${cameraJPS.latitude}, ${cameraJPS.longitude}, '${cameraJPS.mainRiverBasin}', '${cameraJPS.subRiverBasin}', '${new Date().toISOString()}', '${new Date().toISOString()}')`);

                    }
                }
            });

            try {
                await Promise.all(cameraUpdates);
            } catch (error) {
                console.error('Error processing camera updates:', error.message);
            }
        }

        console.log('Camera updated successfully.');
    } catch (error) {
        console.error('Error updating camera info:', error.message);
    }
}

updateStationInfo();

module.exports = updateStationInfo;