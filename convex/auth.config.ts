const issuerDomain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://placeholder.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
};
