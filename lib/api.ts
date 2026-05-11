const API_BASE_URL = typeof window !== "undefined" 
  ? "/api" 
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8888").replace(/\/api$/, "").replace(/\/$/, "") + "/api";

type ApiResponse<T> = {
  status: boolean;
  message: string;
  error?: string;
  data?: T;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  role: string;
};

export type RegisterResponse = {
  id: string;
  name: string;
  email: string;
  telp_number: string;
  role: string;
  image_url: string;
  is_verified: boolean;
};

export type HealthProfile = {
  id?: string;
  user_id?: string;
  date_of_birth: string;
  biological_sex: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_type: string;
  smoking_status: string;
  existing_conditions: string;
  current_medications: string;
};

export type ChatMessage = {
  role: string;
  content: string;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  history?: ChatMessage[];
  meta?: any;
};

export type ChatSession = {
  id: string;
  title: string;
  updated_at: string;
};

export type HealthRecordResponse = {
  id: string;
  user_id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  telp_number?: string;
  role: string;
  image_url?: string;
};

export function getCurrentUser(accessToken: string) {
  return request<CurrentUser>("/user/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function getAccessToken() {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

export function clearAuth() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("role");
}

export function isAuthenticated() {
  return !!getAccessToken();
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const payload = await response.json().catch(() => null) as ApiResponse<AuthTokens> | null;
    if (!response.ok || !payload?.status || !payload.data) {
      clearAuth();
      return null;
    }
    saveAuth(payload.data);
    return payload.data.access_token;
  } catch {
    clearAuth();
    return null;
  }
}

async function request<T>(path: string, options: RequestInit, retry = true): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  } else {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && retry) {
    const newToken = await doRefresh();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      return request<T>(path, { ...options, headers: retryHeaders }, false);
    }
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired. Please sign in again.");
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || "Request failed");
  }
  if (payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

export function login(email: string, password: string) {
  return request<AuthTokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string, profile?: Partial<HealthProfile>) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("password", password);

  if (profile) {
    if (profile.date_of_birth) formData.append("date_of_birth", profile.date_of_birth);
    if (profile.biological_sex) formData.append("biological_sex", profile.biological_sex);
    if (profile.height_cm) formData.append("height_cm", String(profile.height_cm));
    if (profile.weight_kg) formData.append("weight_kg", String(profile.weight_kg));
    if (profile.blood_type) formData.append("blood_type", profile.blood_type);
  }

  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: formData,
  });
}

export function getHealthProfile(accessToken: string) {
  return request<HealthProfile>("/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function updateHealthProfile(accessToken: string, profile: HealthProfile) {
  return request<HealthProfile>("/profile", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(profile),
  });
}

export function saveAuth(tokens: AuthTokens) {
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("refresh_token", tokens.refresh_token);
  localStorage.setItem("role", tokens.role);
}

export function sendChatMessage(accessToken: string, message: string, sessionId?: string) {
  return request<ChatResponse>("/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
}

export function getChatSessions(accessToken: string) {
  return request<ChatSession[]>("/chat/sessions", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function getChatHistory(accessToken: string, sessionId: string) {
  return request<{ session_id: string; messages: ChatMessage[] }>(`/chat/sessions/${sessionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function clearChatHistory(accessToken: string) {
  return request<void>("/chat/history", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function uploadDocument(accessToken: string, file: File, documentType: string = "lab_result") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("document_type", documentType);

  return request<any>("/documents/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
}

export function getDocuments(accessToken: string) {
  return request<{ documents?: HealthRecordResponse[]; results?: any[]; rag_error?: string }>("/documents", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function confirmDocument(
  token: string,
  documentId: string,
  payload: any
) {
  return request<any>(`/documents/${documentId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deleteDocument(accessToken: string, documentId: string) {
  return request<any>(`/documents/${documentId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createManualDocument(
  token: string,
  payload: any
) {
  return request<any>("/documents/manual", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateDocument(
  token: string,
  documentId: string,
  payload: any
) {
  return request<any>(`/documents/${documentId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

// Health Logs (Manual Tracking)

export function createBloodSugarLog(token: string, payload: any) {
  return request<any>("/health-logs/blood-sugar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function getBloodSugarLogs(token: string) {
  return request<any[]>("/health-logs/blood-sugar", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createBloodPressureLog(token: string, payload: any) {
  return request<any>("/health-logs/blood-pressure", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function getBloodPressureLogs(token: string) {
  return request<any[]>("/health-logs/blood-pressure", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createWeightLog(token: string, payload: any) {
  return request<any>("/health-logs/weight", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function getWeightLogs(token: string) {
  return request<any[]>("/health-logs/weight", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type Article = {
  id: string;
  title: string;
  content: string;
  cover_image_url: string;
  author_id: string;
  status: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
};

// Article API
export function getArticles() {
  return request<Article[]>("/articles", {
    method: "GET",
  });
}

export function getArticle(id: string) {
  return request<Article>(`/articles/${id}`, {
    method: "GET",
  });
}

export function createArticle(accessToken: string, article: Partial<Article>) {
  return request<Article>("/articles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(article),
  });
}

export function updateArticle(accessToken: string, id: string, article: Partial<Article>) {
  return request<Article>(`/articles/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(article),
  });
}

export function deleteArticle(accessToken: string, id: string) {
  return request<any>(`/articles/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function publishArticle(accessToken: string, id: string) {
  return request<any>(`/articles/${id}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
