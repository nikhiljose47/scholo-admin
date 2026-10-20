import { Timestamp } from '@angular/fire/firestore';

export type CenterPublicationStatus = 'draft' | 'published' | 'archived';
export type CenterApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type CenterMemberRole = 'manager' | 'teacher';

/** Public-safe center document — centers/{centerId} */
export interface CenterDoc {
  centerId: string;
  slug: string;
  name: string;
  summary: string;
  city: string;
  countryCode: string;
  offeredSyllabusClassIds: string[];
  publication: CenterPublicationStatus;
  approvalStatus: CenterApprovalStatus;
  schemaVersion: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** Private operations — centers/{centerId}/private/operations */
export interface CenterOperations {
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  capacity?: number;
  advertizedFees?: string;
  operatingHours?: string;
  notes?: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** Private partnership — centers/{centerId}/private/partnership */
export interface CenterPartnership {
  agreementRef?: string;
  partnerSince?: Timestamp;
  revenueSharePercent?: number;
  contractNotes?: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** Center member — centers/{centerId}/members/{uid} */
export interface CenterMember {
  uid: string;
  role: CenterMemberRole;
  addedAt: Timestamp;
  addedBy: string;
  active: boolean;
}

/** Slug reservation — centerSlugs/{slug} */
export interface CenterSlugDoc {
  centerId: string;
  reservedAt: Timestamp;
}

/** Center application — centerApplications/{applicationId} */
export interface CenterApplication {
  applicationId: string;
  applicantUid: string;
  name: string;
  slug: string;
  city: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  notes?: string;
}
