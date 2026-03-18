import { apiFetch } from "./api";

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe(): Promise<User> {
  return apiFetch<User>("/api/auth/me");
}
