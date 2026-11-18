import axios from "axios";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 10_000,
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const data = error.response?.data as { error?: unknown } | undefined;
      const code =
        typeof data?.error === "string"
          ? data.error
          : status === 0
            ? "network"
            : "unknown";
      return Promise.reject(new ApiError(status, code));
    }
    return Promise.reject(error);
  },
);
