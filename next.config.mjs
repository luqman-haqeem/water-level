/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'hnqhytdyrehyflbymaej.supabase.co',
                port: '',
                pathname: '/storage/v1/object/public/cameras/images/**',
            },
        ],
    },
};

import withPWA from 'next-pwa';

const pwaConfig = withPWA({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development', // disable PWA in development
});

const finalConfig = pwaConfig(nextConfig);

export default finalConfig;