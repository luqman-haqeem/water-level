/**
 * Ft2 · inline-rule single line.
 *
 * A flood tool has to say where its numbers come from and how old they can be —
 * that is load-bearing information for someone deciding whether to trust the
 * page, not footer decoration. Everything stated here is verifiable from the
 * sync setup: JPS Selangor upstream, 15-minute cron, 45-minute staleness cut.
 */
export default function DataProvenanceFooter() {
    return (
        <footer className="rule-t mt-10 pt-4">
            <p className="text-body-small text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Readings from JPS Selangor</span>
                <span aria-hidden="true" className="text-rule">
                    /
                </span>
                <span>
                    synced every <span className="text-readout">15</span> minutes
                </span>
                <span aria-hidden="true" className="text-rule">
                    /
                </span>
                <span>
                    flagged no-data after <span className="text-readout">45</span> minutes
                </span>
            </p>
            <p className="text-body-small text-muted-foreground mt-2 max-w-[64ch]">
                Not an official warning service. Follow JPS and your local authority for
                evacuation guidance.
            </p>
        </footer>
    )
}
