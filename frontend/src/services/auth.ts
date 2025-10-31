import api from "../lib/api";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: "student" | "employer";
}

export const register = (payload: RegisterPayload) =>
  api.post("/auth/register", payload);

export interface LoginPayload {
  email: string;
  password: string;
}

export const login = (payload: LoginPayload) =>
  api.post("/auth/login", payload);

export const me = () => api.get("/auth/me");
