export interface SessionUser {
  name: string;
  role: "viewer" | "operator" | "admin";
}

export interface AuthSession {
  enabled: boolean;
  authenticated: boolean;
  user?: SessionUser;
  permissions: string[];
}
