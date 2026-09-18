/**
 * High-Fidelity Sandbox Mock Service for HighLevel CRM APIs
 *
 * Implements compliant mock data structures matching the official HighLevel API v2:
 * - Contacts API (List, Search, Get, Create, Update, Pagination via startAfterId)
 * - Conversations API (Search/List, Thread Messages, Send Message)
 * - Calendars API (List Calendars, Events/Appointments Range Query, Free Slots)
 *
 * Scoped per locationId to ensure multi-tenant isolation during testing and reviewer evaluation.
 */

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
  lastMessageDate: number; // Unix timestamp ms
}

export interface HighLevelMessage {
  id: string;
  conversationId: string;
  contactId: string;
  locationId: string;
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
  slotDuration: number; // minutes
  slotInterval: number; // minutes
  isActive: boolean;
}

export interface HighLevelCalendarEvent {
  id: string;
  calendarId: string;
  locationId: string;
  contactId: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  status: "confirmed" | "cancelled" | "showed" | "noshow";
  contact: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

interface LocationMockStore {
  contacts: HighLevelContact[];
  conversations: HighLevelConversation[];
  messages: Map<string, HighLevelMessage[]>; // conversationId -> messages[]
  calendars: HighLevelCalendar[];
  events: HighLevelCalendarEvent[];
}

const locationStores = new Map<string, LocationMockStore>();

/**
 * Generates initial seed data for a given locationId
 */
function createSeedData(locationId: string): LocationMockStore {
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];

