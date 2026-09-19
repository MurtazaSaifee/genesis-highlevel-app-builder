/**
 * HighLevel API Client SDK & Preview Runtime Bridge
 *
 * Provides typed access to HighLevel Contacts, Conversations, and Calendars APIs
 * routed securely through the Firebase Cloud Functions backend proxy (/hlProxy).
 *
 * This shields HighLevel OAuth tokens and client secrets, prevents CORS issues in browsers,
 * automatically handles token refreshes, and seamlessly routes to the High-Fidelity
 * Sandbox Mock Engine when testing in Demo Sandbox mode.
 */

import { auth } from "./firebase.ts";

export interface HighLevelContact {
  id: string;
  locationId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
  type: "lead" | "customer";
  companyName?: string;
  dateAdded: string;
  dateUpdated: string;
  customFields?: Array<{ id: string; key: string; field_value: string }>;
}

export interface HighLevelPaginatedContacts {
  contacts: HighLevelContact[];
  total: number;
  meta: {
    total: number;
    startAfterId: string | null;
    nextStartAfterId?: string | null;
    limit: number;
    hasMore: boolean;
  };
}

export interface HighLevelConversation {
  id: string;
  contactId: string;
  locationId: string;
  contactName: string;
  email: string;
  phone: string;
  unreadCount: number;
  lastMessageBody: string;
  lastMessageType: "TYPE_SMS" | "TYPE_EMAIL" | "TYPE_WHATSAPP";
  lastMessageDate: number;
}

export interface HighLevelPaginatedConversations {
  conversations: HighLevelConversation[];
  total: number;
  meta?: {
    total: number;
    startAfterId: string | null;
    hasMore: boolean;
  };
}

export interface HighLevelMessage {
  id: string;
  conversationId: string;
  contactId?: string;
  locationId?: string;
  body: string;
  messageType: "SMS" | "Email" | "WhatsApp";
  direction: "inbound" | "outbound";
  status: "delivered" | "sent" | "failed";
  dateAdded: string;
}

export interface HighLevelCalendar {
  id: string;
  locationId: string;
  name: string;
  description: string;
  slotDuration: number;
  slotInterval: number;
  isActive: boolean;
}

export interface HighLevelCalendarEvent {
  id: string;
  calendarId: string;
  locationId: string;
  contactId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "showed" | "noshow";
  contact: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

export interface HighLevelClientOptions {
  baseUrl?: string;
  getIdToken?: () => Promise<string | null>;
}

/**
 * Returns default Cloud Function base URL
 */
export function getDefaultProxyBaseUrl(): string {
  const env =
    (typeof import.meta !== "undefined" && (import.meta.env as Record<string, string | boolean | undefined>)) ||
    (typeof process !== "undefined" && (process.env as Record<string, string | undefined>)) ||
    {};

  if (env.VITE_FUNCTIONS_BASE_URL) {
    return `${env.VITE_FUNCTIONS_BASE_URL}/hlProxy`;
  }
  const isEmulator =
    env.VITE_USE_EMULATORS !== undefined
      ? env.VITE_USE_EMULATORS === "true" || env.VITE_USE_EMULATORS === true
      : env.DEV !== false;

  if (isEmulator) {
    const projectId = env.VITE_FIREBASE_PROJECT_ID || "genesis-hl-builder-1";
    return `http://127.0.0.1:5001/${projectId}/us-central1/hlProxy`;
  }

  return "/hlProxy";
}

/**
 * Creates a configured HighLevel API Client instance
 */
export function createHighLevelClient(options: HighLevelClientOptions = {}) {
  const baseUrl = options.baseUrl || getDefaultProxyBaseUrl();
  const tokenProvider =
    options.getIdToken ||
    (async () => {
      const currentUser = auth.currentUser;
      return currentUser ? await currentUser.getIdToken() : null;
    });

  async function request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    queryParams: Record<string, unknown> = {},
    body?: unknown
  ): Promise<T> {
    const idToken = await tokenProvider();
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`${baseUrl}${cleanPath}`);

    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && ["POST", "PUT", "PATCH"].includes(method)) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), fetchOptions);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.message || errorData.error || `HighLevel API error (${res.status})`;
      throw new Error(errorMsg);
    }

    return (await res.json()) as T;
  }

  const contacts = {
    /**
     * List & search contacts with pagination
     */
    list: (params: { query?: string; limit?: number; startAfterId?: string } = {}) =>
      request<HighLevelPaginatedContacts>("/contacts", "GET", params),

    /**
     * Get a single contact by ID
     */
    get: (id: string) =>
      request<{ contact: HighLevelContact }>(`/contacts/${encodeURIComponent(id)}`, "GET"),

    /**
     * Create a new contact
     */
    create: (data: Partial<HighLevelContact>) =>
      request<{ contact: HighLevelContact }>("/contacts", "POST", {}, data),

    /**
     * Update an existing contact
     */
    update: (id: string, data: Partial<HighLevelContact>) =>
      request<{ contact: HighLevelContact }>(`/contacts/${encodeURIComponent(id)}`, "PUT", {}, data),
  };

  const conversations = {
    /**
     * List recent conversations with search and pagination
     */
    list: (params: { query?: string; limit?: number; startAfterId?: string } = {}) =>
      request<HighLevelPaginatedConversations>("/conversations", "GET", params),

    /**
     * Get thread message history for a conversation
     */
    getMessages: (conversationId: string, params: { limit?: number } = {}) =>
      request<{ messages: { messages: HighLevelMessage[]; lastMessageId: string | null } }>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        "GET",
        params
      ),

    /**
     * Send a message to a contact or existing conversation
     */
    sendMessage: (data: {
      conversationId?: string;
      contactId?: string;
      message: string;
      type?: "SMS" | "Email";
    }) => request<{ messageId: string; status: string; message: HighLevelMessage }>("/conversations/messages", "POST", {}, data),
  };

  const calendars = {
    /**
     * List all active calendars for the location
     */
    list: () => request<{ calendars: HighLevelCalendar[] }>("/calendars", "GET"),

    /**
     * List scheduled appointments/events within a date range
     */
    getAppointments: (params: { calendarId?: string; startTime?: string; endTime?: string } = {}) =>
      request<{ events: HighLevelCalendarEvent[] }>("/calendars/events", "GET", params),

    /**
     * Query available booking slots for a calendar
     */
    getFreeSlots: (calendarId: string, params: { startDate?: string; endDate?: string } = {}) =>
      request<Record<string, { slots: string[] }>>(
        `/calendars/${encodeURIComponent(calendarId)}/free-slots`,
        "GET",
        params
      ),
  };

  /**
   * Unified RPC Request Dispatcher for the Live Preview sandboxed runner.
   * Decouples RPC transport from UI components for live pairing extension.
   */
  async function dispatchRpc(
    service: string,
    action: string,
    endpoint: string,
    method: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<unknown> {
    if (service === "contacts") {
      if (action === "list") return await contacts.list(params as Parameters<typeof contacts.list>[0]);
      if (action === "get") return await contacts.get(String(params?.id || (body as { id?: string })?.id || ""));
      if (action === "create") return await contacts.create((body || params) as Partial<HighLevelContact>);
      if (action === "update") return await contacts.update(String(params?.id || (body as { id?: string })?.id || ""), (body || params) as Partial<HighLevelContact>);
    } else if (service === "conversations") {
      if (action === "list") return await conversations.list(params as Parameters<typeof conversations.list>[0]);
      if (action === "getMessages") return await conversations.getMessages(String(params?.id || params?.conversationId || ""), params as { limit?: number });
      if (action === "sendMessage") return await conversations.sendMessage((body || params) as Parameters<typeof conversations.sendMessage>[0]);
    } else if (service === "calendars") {
      if (action === "list") return await calendars.list();
      if (action === "getAppointments") return await calendars.getAppointments(params as Parameters<typeof calendars.getAppointments>[0]);
      if (action === "getFreeSlots") return await calendars.getFreeSlots(String(params?.id || params?.calendarId || ""), params as Parameters<typeof calendars.getFreeSlots>[1]);
    }
    return await request(endpoint || `/${service}`, (method as "GET" | "POST" | "PUT" | "DELETE") || "GET", params, body);
  }

  return {
    request,
    dispatchRpc,
    contacts,
    conversations,
    calendars,
  };
}

