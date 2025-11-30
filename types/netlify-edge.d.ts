// Type declarations for Netlify Edge Functions
declare module "https://edge.netlify.com/v1/mod.ts" {
    export interface Context {
        request: Request;
        next: () => Promise<Response>;
        params: Record<string, string>;
        geo?: {
            country?: {
                code?: string;
                name?: string;
            };
            subdivision?: {
                code?: string;
                name?: string;
            };
            city?: string;
            latitude?: number;
            longitude?: number;
            timezone?: string;
        };
        ip?: string;
        cookies: {
            get: (name: string) => string | undefined;
            set: (name: string, value: string, options?: any) => void;
            delete: (name: string, options?: any) => void;
        };
        log: (message: string, ...args: any[]) => void;
        rewrite: (url: string) => Response;
    }

    export interface Config {
        path: string;
        cache?: 'manual' | 'no-cache';
        onError?: 'fail' | 'bypass';
        method?: string | string[];
    }
}

declare module "https://deno.land/x/og_edge/mod.ts" {
    export class ImageResponse extends Response {
        constructor(
            element: React.ReactElement,
            options?: {
                width?: number;
                height?: number;
                emoji?: 'twemoji' | 'blobmoji' | 'noto' | 'openmoji' | 'fluent' | 'fluentFlat';
                fonts?: Array<{
                    name: string;
                    data: ArrayBuffer;
                    style?: 'normal' | 'italic';
                    weight?: number;
                }>;
                debug?: boolean;
                status?: number;
                statusText?: string;
                headers?: Record<string, string>;
            }
        );
    }
}

declare module "https://esm.sh/react@18.2.0" {
    import * as React from 'react';
    export = React;
    export as namespace React;
}

// Deno global for Netlify Edge Functions
declare var Deno: {
    env: {
        get(key: string): string | undefined;
        toObject(): Record<string, string>;
    };
};