  const contacts: HighLevelContact[] = [
    {
      id: "contact_001",
      locationId,
      firstName: "John",
      lastName: "Doe",
      name: "John Doe",
      email: "john.doe@acmehealth.com",
      phone: "+15551234567",
      tags: ["lead", "interested", "web-inquiry"],
      type: "lead",
      companyName: "Acme Health",
      dateAdded: new Date(Date.now() - 14 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "contact_002",
      locationId,
      firstName: "Sarah",
      lastName: "Connor",
      name: "Sarah Connor",
      email: "sarah.connor@cyberdyne.org",
      phone: "+15552345678",
      tags: ["customer", "vip", "enterprise"],
      type: "customer",
      companyName: "Cyberdyne Systems",
      dateAdded: new Date(Date.now() - 30 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "contact_003",
      locationId,
      firstName: "Michael",
      lastName: "Scott",
      name: "Michael Scott",
      email: "mscott@dundermifflin.com",
      phone: "+15553456789",
      tags: ["lead", "demo-scheduled"],
      type: "lead",
      companyName: "Dunder Mifflin Paper",
      dateAdded: new Date(Date.now() - 5 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "contact_004",
      locationId,
      firstName: "Alex",
      lastName: "Morgan",
      name: "Alex Morgan",
      email: "alex.morgan@sportstech.io",
      phone: "+15554567890",
      tags: ["customer", "renewal"],
      type: "customer",
      companyName: "SportsTech Group",
      dateAdded: new Date(Date.now() - 60 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      id: "contact_005",
      locationId,
      firstName: "Emily",
      lastName: "Chen",
      name: "Emily Chen",
      email: "emily.chen@solardynamics.net",
      phone: "+15555678901",
      tags: ["lead", "web-form"],
      type: "lead",
      companyName: "Solar Dynamics",
      dateAdded: new Date(Date.now() - 8 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: "contact_006",
      locationId,
      firstName: "David",
      lastName: "Miller",
      name: "David Miller",
      email: "dmiller@apexlogistics.com",
      phone: "+15556789012",
      tags: ["partner", "carrier"],
      type: "customer",
      companyName: "Apex Logistics",
      dateAdded: new Date(Date.now() - 45 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: "contact_007",
      locationId,
      firstName: "Lisa",
      lastName: "Ray",
      name: "Lisa Ray",
      email: "lisa.ray@quantumfin.io",
      phone: "+15557890123",
      tags: ["customer", "onboarding"],
      type: "customer",
      companyName: "Quantum Financial",
      dateAdded: new Date(Date.now() - 10 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "contact_008",
      locationId,
      firstName: "Robert",
      lastName: "Johnson",
      name: "Robert Johnson",
      email: "rjohnson@summitcapital.com",
      phone: "+15558901234",
      tags: ["lead", "pricing-inquiry"],
      type: "lead",
      companyName: "Summit Capital Partners",
      dateAdded: new Date(Date.now() - 3 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "contact_009",
      locationId,
      firstName: "Jessica",
      lastName: "Pearson",
      name: "Jessica Pearson",
      email: "jpearson@pearsonhardman.com",
      phone: "+15559012345",
      tags: ["customer", "enterprise", "legal"],
      type: "customer",
      companyName: "Pearson Specter Litt",
      dateAdded: new Date(Date.now() - 90 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: "contact_010",
      locationId,
      firstName: "Harvey",
      lastName: "Specter",
      name: "Harvey Specter",
      email: "harvey@pearsonhardman.com",
      phone: "+15550123456",
      tags: ["customer", "vip", "dealmaker"],
      type: "customer",
      companyName: "Pearson Specter Litt",
      dateAdded: new Date(Date.now() - 85 * 86400000).toISOString(),
      dateUpdated: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  ];

  const conversations: HighLevelConversation[] = [
    {
      id: "conv_001",
      contactId: "contact_001",
      locationId,
      contactName: "John Doe",
      email: "john.doe@acmehealth.com",
      phone: "+15551234567",
      unreadCount: 1,
      lastMessageBody: "Hi, I would like to schedule a demo of your CRM builder.",
      lastMessageType: "TYPE_SMS",
      lastMessageDate: Date.now() - 3600000,
    },
    {
      id: "conv_002",
      contactId: "contact_002",
      locationId,
      contactName: "Sarah Connor",
      email: "sarah.connor@cyberdyne.org",
      phone: "+15552345678",
      unreadCount: 0,
      lastMessageBody: "The new automation pipeline is working as expected. Thank you!",
      lastMessageType: "TYPE_EMAIL",
      lastMessageDate: Date.now() - 7200000,
    },
    {
      id: "conv_003",
      contactId: "contact_003",
      locationId,
      contactName: "Michael Scott",
      email: "mscott@dundermifflin.com",
      phone: "+15553456789",
      unreadCount: 2,
      lastMessageBody: "Can we add 5 more paper sales reps to our calendar tomorrow?",
      lastMessageType: "TYPE_SMS",
      lastMessageDate: Date.now() - 14400000,
    },
    {
      id: "conv_004",
      contactId: "contact_004",
      locationId,
      contactName: "Alex Morgan",
      email: "alex.morgan@sportstech.io",
      phone: "+15554567890",
      unreadCount: 0,
      lastMessageBody: "Invoice paid. Looking forward to our next quarterly review.",
      lastMessageType: "TYPE_EMAIL",
      lastMessageDate: Date.now() - 86400000,
    },
    {
      id: "conv_005",
      contactId: "contact_005",
      locationId,
      contactName: "Emily Chen",
      email: "emily.chen@solardynamics.net",
      phone: "+15555678901",
      unreadCount: 0,
      lastMessageBody: "Sounds good, see you on Tuesday at 11 AM.",
      lastMessageType: "TYPE_SMS",
      lastMessageDate: Date.now() - 172800000,
    },
  ];

  const messagesMap = new Map<string, HighLevelMessage[]>();

  messagesMap.set("conv_001", [
    {
      id: "msg_001_1",
      conversationId: "conv_001",
      contactId: "contact_001",
      locationId,
      body: "Hi, I would like to schedule a demo of your CRM builder.",
      messageType: "SMS",
      direction: "inbound",
      status: "delivered",
      dateAdded: new Date(Date.now() - 3600000).toISOString(),
    },
  ]);

  messagesMap.set("conv_002", [
    {
      id: "msg_002_1",
      conversationId: "conv_002",
      contactId: "contact_002",
      locationId,
      body: "Could you send over the updated SLA documentation?",
      messageType: "Email",
      direction: "inbound",
      status: "delivered",
      dateAdded: new Date(Date.now() - 14400000).toISOString(),
    },
    {
      id: "msg_002_2",
      conversationId: "conv_002",
      contactId: "contact_002",
      locationId,
      body: "Sent! Let us know if you need any adjustments.",
      messageType: "Email",
      direction: "outbound",
      status: "delivered",
      dateAdded: new Date(Date.now() - 10800000).toISOString(),
    },
    {
      id: "conv_002_3",
      conversationId: "conv_002",
      contactId: "contact_002",
      locationId,
      body: "The new automation pipeline is working as expected. Thank you!",
      messageType: "Email",
      direction: "inbound",
      status: "delivered",
      dateAdded: new Date(Date.now() - 7200000).toISOString(),
    },
  ]);

  messagesMap.set("conv_003", [
    {
      id: "msg_003_1",
      conversationId: "conv_003",
      contactId: "contact_003",
      locationId,
      body: "Can we add 5 more paper sales reps to our calendar tomorrow?",
      messageType: "SMS",
      direction: "inbound",
      status: "delivered",
      dateAdded: new Date(Date.now() - 14400000).toISOString(),
    },
  ]);

  const calendars: HighLevelCalendar[] = [
    {
      id: "cal_demo_001",
      locationId,
      name: "Product Demo & Strategy Session",
      description: "30-minute discovery and interactive architecture demo.",
      slotDuration: 30,
      slotInterval: 30,
      isActive: true,
    },
    {
      id: "cal_onboard_002",
      locationId,
      name: "Customer Onboarding & Setup",
      description: "45-minute technical configuration and workflow walkthrough.",
      slotDuration: 45,
      slotInterval: 45,
      isActive: true,
    },
    {
      id: "cal_tech_003",
      locationId,
      name: "Technical Support Consultation",
      description: "30-minute deep-dive troubleshooting session.",
      slotDuration: 30,
      slotInterval: 30,
      isActive: true,
    },
  ];

  const events: HighLevelCalendarEvent[] = [
    {
      id: "event_001",
      calendarId: "cal_demo_001",
      locationId,
      contactId: "contact_001",
      title: "Genesis App Builder Demo — John Doe",
      startTime: `${todayIso}T14:00:00Z`,
      endTime: `${todayIso}T14:30:00Z`,
      status: "confirmed",
      contact: {
        id: "contact_001",
        name: "John Doe",
        email: "john.doe@acmehealth.com",
        phone: "+15551234567",
      },
    },
    {
      id: "event_002",
      calendarId: "cal_onboard_002",
      locationId,
      contactId: "contact_002",
      title: "Cyberdyne Systems Onboarding — Sarah Connor",
      startTime: `${todayIso}T16:00:00Z`,
      endTime: `${todayIso}T16:45:00Z`,
      status: "confirmed",
      contact: {
        id: "contact_002",
        name: "Sarah Connor",
        email: "sarah.connor@cyberdyne.org",
        phone: "+15552345678",
      },
    },
    {
      id: "event_003",
      calendarId: "cal_demo_001",
      locationId,
      contactId: "contact_003",
      title: "Dunder Mifflin CRM Review — Michael Scott",
      startTime: new Date(Date.now() + 86400000).toISOString().split("T")[0] + "T10:00:00Z",
      endTime: new Date(Date.now() + 86400000).toISOString().split("T")[0] + "T10:30:00Z",
      status: "confirmed",
      contact: {
        id: "contact_003",
        name: "Michael Scott",
        email: "mscott@dundermifflin.com",
        phone: "+15553456789",
      },
    },
    {
      id: "event_004",
      calendarId: "cal_tech_003",
      locationId,
      contactId: "contact_007",
      title: "Quantum Financial Integration Review — Lisa Ray",
      startTime: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0] + "T15:00:00Z",
      endTime: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0] + "T15:30:00Z",
      status: "confirmed",
      contact: {
        id: "contact_007",
        name: "Lisa Ray",
        email: "lisa.ray@quantumfin.io",
        phone: "+15557890123",
      },
    },
  ];

  return { contacts, conversations, messages: messagesMap, calendars, events };
}

/**
 * Returns or initializes the isolated mock store for a specific locationId
 */
export function getStore(locationId: string): LocationMockStore {
  const loc = locationId || "sandbox-location-genesis";
  let store = locationStores.get(loc);
  if (!store) {
    store = createSeedData(loc);
    locationStores.set(loc, store);
  }
  return store;
}

/**
 * Reset mock data for a location or all locations (useful for automated testing)
 */
export function resetMockStore(locationId?: string) {
  if (locationId) {
    locationStores.delete(locationId);
  } else {
    locationStores.clear();
  }
}

// ==========================================
// CONTACTS MOCK HANDLERS
// ==========================================

export function listContacts(
  locationId: string,
  params: { query?: string; limit?: number | string; startAfterId?: string }
) {
  const store = getStore(locationId);
  let filtered = [...store.contacts];

  // Search query filtering
  if (params.query && typeof params.query === "string" && params.query.trim().length > 0) {
    const q = params.query.trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Pagination via startAfterId
  let startIndex = 0;
  if (params.startAfterId) {
    const idx = filtered.findIndex((c) => c.id === params.startAfterId);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }

  const limitNum = Math.min(Math.max(parseInt(String(params.limit || 20), 10) || 20, 1), 100);
  const sliced = filtered.slice(startIndex, startIndex + limitNum);
  const nextItem = filtered[startIndex + limitNum];

  return {
    contacts: sliced,
    total: filtered.length,
    meta: {
      total: filtered.length,
      startAfterId: sliced.length > 0 ? sliced[sliced.length - 1].id : null,
      nextStartAfterId: nextItem ? nextItem.id : null,
      limit: limitNum,
      hasMore: startIndex + limitNum < filtered.length,
    },
  };
}

export function getContact(locationId: string, contactId: string) {
  const store = getStore(locationId);
  const contact = store.contacts.find((c) => c.id === contactId);
  if (!contact) {
    return null;
  }
  return { contact };
}

export function createContact(locationId: string, data: Partial<HighLevelContact>) {
  const store = getStore(locationId);
  const firstName = data.firstName || "New";
  const lastName = data.lastName || "Contact";
  const fullName = `${firstName} ${lastName}`.trim();
  const id = `contact_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const nowIso = new Date().toISOString();

  const newContact: HighLevelContact = {
    id,
    locationId,
    firstName,
    lastName,
    name: fullName,
    email: data.email || `${id}@example.com`,
    phone: data.phone || "+15550000000",
    tags: Array.isArray(data.tags) ? data.tags : ["lead"],
    type: data.type === "customer" ? "customer" : "lead",
    companyName: data.companyName || "",
    dateAdded: nowIso,
    dateUpdated: nowIso,
    customFields: data.customFields || [],
  };

  store.contacts.unshift(newContact);
  return { contact: newContact };
}

export function updateContact(locationId: string, contactId: string, data: Partial<HighLevelContact>) {
  const store = getStore(locationId);
  const index = store.contacts.findIndex((c) => c.id === contactId);
  if (index === -1) {
    return null;
  }

  const existing = store.contacts[index];
  const updated: HighLevelContact = {
    ...existing,
    ...data,
    id: existing.id,
    locationId: existing.locationId,
    name:
      data.firstName || data.lastName
        ? `${data.firstName || existing.firstName} ${data.lastName || existing.lastName}`.trim()
        : existing.name,
    dateUpdated: new Date().toISOString(),
  };

  store.contacts[index] = updated;
  return { contact: updated };
}

// ==========================================
// CONVERSATIONS MOCK HANDLERS
// ==========================================

export function listConversations(
  locationId: string,
  params: { query?: string; limit?: number | string; startAfterId?: string }
) {
  const store = getStore(locationId);
  let list = [...store.conversations];

  if (params.query && typeof params.query === "string") {
    const q = params.query.toLowerCase();
    list = list.filter(
      (conv) =>
        conv.contactName.toLowerCase().includes(q) ||
        conv.lastMessageBody.toLowerCase().includes(q) ||
        conv.email.toLowerCase().includes(q)
    );
  }

  let startIndex = 0;
  if (params.startAfterId) {
    const idx = list.findIndex((c) => c.id === params.startAfterId);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }

  const limitNum = Math.min(Math.max(parseInt(String(params.limit || 20), 10) || 20, 1), 100);
  const sliced = list.slice(startIndex, startIndex + limitNum);

  return {
    conversations: sliced,
    total: list.length,
    meta: {
      total: list.length,
      startAfterId: sliced.length > 0 ? sliced[sliced.length - 1].id : null,
      hasMore: startIndex + limitNum < list.length,
    },
  };
}

export function getConversationMessages(
  locationId: string,
  conversationId: string,
  _params?: { limit?: number | string }
) {
  const store = getStore(locationId);
  const messages = store.messages.get(conversationId) || [];

  return {
    messages: {
      messages: [...messages],
      lastMessageId: messages.length > 0 ? messages[messages.length - 1].id : null,
      nextPage: false,
    },
  };
}

export function sendMessage(
  locationId: string,
  payload: {
    conversationId?: string;
    contactId?: string;
    message?: string;
    type?: string;
    body?: string;
  }
) {
  const store = getStore(locationId);
  const text = payload.message || payload.body || "Hello!";
  let conversationId = payload.conversationId;

  // If conversationId is missing but contactId is provided, lookup or create conversation
  if (!conversationId && payload.contactId) {
    const existing = store.conversations.find((c) => c.contactId === payload.contactId);
    if (existing) {
      conversationId = existing.id;
    } else {
      const contact = store.contacts.find((c) => c.id === payload.contactId);
      const newConvId = `conv_${Date.now().toString(36)}`;
      const newConv: HighLevelConversation = {
        id: newConvId,
        contactId: payload.contactId,
        locationId,
        contactName: contact ? contact.name : "Unknown Contact",
        email: contact ? contact.email : "",
        phone: contact ? contact.phone : "",
        unreadCount: 0,
        lastMessageBody: text,
        lastMessageType: (payload.type?.toUpperCase() === "EMAIL" ? "TYPE_EMAIL" : "TYPE_SMS"),
        lastMessageDate: Date.now(),
      };
      store.conversations.unshift(newConv);
      conversationId = newConvId;
    }
  }

  if (!conversationId) {
    conversationId = "conv_001";
  }

  const msgId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const newMsg: HighLevelMessage = {
    id: msgId,
    conversationId,
    contactId: payload.contactId || "contact_001",
    locationId,
    body: text,
    messageType: payload.type?.toUpperCase() === "EMAIL" ? "Email" : "SMS",
    direction: "outbound",
    status: "delivered",
    dateAdded: new Date().toISOString(),
  };

  let thread = store.messages.get(conversationId);
  if (!thread) {
    thread = [];
    store.messages.set(conversationId, thread);
  }
  thread.push(newMsg);

  // Update parent conversation
  const conv = store.conversations.find((c) => c.id === conversationId);
  if (conv) {
    conv.lastMessageBody = text;
    conv.lastMessageType = newMsg.messageType === "Email" ? "TYPE_EMAIL" : "TYPE_SMS";
    conv.lastMessageDate = Date.now();
  }

  return {
    messageId: msgId,
    conversationId,
    status: "delivered",
    message: newMsg,
  };
}

// ==========================================
// CALENDARS MOCK HANDLERS
// ==========================================

export function listCalendars(locationId: string) {
  const store = getStore(locationId);
  return {
    calendars: store.calendars,
  };
}

export function getCalendarEvents(
  locationId: string,
  params: { calendarId?: string; startTime?: string; endTime?: string }
) {
  const store = getStore(locationId);
  let events = [...store.events];

  if (params.calendarId) {
    events = events.filter((e) => e.calendarId === params.calendarId);
  }

  if (params.startTime) {
    const start = new Date(params.startTime).getTime();
    if (!isNaN(start)) {
      events = events.filter((e) => new Date(e.endTime).getTime() >= start);
    }
  }

  if (params.endTime) {
    const end = new Date(params.endTime).getTime();
    if (!isNaN(end)) {
      events = events.filter((e) => new Date(e.startTime).getTime() <= end);
    }
  }

  return {
    events,
  };
}

export function getFreeSlots(
  _locationId: string,
  _calendarId: string,
  params: { startDate?: string; endDate?: string }
) {
  const startDateStr = params.startDate || new Date().toISOString().split("T")[0];
  const slotsObj: Record<string, { slots: string[] }> = {};

  // Generate 3 sample morning & afternoon slots for the given date
  slotsObj[startDateStr] = {
    slots: [
      `${startDateStr}T09:00:00+00:00`,
      `${startDateStr}T10:30:00+00:00`,
      `${startDateStr}T13:00:00+00:00`,
      `${startDateStr}T14:30:00+00:00`,
      `${startDateStr}T16:00:00+00:00`,
    ],
  };

  return slotsObj;
}

// ==========================================
// UNIFIED ROUTER FOR SANDBOX REQUESTS
// ==========================================

export interface SandboxResponse {
  statusCode: number;
  data: unknown;
}

/**
 * Dispatches simulated HighLevel REST requests to the sandbox engine
 */
export function handleSandboxRequest(
  locationId: string,
  method: string,
  normalizedPath: string,
  query: Record<string, unknown>,
  body: Record<string, unknown>
): SandboxResponse {
  const upperMethod = method.toUpperCase();
  const cleanPath = normalizedPath.replace(/\/+$/, "") || "/";

  // 1. CONTACTS ROUTES
  // GET /contacts or /contacts/
  if (cleanPath === "/contacts" || cleanPath === "") {
    if (upperMethod === "GET") {
      const result = listContacts(locationId, query as Parameters<typeof listContacts>[1]);
      return { statusCode: 200, data: result };
    }
    if (upperMethod === "POST") {
      const result = createContact(locationId, body as Partial<HighLevelContact>);
      return { statusCode: 201, data: result };
    }
  }

  // GET or PUT /contacts/:id
  const contactIdMatch = cleanPath.match(/^\/contacts\/([^/]+)$/);
  if (contactIdMatch) {
    const contactId = contactIdMatch[1];
    if (upperMethod === "GET") {
      const result = getContact(locationId, contactId);
      if (!result) {
        return { statusCode: 404, data: { error: `Contact ${contactId} not found.` } };
      }
      return { statusCode: 200, data: result };
    }
    if (upperMethod === "PUT" || upperMethod === "POST") {
      const result = updateContact(locationId, contactId, body as Partial<HighLevelContact>);
      if (!result) {
        return { statusCode: 404, data: { error: `Contact ${contactId} not found.` } };
      }
      return { statusCode: 200, data: result };
    }
  }

  // 2. CONVERSATIONS ROUTES
  // GET /conversations or /conversations/search
  if (cleanPath === "/conversations" || cleanPath === "/conversations/search") {
    if (upperMethod === "GET") {
      const result = listConversations(locationId, query as Parameters<typeof listConversations>[1]);
      return { statusCode: 200, data: result };
    }
  }

  // GET /conversations/:id/messages
  const convMessagesMatch = cleanPath.match(/^\/conversations\/([^/]+)\/messages$/);
  if (convMessagesMatch) {
    const conversationId = convMessagesMatch[1];
    if (upperMethod === "GET") {
      const result = getConversationMessages(locationId, conversationId, query);
      return { statusCode: 200, data: result };
    }
  }

  // POST /conversations/messages
  if (cleanPath === "/conversations/messages") {
    if (upperMethod === "POST") {
      const result = sendMessage(locationId, body as Parameters<typeof sendMessage>[1]);
      return { statusCode: 200, data: result };
    }
  }

  // 3. CALENDARS ROUTES
  // GET /calendars
  if (cleanPath === "/calendars") {
    if (upperMethod === "GET") {
      const result = listCalendars(locationId);
      return { statusCode: 200, data: result };
    }
  }

  // GET /calendars/events
  if (cleanPath === "/calendars/events") {
    if (upperMethod === "GET") {
      const result = getCalendarEvents(locationId, query as Parameters<typeof getCalendarEvents>[1]);
      return { statusCode: 200, data: result };
    }
  }

  // GET /calendars/:id/free-slots
  const freeSlotsMatch = cleanPath.match(/^\/calendars\/([^/]+)\/free-slots$/);
  if (freeSlotsMatch) {
    const calendarId = freeSlotsMatch[1];
    if (upperMethod === "GET") {
      const result = getFreeSlots(locationId, calendarId, query as Parameters<typeof getFreeSlots>[2]);
      return { statusCode: 200, data: result };
    }
  }

  // Fallback for unhandled sandbox route
  return {
    statusCode: 404,
    data: {
      error: `Endpoint '${cleanPath}' with method '${upperMethod}' is not supported in HighLevel Sandbox mock mode.`,
      supportedEndpoints: [
        "GET /contacts",
        "POST /contacts",
        "GET /contacts/:id",
        "PUT /contacts/:id",
        "GET /conversations",
        "GET /conversations/:id/messages",
        "POST /conversations/messages",
        "GET /calendars",
        "GET /calendars/events",
        "GET /calendars/:id/free-slots",
      ],
    },
  };
}
