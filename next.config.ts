import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La foto de perfil de Google (avatar del Topbar): next/image exige
  // autorizar el host remoto, si no lanza "hostname is not configured".
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
