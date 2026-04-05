import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(error.config);
      } catch {
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_user");
          window.location.href = "/";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
};

// ---- Admin: Users ----
export const usersApi = {
  list: () => api.get("/admin/users"),
  create: (data: Record<string, unknown>) => api.post("/admin/users", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/users/${id}`, data),
  delete: (id: string) => api.delete(`/admin/users/${id}`),
  updateProfile: (data: Record<string, unknown>) => api.put("/admin/users/me/profile", data),
  changePassword: (data: { old_password: string; new_password: string }) =>
    api.post("/admin/users/me/password", data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/admin/users/${id}/reset-password`, { new_password: newPassword }),
};

// ---- Admin: Apartments ----
export const apartmentsApi = {
  list: () => api.get("/admin/apartments"),
  get: (id: string) => api.get(`/admin/apartments/${id}`),
  create: (data: Record<string, unknown>) => api.post("/admin/apartments", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/apartments/${id}`, data),
  listWasteBins: () => api.get("/admin/apartments/waste-bins/all"),
  createWasteBin: (data: Record<string, unknown>) => api.post("/admin/apartments/waste-bins", data),
  updateWasteBin: (id: string, data: Record<string, unknown>) => api.put(`/admin/apartments/waste-bins/${id}`, data),
  deleteWasteBin: (id: string) => api.delete(`/admin/apartments/waste-bins/${id}`),
  listTenancies: (aptId: string) => api.get(`/admin/apartments/${aptId}/tenancies`),
  createTenancy: (data: Record<string, unknown>) => api.post("/admin/apartments/tenancies", data),
  updateTenancy: (id: string, data: Record<string, unknown>) => api.put(`/admin/apartments/tenancies/${id}`, data),
  deleteTenancy: (id: string) => api.delete(`/admin/apartments/tenancies/${id}`),
};

// ---- Admin: Documents ----
export const documentsApi = {
  list: (params?: Record<string, unknown>) => api.get("/admin/documents", { params }),
  get: (id: string) => api.get(`/admin/documents/${id}`),
  upload: (formData: FormData) =>
    api.post("/admin/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  createManual: (data: Record<string, unknown>) => api.post("/admin/documents/manual", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/documents/${id}`, data),
  delete: (id: string) => api.delete(`/admin/documents/${id}`),
  downloadUrl: (id: string) => `${API_BASE}/api/v1/admin/documents/${id}/download`,
};

// ---- Admin: KI-Inbox ----
export const kiInboxApi = {
  list: () => api.get("/admin/ki-inbox"),
  count: () => api.get("/admin/ki-inbox/count"),
  get: (id: string) => api.get(`/admin/ki-inbox/${id}`),
  confirm: (id: string, data: Record<string, unknown>) =>
    api.post(`/admin/ki-inbox/${id}/confirm`, data),
  reject: (id: string) => api.post(`/admin/ki-inbox/${id}/reject`),
  reprocess: (id: string) => api.post(`/admin/ki-inbox/${id}/reprocess`),
};

// ---- Admin: Meter Readings ----
export const meterReadingsApi = {
  list: (params?: Record<string, unknown>) => api.get("/admin/meter-readings", { params }),
  create: (data: Record<string, unknown>) => api.post("/admin/meter-readings", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/meter-readings/${id}`, data),
  delete: (id: string) => api.delete(`/admin/meter-readings/${id}`),
  summary: (year: number) => api.get(`/admin/meter-readings/summary/${year}`),
  scanImage: (formData: FormData) =>
    api.post("/admin/meter-readings/scan-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// ---- Admin: Building Settings ----
export const settingsApi = {
  get: () => api.get("/admin/settings"),
  update: (data: Record<string, unknown>) => api.put("/admin/settings", data),
};

// ---- Admin: Billing ----
export const billingApi = {
  list: () => api.get("/admin/billing"),
  preflight: (year: number) => api.get(`/admin/billing/preflight/${year}`),
  calculate: (year: number) => api.post("/admin/billing/calculate", { year }),
  listApartments: (periodId: string) => api.get(`/admin/billing/${periodId}/apartments`),
  generatePdf: (periodId: string, abId: string) =>
    api.post(`/admin/billing/${periodId}/apartments/${abId}/generate-pdf`),
  release: (periodId: string, abId: string) =>
    api.post(`/admin/billing/${periodId}/apartments/${abId}/release`),
  pdfUrl: (periodId: string, abId: string) =>
    `${API_BASE}/api/v1/admin/billing/${periodId}/apartments/${abId}/pdf`,
  years: () => api.get("/admin/billing/years"),
  demoPdfUrl: () => `${API_BASE}/api/v1/admin/billing/demo-pdf`,
  generateReceipt: (periodId: string, abId: string, data: Record<string, unknown>) =>
    api.post(`/admin/billing/${periodId}/apartments/${abId}/receipt`, data, { responseType: "blob" }),
  receiptUrl: (periodId: string, abId: string) =>
    `${API_BASE}/api/v1/admin/billing/${periodId}/apartments/${abId}/receipt`,
};

// ---- Tenant ----
export const tenantApi = {
  listDocuments: (params?: Record<string, unknown>) =>
    api.get("/tenant/documents", { params }),
  downloadDocumentUrl: (id: string) => `${API_BASE}/api/v1/tenant/documents/${id}/download`,
  listBillings: () => api.get("/tenant/billing"),
  getBilling: (id: string) => api.get(`/tenant/billing/${id}`),
  billingPdfUrl: (id: string) => `${API_BASE}/api/v1/tenant/billing/${id}/pdf`,
  receiptUrl: (billingId: string) => `${API_BASE}/api/v1/tenant/billing/${billingId}/receipt`,
};

// ---- Admin: Rental Contracts ----
export const rentalContractsApi = {
  list: () => api.get("/admin/rental-contracts"),
  get: (id: string) => api.get(`/admin/rental-contracts/${id}`),
  create: (data: Record<string, unknown>) => api.post("/admin/rental-contracts", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/rental-contracts/${id}`, data),
  delete: (id: string) => api.delete(`/admin/rental-contracts/${id}`),
  send: (id: string) => api.post(`/admin/rental-contracts/${id}/send`),
  generatePdf: (id: string) => api.post(`/admin/rental-contracts/${id}/generate-pdf`),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/admin/rental-contracts/${id}/pdf`,
  signDirect: (id: string, signature: string) =>
    api.post(`/admin/rental-contracts/${id}/sign-direct`, { signature }),
  landlordSign: (id: string, signature: string) =>
    api.post(`/admin/rental-contracts/${id}/landlord-sign`, { signature }),
  defaultParagraphs: (params: Record<string, string | number>) =>
    api.get("/admin/rental-contracts/default-paragraphs", { params }),
  demoPdf: (data: Record<string, unknown>) =>
    api.post("/admin/rental-contracts/demo-pdf", data, { responseType: "blob" }),
};

// ---- Admin: Apartment Keys ----
export const apartmentKeysApi = {
  list: (apartment_id?: string) =>
    api.get("/admin/apartment-keys", { params: apartment_id ? { apartment_id } : {} }),
  create: (data: Record<string, unknown>) => api.post("/admin/apartment-keys", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/apartment-keys/${id}`, data),
  delete: (id: string) => api.delete(`/admin/apartment-keys/${id}`),
};

