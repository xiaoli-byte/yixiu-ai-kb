/**
 * Claims embedded in the shared access token (see docs/authz-architecture.md §2/§4).
 * Both ai-call and ai-knowledge sign/verify tokens with this exact shape so a token
 * issued by one system is understood by the other ("shared secret" SSO, see §9 for the
 * upgrade path to a real IdP).
 */
export interface AuthClaims {
  /** subject — the authenticated user's id */
  sub: string;
  /** tenant this session is scoped to */
  tenantId: string;
  /** role keys granted to this user within this tenant (see Membership.roles[] in §3) */
  roles: string[];
  email?: string;
}
