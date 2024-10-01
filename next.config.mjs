/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            {
                source: '/',
                destination: '/stations',
                permanent: true,
            },
        ];
    },
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

export default nextConfig;
