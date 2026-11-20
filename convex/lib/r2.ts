import { AwsClient } from "aws4fetch";

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
}

export interface PutObjectOptions {
    contentType: string;
    cacheControl: string;
}

export interface R2Client {
    putObject(key: string, body: string | Uint8Array, options: PutObjectOptions): Promise<void>;
    /** Returns null for a missing object; throws only on a transport or server error. */
    getObject(key: string): Promise<string | null>;
}

const REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export function r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config {
    const missing = REQUIRED.filter((name) => !env[name]);
    if (missing.length > 0) {
        throw new Error(`Missing R2 environment variables: ${missing.join(", ")}`);
    }
    return {
        accountId: env.R2_ACCOUNT_ID as string,
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
        bucket: env.R2_BUCKET as string,
    };
}

/** Minimal S3-compatible client for Cloudflare R2. Uses global fetch. */
export function createR2Client(config: R2Config): R2Client {
    const aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: "s3",
        region: "auto",
    });
    const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;

    return {
        async putObject(key, body, options) {
            const response = await aws.fetch(`${baseUrl}/${key}`, {
                method: "PUT",
                body,
                headers: {
                    "Content-Type": options.contentType,
                    "Cache-Control": options.cacheControl,
                },
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`R2 PUT ${key} failed: HTTP ${response.status} ${text}`.trim());
            }
        },

        async getObject(key) {
            const response = await aws.fetch(`${baseUrl}/${key}`, { method: "GET" });
            // A snapshot file that has never been written is an expected state on a
            // fresh bucket, not an error — the caller decides what an absent file means.
            if (response.status === 404) return null;
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`R2 GET ${key} failed: HTTP ${response.status} ${text}`.trim());
            }
            return await response.text();
        },
    };
}
