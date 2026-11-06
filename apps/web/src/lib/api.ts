const API_URL = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

async function fetchApi(path: string, options: RequestInit = {}) {
  try {
    return await fetch(apiUrl(path), {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body && !(typeof FormData !== "undefined" && options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(
        "The IMARA API could not be reached. In local development, start it with `npm run dev:api` and confirm it is listening on port 3001. Otherwise, check VITE_API_URL.",
        0,
      );
    }
    throw error;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetchApi(path, options);

  let payload: unknown = null;
  if (response.status !== 204) {
    const body = await response.text();
    if (body) {
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        if (response.ok) {
          throw new Error("The server returned an unreadable response.");
        }
        payload = body;
      }
    }
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export async function apiBlob(path: string, headers?: HeadersInit): Promise<Blob> {
  const response = await fetchApi(path, { headers });
  if (!response.ok) {
    const body = await response.text();
    let message = "Unable to load this file.";
    if (body) {
      try {
        const payload = JSON.parse(body) as { message?: unknown };
        if (typeof payload.message === "string") message = payload.message;
      } catch {
        message = body;
      }
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export async function downloadFile(
  path: string,
  filename: string,
  headers?: HeadersInit,
): Promise<void> {
  const response = await fetchApi(path, { headers });
  if (!response.ok) {
    let message = "Unable to download this file.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // Use the generic message if the server response is not JSON.
    }
    throw new ApiError(message, response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  folderId: string | null;
  createdAt: string;
}

export interface UserFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  user: Pick<User, "id" | "name" | "email" | "emailVerified">;
  subscription: {
    plan: string;
    storage: {
      usedBytes: string;
      limitBytes: string;
      availableBytes: string;
    };
  };
  overview: {
    documentsCount: number;
    recentActivity: unknown[];
  };
}

export interface AuthSession {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string | null;
}
