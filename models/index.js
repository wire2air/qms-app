import { ApiKey } from './apiKey'
import { Workflow } from './workflow'
import { WorkflowInstance } from './workflowInstance'
import { WorkflowInstanceStatus } from './workflowInstanceStatus'
import { WorkflowInstanceStep } from './workflowInstanceStep'
import { WorkflowInstanceStepStatus } from './workflowInstanceStepStatus'
import { WorkflowInstanceStepUserStatus } from './workflowInstanceStepUserStatus'
import { WorkflowStatus } from './workflowStatus'
import { WorkflowStep } from './workflowStep'
import { WorkflowStepOutcome } from './workflowStepOutcome'
import { WorkflowStepRole } from './workflowStepRole'
import { WorkflowStepUser } from './workflowStepUser'
import { AllowedOutcomeOnStep } from './allowedOutcomeOnStep'
import { StepSendBackTarget } from './stepSendBackTarget'
import { WorkflowVersion } from './workflowVersion'
import { WorkflowVersionStatus } from './workflowVersionStatus'
import { Asset } from './asset'
import { AssetRequest } from './assetRequest'
import { AssetRequestItem } from './assetRequestItem'
import { AssetRequestOnContact } from './assetRequestOnContact'
import { AssetRequestOnUser } from './assetRequestOnUser'
import { EsignAgreement } from './esignAgreement'
import { EsignAgreementSigner } from './esignAgreementSigner'
import { Specification } from './specification'
import { SpecificationCharacteristic } from './specificationCharacteristic'
import { InspectionLot } from './inspectionLot'
import { InspectionResult } from './inspectionResult'
import { InspectionDefect } from './inspectionDefect'
import { DefectCatalog } from './defectCatalog'
import { SamplingStandard } from './samplingStandard'
import { SamplingPlanTable } from './samplingPlanTable'
import { SampleSizeCodeLetter } from './sampleSizeCodeLetter'
import { SamplingPlan } from './samplingPlan'
import { QcInspectionTemplate } from './qcInspectionTemplate'
import { AssetRequestStatus } from './assetRequestStatus'
import { AssetRequestType } from './assetRequestType'
import { AuditLog } from './auditLog'
import { Comment } from './comment'
import { Company } from './company'
import { Department } from './department'
import { Document } from './document'
import { DocumentCounter } from './documentCounter'
import { DocumentLink } from './documentLink'
import { DocumentSection } from './documentSection'
import { DocumentStatus } from './documentStatus'
import { DocumentTemplate } from './documentTemplate'
import { DocumentTemplateStatus } from './documentTemplateStatus'
import { DocumentType } from './documentType'
import { DocumentVersion } from './documentVersion'
import { DocumentVersionStatus } from './documentVersionStatus'
import { FormStatus } from './formStatus'
import { FormTemplate } from './formTemplate'
import { Module } from './module'
import { Notification } from './notification'
import { NotificationType } from './notificationType'
import { OptionSet } from './optionSet'
import { Permission } from './permission'
import { PermissionOnRole } from './permissionOnRole'
import { Product } from './product'
import { ProductFamily } from './productFamily'
import { ProductStatus } from './productStatus'
import { ProductType } from './productType'
import { Record } from './record'
import { RecordCounter } from './recordCounter'
import { RecordStatus } from './recordStatus'
import { RelatedStandard } from './relatedStandard'
import { RiskLevel } from './riskLevel'
import { Role } from './role'
import { RoleOnUser } from './roleOnUser'
import { RoleOnWorkflowInstanceStep } from './roleOnWorkflowInstanceStep'
import { RoleStatus } from './roleStatus'
import { Site } from './site'
import { SiteOnTemplate } from './siteOnTemplate'
import { Supplier } from './supplier'
import { SupplierAsset } from './supplierAsset'
import { SupplierCertificateType } from './supplierCertificateType'
import { SupplierContact } from './supplierContact'
import { SupplierDocument } from './supplierDocument'
import { SupplierLocation } from './supplierLocation'
import { SupplierOnSite } from './supplierOnSite'
import { SupplierStatus } from './supplierStatus'
import { TaskInstance } from './taskInstance'
import { TaskInstanceStatus } from './taskInstanceStatus'
import { TaskKind } from './taskKind'
import { TaskPriority } from './taskPriority'
import { Team } from './team'
import { User } from './user'
import { UserOnWorkflowInstanceStep } from './userOnWorkflowInstanceStep'
import { UserOnDocument } from './userOnDocument'
import { UserOnTeam } from './userOnTeam'
import { UserStatus } from './userStatus'
import { Nonconformance } from './nonconformance'
import { NcCounter } from './ncCounter'
import { NcStatus } from './ncStatus'
import { NcType } from './ncType'
import { NcSeverity } from './ncSeverity'
import { NcSource } from './ncSource'
import { NcIssueType } from './ncIssueType'
import { NcDispositionType } from './ncDispositionType'
import { NcRootCauseCategory } from './ncRootCauseCategory'
import { NcRecord } from './ncRecord'
import { Capa } from './capa'
import { CustomerComplaint } from './customerComplaint'
import { CustomerComplaintStatus } from './customerComplaintStatus'
import { CustomerComplaintSource } from './customerComplaintSource'
import { CustomerComplaintMessage } from './customerComplaintMessage'
import { CustomerComplaintAttachment } from './customerComplaintAttachment'
import { NcSourceLink } from './ncSourceLink'
import { ComplaintCannedResponse } from './complaintCannedResponse'
import { ExternalTicketLink } from './externalTicketLink'
import { IntegrationSyncEvent } from './integrationSyncEvent'
import { Customer } from './customer'
import { CustomerOrganization } from './customerOrganization'
import { CapaCounter } from './capaCounter'
import { CapaStatus } from './capaStatus'
import { CapaType } from './capaType'
import { CapaSource } from './capaSource'
import { CapaPriority } from './capaPriority'
import { CapaRecord } from './capaRecord'
import { CapaEffectivenessCheck } from './capaEffectivenessCheck'
import { CapaEffectivenessCheckStatus } from './capaEffectivenessCheckStatus'
import { RcaTemplate } from './rcaTemplate'
import { RiskAssessmentTemplate } from './riskAssessmentTemplate'
import { RootCauseCategory } from './rootCauseCategory'
import { RootCause } from './rootCause'
import { HazardCategory } from './hazardCategory'
import { RiskAssessment } from './riskAssessment'
// Audit Management (Phase A foundation)
import { AuditStandardType } from './auditStandardType'
import { AuditFindingCategory } from './auditFindingCategory'
import { AuditStandard } from './auditStandard'
import { AuditStandardVersion } from './auditStandardVersion'
import { AuditRequirement } from './auditRequirement'
import { AuditProgram } from './auditProgram'
import { AuditProgramAuditor } from './auditProgramAuditor'
import { AuditInstance } from './auditInstance'
import { AuditTeamMember } from './auditTeamMember'
import { AuditRequirementResponse } from './auditRequirementResponse'
import { AuditRecord } from './auditRecord'
import { AuditFinding } from './auditFinding'
import { AuditEvidence } from './auditEvidence'
import { AuditEvidenceLink } from './auditEvidenceLink'
import { AuditDocumentRequest } from './auditDocumentRequest'
import { AuditCounter } from './auditCounter'
import { Training } from './training'
import { TrainingInstance } from './trainingInstance'
import { TrainingAssignee } from './trainingAssignee'
import { TrainingRole } from './trainingRole'
import { TrainingUser } from './trainingUser'
import { TrainingExternalLink } from './trainingExternalLink'
import { TrainingDocumentLink } from './trainingDocumentLink'
import { TrainingMatrix } from './trainingMatrix'
import { TrainingVerification } from './trainingVerification'
import { InformationRequest } from './informationRequest'
import { ChangeRequest } from './changeRequest'
import { ChangeRequestStatus } from './changeRequestStatus'
import { ChangeRequestPriority } from './changeRequestPriority'
import { ChangeType } from './changeType'
import { ChangeRequestLink } from './changeRequestLink'
import { CrRecord } from './crRecord'
import { FieldRecord } from './fieldRecord'
import { FieldRecordRevision } from './fieldRecordRevision'
import { FieldRecordStatus } from './fieldRecordStatus'
import { FormAssignment } from './formAssignment'
import { LogBook } from './logBook'
import { LogBookVersion } from './logBookVersion'
import { LogBookType } from './logBookType'
import { SiteOnLogBook } from './siteOnLogBook'
import { LogBookDocumentLink } from './logBookDocumentLink'
import { SharedWithUser } from './sharedWithUser'
import { Equipment } from './equipment'
import { FieldRecordFlag } from './fieldRecordFlag'
import { AssignmentInstance } from './assignmentInstance'
import { AssignmentInstanceStatus } from './assignmentInstanceStatus'
import { RecordLink } from './recordLink'
import { NotificationRule } from './notificationRule'
import { EntityFieldSet } from './entityFieldSet'
import { EntityFieldValue } from './entityFieldValue'
import { QualityEvent } from './qualityEvent'
import { EventCategory } from './eventCategory'
import { EventSeverity } from './eventSeverity'
import { EventNote } from './eventNote'
import { EventAttachment } from './eventAttachment'
import { AutomationRule } from './automationRule'
// AI sidecar (see backend/ai/README.md, AI_PLAN.md §11). All AI models are
// grouped here. Existing models stay AI-agnostic.
import { AiPat } from './aiPat'
import { AiChatThread } from './aiChatThread'
import { AiChatMessage } from './aiChatMessage'

