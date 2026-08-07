/**
 * Hand-written stand-in for webmakerlatam.com's `shared/schema.ts`.
 *
 * This is NOT a database schema — there are no drizzle tables here and this
 * file must never be swept into a drizzle-kit push/migration. It exists only
 * so the ported wmc/* pages (which import `type { X } from "@shared/schema"`
 * unmodified, exactly as exported from the source project) resolve to plain
 * TypeScript shapes describing the JSON the origin's `/api/service/*`
 * endpoints return. webmakerlatam.com remains the sole owner of the real
 * schema, migrations, and business logic for all of these entities.
 *
 * Field names/types are transcribed from the source project's real
 * shared/schema.ts (via its drizzle `pgTable` column defs) at export time
 * (2026-08-07). Timestamp fields are typed `Date` to match what drizzle's
 * `$inferSelect` produces on the source, which is what the ported pages were
 * originally type-checked against — even though, like the original app, the
 * actual value arriving over JSON is an ISO string until consumers new Date() it.
 */

export type ProposalStatus = "DRAFT" | "SENT" | "VIEWED" | "APPROVED" | "REJECTED" | "EXPIRED";
export type ProjectStatus = "MOCKUP" | "DEVELOPMENT" | "QA" | "DELIVERY" | "COMPLETED";
export type PaymentModality = "STANDARD" | "MILESTONES" | "FULL_ADVANCE" | "INSTALLMENTS" | "CUSTOM";
export type MaintenanceType = "NONE" | "TO_BE_DEFINED" | "CUSTOM";
export type AgreementStatus = "DRAFT" | "PENDING_SIGNATURE" | "SIGNED" | "EXPIRED";
export type SignatureType = "DRAWN" | "UPLOAD" | "TYPED";
export type AddonStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
export type PaymentMethod = "TRANSFERENCIA" | "EFECTIVO" | "TARJETA" | "OTRO";
export type AgreementTemplateType = "LANDING_PAGE" | "WEBSITE" | "ECOMMERCE" | "WEB_APP" | "MOBILE_APP" | "CUSTOM";

export interface Client {
  id: string;
  companyName: string;
  rut: string | null;
  billingRut: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  closerId: string | null;
  createdAt: Date;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  costPrice: number;
  isCustomizable: number | null;
}

export interface Proposal {
  id: string;
  clientId: string;
  status: ProposalStatus;
  tokenUrl: string | null;
  subtotal: number;
  iva: number;
  total: number;
  hasIVA: number;
  paymentModality: PaymentModality;
  installmentCount: number | null;
  customPaymentTerms: string | null;
  maintenanceType: MaintenanceType | null;
  monthlyMaintenance: number;
  discount: number;
  couponId: string | null;
  notes: string | null;
  validUntil: Date | null;
  includeContract: number;
  closerId: string | null;
  marginPercent: number;
  marginTier: string;
  closerCommissionRate: number;
  closerCommission: number;
  createdAt: Date;
  updatedAt: Date;
  /** Computed field added by the origin's list endpoint, not a DB column. */
  serviceCount?: number;
}

export interface ProposalItem {
  id: string;
  proposalId: string;
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Developer {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  salary: number;
  isActive: number;
  createdAt: Date;
}

export interface Project {
  id: string;
  proposalId: string | null;
  clientId: string;
  name: string;
  status: ProjectStatus;
  repositoryUrl: string | null;
  totalValue: number;
  monthlyMaintenance: number;
  assignedDeveloperId: string | null;
  developerPayment: number;
  aiCostBudget: number;
  deadlineDays: number;
  deadlineStartDate: Date | null;
  driveFolderUrl: string | null;
  createdAt: Date;
}

export interface Task {
  id: string;
  projectId: string;
  assignedTo: string | null;
  proposalItemId: string | null;
  title: string;
  description: string | null;
  status: string;
  phase: ProjectStatus;
  weight: number;
  visibleToClient: number;
  freelancerCost: number | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ProjectLog {
  id: string;
  projectId: string;
  title: string;
  content: string;
  phase: ProjectStatus;
  imageUrls: string[] | null;
  videoUrls: string[] | null;
  createdAt: Date;
}

export interface Payment {
  id: string;
  projectId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string | null;
  hasIVA: number;
  paymentDate: Date;
  createdAt: Date;
}

export interface Coupon {
  id: string;
  code: string;
  name: string | null;
  discountPercent: number;
  discountAmount: number | null;
  eventType: string | null;
  isPromotion: number;
  maxUses: number | null;
  usageCount: number;
  issuedToClientId: string | null;
  issuedFromProjectId: string | null;
  usedByClientId: string | null;
  usedOnProposalId: string | null;
  usedOnProjectId: string | null;
  includesFreeMeeting: number;
  isUsed: number;
  originalDocumentUrl: string | null;
  validFrom: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AgreementTemplate {
  id: string;
  name: string;
  templateType: AgreementTemplateType;
  content: string;
  isDefault: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceAgreement {
  id: string;
  proposalId: string;
  templateId: string | null;
  tokenUrl: string;
  status: AgreementStatus;
  clientCompanyName: string;
  clientRut: string | null;
  clientRepresentativeName: string;
  clientRepresentativeRut: string | null;
  content: string;
  signedAt: Date | null;
  signedByName: string | null;
  signedByEmail: string | null;
  signedByIp: string | null;
  signatureType: SignatureType | null;
  signatureData: string | null;
  signatureImageUrl: string | null;
  signedPdfUrl: string | null;
  validUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectAddon {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  subtotal: number;
  iva: number;
  total: number;
  hasIVA: number;
  contractContent: string | null;
  status: AddonStatus;
  tokenUrl: string | null;
  clientNote: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  paidAt: Date | null;
}

export interface ProjectAddonItem {
  id: string;
  addonId: string;
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  ivaRate: number;
  emailNotifications: number;
  whatsappNotifications: number;
  updatedAt: Date;
}
