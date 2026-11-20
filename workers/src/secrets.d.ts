/**
 * Secrets, merged into the generated Env types.
 *
 * `wrangler types` only sees `[vars]` in wrangler.toml, and secrets must not appear
 * there. It emits two interfaces — `Cloudflare.Env` and a global `Env` — so both are
 * augmented here; augmenting only one leaves the other missing the fields.
 *
 * Optional on purpose: a staging deployment without OneSignal credentials should sync
 * normally and skip alerts with a warning, not fail.
 *
 * Set with: wrangler secret put ONESIGNAL_REST_API_KEY --config workers/wrangler.toml
 */
interface OneSignalSecrets {
    ONESIGNAL_APP_ID?: string;
    ONESIGNAL_REST_API_KEY?: string;
}

declare namespace Cloudflare {
    interface Env extends OneSignalSecrets {}
}

interface Env extends OneSignalSecrets {}
