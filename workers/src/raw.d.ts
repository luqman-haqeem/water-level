/**
 * Vite inlines `?raw` imports as strings. Used by the cron-config test so it reads the
 * real wrangler files rather than a copy that could drift from them.
 */
declare module "*?raw" {
    const content: string;
    export default content;
}
