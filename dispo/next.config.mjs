import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Die Dispo-App ist ein eigenstaendiges Projekt im Repository.
  outputFileTracingRoot: __dirname,
  eslint: { ignoreDuringBuilds: true },
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
