import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The `pg` driver is a native-ish dependency and must not be bundled into
  // the edge/browser graph. Postgres is only ever touched from route handlers.
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
