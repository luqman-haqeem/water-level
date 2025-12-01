const axios = require('axios');
const { ConvexHttpClient } = require("convex/browser");
require('dotenv').config({ path: '.env.local' });

const BASE_URL = 'https://infobanjirjps.selangor.gov.my/JPSAPI/api';

// Initialize Convex client
const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
console.log('Using Convex URL:', convexUrl);

if (!convexUrl) {
    console.error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is required');
    process.exit(1);
}

const convex = new ConvexHttpClient(convexUrl);


class WaterLevelScraper {
    constructor() {
        this.baseURL = BASE_URL;
    }

    async getWaterLevelSummary() {
        try {
            const response = await axios.get(`${this.baseURL}/StationRiverLevels/GetWLStationSummary`);

            if (!response.data) {
                throw new Error('No data received from API');
            }


            const summary = response.data.map(district => ({
                districtId: district.districtId,
                districtName: district.district,
                totalStations: district.total_station,
                normalCount: district.normal,
                alertCount: district.alert,
                warningCount: district.warning,
                dangerCount: district.danger,
                onlineStations: district.online,
                offlineStations: district.offline,
                lastUpdated: district.lastUpdated,
                allLastUpdated: district.allLastUpdated,
                timestamp: new Date().toISOString()
            }));

            return {
                timestamp: new Date().toISOString(),
                districts: summary,
                totalDistricts: summary.length,
                overallStatus: this.calculateOverallStatus(summary)
            };

        } catch (error) {
            console.error('Error fetching water level summary:', error.message);
            throw error;
        }
    }

    async getDistrictDetails(districtId) {
        try {
            const response = await axios.get(`${this.baseURL}/StationRiverLevels/GetWLAllStationData/${districtId}`);

            if (!response.data) {
                throw new Error(`No station data found for district ${districtId}`);
            }

            // Extract stations from the response
            const stationsData = response.data.stations || [];
            const stations = stationsData.map(station => ({
                id: station.id,
                stationId: station.stationId || '',
                name: station.stationName,
                stationCode: station.stationCode,
                referenceName: station.referenceName,
                districtName: station.districtName,
                currentWaterLevel: station.waterLevel === null || station.waterLevel === -9999 ? 0 : station.waterLevel,
                normalLevel: station.wlth_normal || 0,
                alertLevel: station.wlth_alert || 0,
                warningLevel: station.wlth_warning || 0,
                dangerLevel: station.wlth_danger || 0,
                waterlevelStatus: station.waterlevelStatus || -1,
                stationStatus: station.stationStatus || 0,
                lastUpdate: station.lastUpdate || new Date().toISOString(),
                latitude: parseFloat(station.latitude) || 0,
                longitude: parseFloat(station.longitude) || 0,
                batteryLevel: station.batteryLevel,
                gsmNumber: station.gsmNumber,
                markerType: station.markerType,
                mode: station.mode,
                z1: station.z1,
                z2: station.z2,
                z3: station.z3
            })).filter(station => station.currentWaterLevel !== -9999); // Filter out offline stations with invalid readings

            return {
                districtId: parseInt(districtId),
                districtName: stations.length > 0 ? stations[0].districtName : `District ${districtId}`,
                timestamp: new Date().toISOString(),
                stations: stations,
                stationCount: stations.length
            };

        } catch (error) {
            console.error(`Error fetching details for district ${districtId}:`, error.message);
            throw error;
        }
    }

