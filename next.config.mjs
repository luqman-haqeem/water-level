/** @type {import('next').NextConfig} */
const nextConfig = {

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
