// Import necessary modules
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Path to save images locally
const imageDir = path.join(process.cwd(), 'public', 'images'); // Local directory for downloaded images

// Ensure the directory exists
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
}

// Function to download image from URL
const downloadImage = (url, destination) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);

        axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        }).then(response => {
            if (response.status !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.status})`));
                return;
            }

            response.data.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    console.log(`Image downloaded to ${destination}`);
                    resolve();
                });
            });
        }).catch(err => {
            fs.unlink(destination, () => reject(err)); // Clean up the file on error
        });
    });
};

// Fetch image URLs from Supabase
const fetchImageUrlsFromSupabase = async () => {
    const { data, error } = await supabase
        .from('cameras')
        .select('JPS_camera_id,img_url');

    if (error) {
        throw new Error('Error fetching image URLs from Supabase:', error.message);
    }
    return data
};

// Function to download and save images, then upload them to Supabase Storage
const processImages = async () => {
    try {
        const imageUrls = await fetchImageUrlsFromSupabase();

        for (const { JPS_camera_id, img_url } of imageUrls) {
            const fileName = `${JPS_camera_id}.jpg`;
            const filePath = path.join(imageDir, fileName);

            if (!JPS_camera_id || JPS_camera_id === '0') {
                console.log(`Skipping image ${JPS_camera_id} due to invalid JPS_camera_id`);
                continue;
            }
            console.log(`Processing image ${JPS_camera_id} of ${imageUrls.length}: ${img_url}`);
            await downloadImage(img_url, filePath);
            // Read the image as a buffer to upload to Supabase Storage
            const fileBuffer = fs.readFileSync(filePath);

            // Check if the image is not broken
            if (fileBuffer.length === 0) {
                console.error(`Image ${fileName} is broken or empty. Skipping upload.`);
                continue;
            }

            // Upload image to Supabase bucket
            const { error } = await supabase
                .storage
                .from('cameras')
                .upload(`images/${fileName}`, fileBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

            if (error) {
                throw new Error(`Error uploading image to Supabase: ${error.message}`);
            }

            console.log(`Image uploaded to Supabase bucket: ${fileName}`);
        }

        console.log('All images downloaded and uploaded successfully.');
    } catch (error) {
        console.error('Error processing images:', error.message);
    }
};

(async () => {
    await processImages();
})();

module.exports = processImages;