export const db = {
  ApiKey,
  AiPat,
  AiChatThread,
  AiChatMessage,
  Workflow,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowInstanceStep,
  WorkflowInstanceStepStatus,
  WorkflowInstanceStepUserStatus,
  WorkflowStatus,
  WorkflowStep,
  WorkflowStepOutcome,
  WorkflowStepRole,
  WorkflowStepUser,
  AllowedOutcomeOnStep,
  StepSendBackTarget,
  WorkflowVersion,
  WorkflowVersionStatus,
  Asset,
  AssetRequest,
  AssetRequestItem,
  AssetRequestOnContact,
  AssetRequestOnUser,
  EsignAgreement,
  EsignAgreementSigner,
  Specification,
  SpecificationCharacteristic,
  InspectionLot,
  InspectionResult,
  InspectionDefect,
  DefectCatalog,
  SamplingStandard,
  SamplingPlanTable,
  SampleSizeCodeLetter,
  SamplingPlan,
  QcInspectionTemplate,
  AssetRequestStatus,
  AssetRequestType,
  AuditLog,
  Comment,
  Company,
  Department,
  Document,
  DocumentCounter,
  DocumentLink,
  DocumentSection,
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateStatus,
  DocumentType,
  DocumentVersion,
  DocumentVersionStatus,
  FormStatus,
  FormTemplate,
  Module,
  Notification,
  NotificationType,
  OptionSet,
  Permission,
  PermissionOnRole,
  Product,
  ProductFamily,
  ProductStatus,
  ProductType,
  Record,
  RecordCounter,
  RecordStatus,
  RelatedStandard,
  RiskLevel,
  Role,
  RoleOnUser,
  RoleOnWorkflowInstanceStep,
  RoleStatus,
  Site,
  SiteOnTemplate,
  Supplier,
  SupplierAsset,
  SupplierCertificateType,
  SupplierContact,
  SupplierDocument,
  SupplierLocation,
  SupplierOnSite,
  SupplierStatus,
  TaskInstance,
  TaskInstanceStatus,
  TaskKind,
  TaskPriority,
  Team,
  User,
  UserOnWorkflowInstanceStep,
  UserOnDocument,
  UserOnTeam,
  UserStatus,
  Nonconformance,
  NcCounter,
  NcStatus,
  NcType,
  NcSeverity,
  NcSource,
  NcIssueType,
  NcDispositionType,
  NcRootCauseCategory,
  NcRecord,
  CustomerComplaint,
  CustomerComplaintStatus,
  CustomerComplaintSource,
  CustomerComplaintMessage,
  CustomerComplaintAttachment,
  NcSourceLink,
  ComplaintCannedResponse,
  ExternalTicketLink,
  IntegrationSyncEvent,
  Customer,
  CustomerOrganization,
  Capa,
  CapaCounter,
  CapaStatus,
  CapaType,
  CapaSource,
  CapaPriority,
  CapaRecord,
  CapaEffectivenessCheck,
  CapaEffectivenessCheckStatus,
  RcaTemplate,
  RiskAssessmentTemplate,
  RootCauseCategory,
  RootCause,
  HazardCategory,
  RiskAssessment,
  // Audit Management (Phase A foundation)
  AuditStandardType,
  AuditFindingCategory,
  AuditStandard,
  AuditStandardVersion,
  AuditRequirement,
  AuditProgram,
  AuditProgramAuditor,
  AuditInstance,
  AuditTeamMember,
  AuditRequirementResponse,
  AuditRecord,
  AuditFinding,
  AuditEvidence,
  AuditEvidenceLink,
  AuditDocumentRequest,
  AuditCounter,
  Training,
  TrainingInstance,
  TrainingAssignee,
  TrainingRole,
  TrainingUser,
  TrainingExternalLink,
  TrainingDocumentLink,
  TrainingMatrix,
  TrainingVerification,
  InformationRequest,
  ChangeRequest,
  ChangeRequestStatus,
  ChangeRequestPriority,
  ChangeType,
  ChangeRequestLink,
  CrRecord,
  FieldRecord,
  FieldRecordRevision,
  FieldRecordStatus,
  FormAssignment,
  LogBook,
  LogBookVersion,
  LogBookType,
  SiteOnLogBook,
  LogBookDocumentLink,
  SharedWithUser,
  Equipment,
  FieldRecordFlag,
  AssignmentInstance,
  AssignmentInstanceStatus,
  RecordLink,
  NotificationRule,
  EntityFieldSet,
  EntityFieldValue,
  QualityEvent,
  EventCategory,
  EventSeverity,
  EventNote,
  EventAttachment,
  AutomationRule,
}
