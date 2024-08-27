import axios from 'axios';

export default async function handler(req, res) {
    const { id } = req.query;
    const imageUrl = `http://infobanjirjps.selangor.gov.my/InfoBanjir.WebAdmin/CCTV_Image/${id}.jpg`;

    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minute
        res.status(200).send(response.data);
    } catch (error) {
        console.error('Error fetching image:', error);
        res.status(500).json({ error: 'Failed to fetch image' });
    }
}