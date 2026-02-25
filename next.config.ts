const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Prevent webpack from bundling the sandbox Prisma client — let Node resolve it at runtime
  serverExternalPackages: [".prisma/client-sandbox"],
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