// ---- Tenant: Rental Contracts ----
export const tenantRentalContractsApi = {
  list: () => api.get("/tenant/rental-contracts"),
  sign: (id: string, signature: string) =>
    api.post(`/tenant/rental-contracts/${id}/sign`, { signature }),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/tenant/rental-contracts/${id}/pdf`,
};

// ---- Admin: Rent Increases ----
export const rentIncreasesApi = {
  list: () => api.get("/admin/rent-increases"),
  create: (data: Record<string, unknown>) => api.post("/admin/rent-increases", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/rent-increases/${id}`, data),
  delete: (id: string) => api.delete(`/admin/rent-increases/${id}`),
  send: (id: string) => api.post(`/admin/rent-increases/${id}/send`),
  signDirect: (id: string, signature: string) => api.post(`/admin/rent-increases/${id}/sign-direct`, { signature }),
  apply: (id: string) => api.post(`/admin/rent-increases/${id}/apply`),
  generatePdf: (id: string) => api.post(`/admin/rent-increases/${id}/generate-pdf`),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/admin/rent-increases/${id}/pdf`,
};

// ---- Tenant: Rent Increases ----
export const tenantRentIncreasesApi = {
  list: () => api.get("/tenant/rent-increases"),
  sign: (id: string, signature: string) => api.post(`/tenant/rent-increases/${id}/sign`, { signature }),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/tenant/rent-increases/${id}/pdf`,
};

// ---- Admin: House Documents ----
export const houseDocumentsApi = {
  listTemplates: () => api.get("/admin/house-documents/templates"),
  templateDownloadUrl: (filename: string) => `${API_BASE}/api/v1/admin/house-documents/templates/${encodeURIComponent(filename)}/download`,
  getDefaultText: (filename: string) => api.get(`/admin/house-documents/templates/${encodeURIComponent(filename)}/default-text`),
  list: () => api.get("/admin/house-documents"),
  create: (data: Record<string, unknown>) => api.post("/admin/house-documents", data),
  updateText: (id: string, data: { title?: string; document_text?: string }) => api.put(`/admin/house-documents/${id}/text`, data),
  delete: (id: string) => api.delete(`/admin/house-documents/${id}`),
  send: (id: string) => api.post(`/admin/house-documents/${id}/send`),
  signDirect: (id: string, signature: string, documentText?: string) =>
    api.post(`/admin/house-documents/${id}/sign-direct`, { signature, ...(documentText !== undefined && { document_text: documentText }) }),
  landlordSign: (id: string, signature: string) => api.post(`/admin/house-documents/${id}/landlord-sign`, { signature }),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/admin/house-documents/${id}/pdf`,
};

// ---- Tenant: House Documents ----
export const tenantHouseDocumentsApi = {
  list: () => api.get("/tenant/house-documents"),
  sign: (id: string, signature: string, documentText?: string) =>
    api.post(`/tenant/house-documents/${id}/sign`, { signature, ...(documentText !== undefined && { document_text: documentText }) }),
  pdfUrl: (id: string) => `${API_BASE}/api/v1/tenant/house-documents/${id}/pdf`,
  odtUrl: (id: string) => `${API_BASE}/api/v1/tenant/house-documents/${id}/odt`,
};
