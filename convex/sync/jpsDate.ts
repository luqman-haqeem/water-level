/**
 * Converts a JPS timestamp ("DD/MM/YYYY HH:mm:ss", Malaysian local time, UTC+8)
 * to a UTC ISO string. Falls back to "now" for unparseable input.
 */
export function convertJpsDateToIso(jpsDate: string): string {
    if (!jpsDate) return new Date().toISOString();

    try {
        const [datePart, timePart] = jpsDate.split(" ");
        const [day, month, year] = datePart.split("/");
        const [hour, minute, second] = timePart.split(":");

        const utcMs = Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        ) - 8 * 60 * 60 * 1000;

        if (Number.isNaN(utcMs)) return new Date().toISOString();
        return new Date(utcMs).toISOString();
    } catch (error) {
        console.warn(`Failed to convert JPS date "${jpsDate}":`, error);
        return new Date().toISOString();
    }
}
