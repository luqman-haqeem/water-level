import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)

// Helper function to format timestamp in KL time
const formatTimestamp = (timestamp: string) => {
    return dayjs.utc(timestamp).tz('Asia/Kuala_Lumpur').fromNow()
}


export default formatTimestamp