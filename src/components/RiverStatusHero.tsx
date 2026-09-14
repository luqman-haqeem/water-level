import { useMemo } from 'react'
import { isStale } from '@/utils/timeUtils'
import formatTimestamp from '@/utils/timeUtils'

interface StationForHero {
    station_status: boolean
    current_levels: {
        current_level: number
        updated_at: string | number | undefined
        alert_level: string
    } | null
}

interface RiverStatusHeroProps {
    stations: StationForHero[]
    /** How many stations this browser is subscribed to (localStorage-backed, no auth). */
    subscribedCount: number
    isLoading?: boolean
}

/** Worst alert level currently reported, or null when nothing is above normal. */
type Severity = 'alert' | 'warning' | 'danger'

const SEVERITY_ORDER: Record<string, Severity> = {
    '1': 'alert',
    '2': 'warning',
    '3': 'danger',
}

const SEVERITY_RANK: Record<Severity, number> = {
    alert: 1,
    warning: 2,
    danger: 3,
}

const SEVERITY_COPY: Record<Severity, string> = {
    alert: 'at alert level',
    warning: 'at warning level',
    danger: 'at danger level',
}

const SEVERITY_FIGURE_CLASS: Record<Severity, string> = {
    alert: 'text-alert',
    warning: 'text-warning',
    danger: 'text-danger',
}

export default function RiverStatusHero({
    stations,
    subscribedCount,
    isLoading = false,
}: RiverStatusHeroProps) {
    const summary = useMemo(() => {
        const online = stations.filter((s) => s.station_status)

        let aboveNormal = 0
        let worst: Severity | null = null
        let latestReading: string | number | undefined

        for (const station of online) {
            const alertLevel = station.current_levels?.alert_level
            const updatedAt = station.current_levels?.updated_at

            // Stale or missing readings are counted by StatusSummary's "no data"
            // chip, which is also the filter control — no need to repeat it here.
            if (isStale(updatedAt) || alertLevel === undefined || alertLevel === null) {
                continue
            }

            // Track the freshest reading we hold, so provenance is honest.
            if (
                updatedAt !== undefined &&
                (latestReading === undefined ||
                    new Date(updatedAt).getTime() > new Date(latestReading).getTime())
            ) {
                latestReading = updatedAt
            }

            const severity = SEVERITY_ORDER[alertLevel]
            if (severity) {
                aboveNormal++
                if (!worst || SEVERITY_RANK[severity] > SEVERITY_RANK[worst]) {
                    worst = severity
                }
            }
        }

        return {
            monitored: online.length,
            aboveNormal,
            worst,
            latestReading,
        }
    }, [stations])

    const { monitored, aboveNormal, worst, latestReading } = summary

    // Skeleton mirrors the real block's rhythm so the page doesn't reflow on load.
    if (isLoading) {
        return (
            <section className="rule-b pb-6 md:pb-8" aria-busy="true">
                <p className="text-eyebrow text-muted-foreground">Selangor river levels</p>
                <div className="mt-3 h-[3.25rem] w-24 animate-pulse rounded bg-muted md:h-20" />
                <div className="mt-3 h-4 w-56 animate-pulse rounded bg-muted" />
            </section>
        )
    }

    const allClear = aboveNormal === 0
    const figureClass = worst ? SEVERITY_FIGURE_CLASS[worst] : 'text-normal'

    return (
        <section className="rule-b pb-6 md:pb-8">
            <p className="text-eyebrow text-muted-foreground">Selangor river levels</p>

            <div className="mt-3 md:flex md:items-end md:justify-between md:gap-10">
                {/* The figure answers the only question that matters on arrival. */}
                <div aria-live="polite">
                    <p className={`text-figure ${figureClass}`}>{aboveNormal}</p>
                    <h1 className="text-heading-3 mt-2 max-w-[24ch]">
                        {allClear ? (
                            'stations above normal right now'
                        ) : (
                            <>
                                {aboveNormal === 1 ? 'station is' : 'stations are'} above
                                normal
                                {worst && (
                                    <>
                                        {' — worst '}
                                        <span className={SEVERITY_FIGURE_CLASS[worst]}>
                                            {SEVERITY_COPY[worst]}
                                        </span>
                                    </>
                                )}
                            </>
                        )}
                    </h1>
                </div>

                {/* Provenance and the alert affordance sit opposite the figure. */}
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:mt-0 md:shrink-0 md:grid-cols-1 md:gap-y-2 md:border-l md:border-rule md:pl-6">
                    <div>
                        <dt className="text-eyebrow text-muted-foreground">Monitored</dt>
                        <dd className="text-readout text-body">{monitored} stations</dd>
                    </div>
                    <div>
                        <dt className="text-eyebrow text-muted-foreground">Last reading</dt>
                        <dd className="text-readout text-body">
                            {latestReading !== undefined
                                ? formatTimestamp(String(latestReading))
                                : 'awaiting sync'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-eyebrow text-muted-foreground">Your alerts</dt>
                        <dd className="text-readout text-body">
                            {subscribedCount === 0
                                ? 'none set'
                                : `${subscribedCount} station${subscribedCount === 1 ? '' : 's'}`}
                        </dd>
                    </div>
                </dl>
            </div>

            {/* Honest CTA: alerts are per-station, so the path is "open a station". */}
            <p className="text-body-small text-muted-foreground mt-5 max-w-[52ch]">
                {aboveNormal > 0 ? (
                    <>
                        <a
                            href="#needs-attention"
                            className="text-foreground underline decoration-rule decoration-1 underline-offset-4 hover:decoration-primary"
                        >
                            See which stations
                        </a>
                        {' — or open any station to get a push alert when it rises.'}
                    </>
                ) : subscribedCount === 0 ? (
                    <>
                        {'Levels are checked every 15 minutes. Open a station and turn on alerts to be told when yours rises — '}
                        <a
                            href="#all-stations"
                            className="text-foreground underline decoration-rule decoration-1 underline-offset-4 hover:decoration-primary"
                        >
                            browse stations
                        </a>
                        .
                    </>
                ) : (
                    'Levels are checked every 15 minutes. You will be pushed an alert if a station you follow rises.'
                )}
            </p>
        </section>
    )
}
