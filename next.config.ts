import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * WSL2 Fix: Disable Turbopack to avoid root inference issues
   *
   * Problem: Next.js detects package-lock.json at /mnt/c/Users/yuriq/
   * and treats it as workspace root, causing Turbopack to write cache
   * to Windows drive, which WSL2 blocks with "Permission denied (os error 13)"
   *
   * Solution: Disable Turbopack here + set TURBOPACK_ROOT in dev-tunnel.js
   *
   * TODO: Re-enable after Next.js 16.1.7+ with turbopack.root fix
   */
  experimental: {
    turbopack: false,
  },
};

export default nextConfig;