/**
 * Singleton client instance for immediate use across the frontend
 */
export const highlevelClient = createHighLevelClient();

/**
 * Generates an embeddable vanilla JS client library for the Sandboxed Live Preview Iframe (Task 11).
 *
 * This injects `window.highlevel` into the preview DOM so generated AI applications
 * can call `window.highlevel.contacts.list()`, `window.highlevel.calendars.getAppointments()`, etc.
 */
export function generatePreviewRuntimeScript(proxyBaseUrl?: string, userToken?: string): string {
  const targetUrl = proxyBaseUrl || getDefaultProxyBaseUrl();
  const tokenSnippet = userToken ? `"${userToken}"` : "null";

  return `
<script>
(function() {
  const PROXY_BASE = "${targetUrl}";
  const USER_TOKEN = ${tokenSnippet};

  async function hlRequest(endpoint, method, params, body) {
    const url = new URL(PROXY_BASE + endpoint);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }
    const headers = { Accept: 'application/json' };
    if (USER_TOKEN) headers['Authorization'] = 'Bearer ' + USER_TOKEN;
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(url.toString(), {
      method: method || 'GET',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'HighLevel API request failed');
    }
    return res.json();
  }

  window.highlevel = {
    contacts: {
      list: (p) => hlRequest('/contacts', 'GET', p),
      get: (id) => hlRequest('/contacts/' + encodeURIComponent(id), 'GET'),
      create: (data) => hlRequest('/contacts', 'POST', null, data),
      update: (id, data) => hlRequest('/contacts/' + encodeURIComponent(id), 'PUT', null, data)
    },
    conversations: {
      list: (p) => hlRequest('/conversations', 'GET', p),
      getMessages: (id, p) => hlRequest('/conversations/' + encodeURIComponent(id) + '/messages', 'GET', p),
      sendMessage: (data) => hlRequest('/conversations/messages', 'POST', null, data)
    },
    calendars: {
      list: () => hlRequest('/calendars', 'GET'),
      getAppointments: (p) => hlRequest('/calendars/events', 'GET', p),
      getFreeSlots: (id, p) => hlRequest('/calendars/' + encodeURIComponent(id) + '/free-slots', 'GET', p)
    }
  };
  console.info('[Genesis] HighLevel Live Preview Client successfully initialized on window.highlevel');
})();
</script>
`.trim();
}