    async getAllWaterLevelData() {
        try {
            const summary = await this.getWaterLevelSummary();

            const districtDetailsPromises = summary.districts.map(district =>
                this.getDistrictDetails(district.districtId)
            );

            const districtDetails = await Promise.all(districtDetailsPromises);

            return {
                summary: summary,
                details: districtDetails,
                scrapedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching all water level data:', error.message);
            throw error;
        }
    }

    calculateOverallStatus(districts) {
        const totalDanger = districts.reduce((sum, d) => sum + d.dangerCount, 0);
        const totalWarning = districts.reduce((sum, d) => sum + d.warningCount, 0);
        const totalAlert = districts.reduce((sum, d) => sum + d.alertCount, 0);

        if (totalDanger > 0) return 'DANGER';
        if (totalWarning > 0) return 'WARNING';
        if (totalAlert > 0) return 'ALERT';
        return 'NORMAL';
    }

    async saveToConvex(data) {
        try {
            console.log('💾 Saving data to Convex...');

            // Save summary data
            const summaryId = await convex.mutation("waterLevelData:storeWaterLevelSummary", {
                districts: data.summary.districts,
                overallStatus: data.summary.overallStatus,
                scrapedAt: data.scrapedAt,
            });

            console.log(`✅ Summary saved with ID: ${summaryId}`);

            // Save district station details
            let totalStationsSaved = 0;
            for (const districtDetail of data.details) {
                const result = await convex.mutation("waterLevelData:storeDistrictStations", {
                    districtId: districtDetail.districtId,
                    districtName: districtDetail.districtName,
                    stations: districtDetail.stations,
                });

                if (result.success) {
                    totalStationsSaved += result.stationsCount;
                }
            }

            console.log(`✅ Saved ${totalStationsSaved} stations across ${data.details.length} districts`);

            return {
                summaryId,
                districtsCount: data.details.length,
                stationsCount: totalStationsSaved,
                timestamp: data.scrapedAt
            };

        } catch (error) {
            console.error('❌ Error saving to Convex:', error.message);
            throw error;
        }
    }

    async saveToFile(data, filename = null) {
        const fs = require('fs').promises;
        const path = require('path');

        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `water-level-data-${timestamp}.json`;
        }

        const filepath = path.join(__dirname, '..', 'data', filename);

        // Ensure data directory exists
        await fs.mkdir(path.dirname(filepath), { recursive: true });

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        console.log(`Data saved to: ${filepath}`);
        return filepath;
    }
}

// CLI usage
async function main() {
    const scraper = new WaterLevelScraper();

    try {
        console.log('🌊 Starting water level data scraping...');

        const args = process.argv.slice(2);
        const command = args[0] || 'all';

        switch (command) {
            case 'summary':
                console.log('📊 Fetching summary data...');
                const summary = await scraper.getWaterLevelSummary();
                console.log('\n=== WATER LEVEL SUMMARY ===');
                console.log(`Overall Status: ${summary.overallStatus}`);
                console.log(`Total Districts: ${summary.totalDistricts}`);
                console.log(`Timestamp: ${summary.timestamp}\n`);

                summary.districts.forEach(district => {
                    console.log(`${district.districtName}:`);
                    console.log(`  Total Stations: ${district.totalStations} (Online: ${district.onlineStations}, Offline: ${district.offlineStations})`);
                    console.log(`  Normal: ${district.normalCount} | Alert: ${district.alertCount} | Warning: ${district.warningCount} | Danger: ${district.dangerCount}`);
                    console.log(`  Last Updated: ${district.lastUpdated}\n`);
                });
                break;

            case 'district':
                const districtId = args[1];
                if (!districtId) {
                    console.error('Please provide a district ID: node scrapeWaterLevel.js district <id>');
                    process.exit(1);
                }
                console.log(`📍 Fetching data for district ${districtId}...`);
                const districtData = await scraper.getDistrictDetails(districtId);
                console.log(JSON.stringify(districtData, null, 2));
                break;

            case 'file':
                console.log('🔍 Fetching complete water level data...');
                const fileData = await scraper.getAllWaterLevelData();
                console.log(`✅ Retrieved data for ${fileData.details.length} districts`);

                const filepath = await scraper.saveToFile(fileData);
                console.log(`💾 Data saved to: ${filepath}`);

                console.log('\n=== FILE SAVE SUMMARY ===');
                console.log(`Overall Status: ${fileData.summary.overallStatus}`);
                console.log(`Total Districts: ${fileData.summary.totalDistricts}`);
                console.log(`Scraped At: ${fileData.scrapedAt}`);
                break;

            case 'all':
            default:
                console.log('🔍 Fetching complete water level data...');
                const allData = await scraper.getAllWaterLevelData();
                console.log(`✅ Retrieved data for ${allData.details.length} districts`);

                const convexResult = await scraper.saveToConvex(allData);

                console.log('\n=== CONVEX SAVE SUMMARY ===');
                console.log(`Summary ID: ${convexResult.summaryId}`);
                console.log(`Districts Saved: ${convexResult.districtsCount}`);
                console.log(`Stations Saved: ${convexResult.stationsCount}`);
                console.log(`Overall Status: ${allData.summary.overallStatus}`);
                console.log(`Scraped At: ${convexResult.timestamp}`);
                break;
        }

    } catch (error) {
        console.error('❌ Scraping failed:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = WaterLevelScraper;

// Run CLI if called directly
if (require.main === module) {
    main();
}