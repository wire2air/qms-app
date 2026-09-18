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
import { InspectionLotEvent } from './inspectionLotEvent'
import { InspectionResult } from './inspectionResult'
import { InspectionSample } from './inspectionSample'
import { InspectionBatch } from './inspectionBatch'
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
import { DocumentImportBatch } from './documentImportBatch'
import { DocumentImportItem } from './documentImportItem'
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
import { Product } from './product'
import { ProductOption } from './productOption'
import { ProductFamily } from './productFamily'
import { ProductStatus } from './productStatus'
import { ItemCategory } from './itemCategory'
import { ProductSupplier } from './productSupplier'
import { ProductType } from './productType'
import { Uom } from './uom'
import { Record } from './record'
import { RecordCounter } from './recordCounter'
import { RecordStatus } from './recordStatus'
import { RelatedStandard } from './relatedStandard'
import { RiskLevel } from './riskLevel'
import { Role } from './role'
import { RoleOnTeam } from './roleOnTeam'
import { RoleOnUser } from './roleOnUser'
import { RoleOnWorkflowInstanceStep } from './roleOnWorkflowInstanceStep'
import { RoleStatus } from './roleStatus'
import { Site } from './site'
import { SiteOnTemplate } from './siteOnTemplate'
import { Supplier } from './supplier'
import { SupplierOption } from './supplierOption'
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
import { UserSite } from './userSite'
import { UserStatus } from './userStatus'
import { Nonconformance } from './nonconformance'
import { NcCounter } from './ncCounter'
import { NcStatus } from './ncStatus'
import { InspectionLotStatus } from './inspectionLotStatus'
import { QualityEventStatus } from './qualityEventStatus'
import { AuditInstanceStatus } from './auditInstanceStatus'
import { NcType } from './ncType'
import { NcSeverity } from './ncSeverity'
import { NcSource } from './ncSource'
import { NcDispositionType } from './ncDispositionType'
import { NcRootCauseCategory } from './ncRootCauseCategory'
import { NcRecord } from './ncRecord'
import { Capa } from './capa'
import { CustomerComplaint } from './customerComplaint'
import { CustomerComplaintStatus } from './customerComplaintStatus'
import { CustomerComplaintSource } from './customerComplaintSource'
import { CustomerComplaintMessage } from './customerComplaintMessage'
import { CustomerComplaintAttachment } from './customerComplaintAttachment'
// Complaint QMS lookups (per-tenant).
import { ComplaintSourceType } from './complaintSourceType'
import { Region } from './region'
import { Country } from './country'
import { ComplaintCustomerType } from './complaintCustomerType'
import { ComplaintCategory } from './complaintCategory'
import { ComplaintSubCategory } from './complaintSubCategory'
import { ComplaintType } from './complaintType'
import { ComplaintSeverity } from './complaintSeverity'
import { ComplaintRiskLevel } from './complaintRiskLevel'
import { ComplaintReportScheme } from './complaintReportScheme'
// Standalone QMS Complaint (separate from support customer_complaints).
import { Complaint } from './complaint'
import { ComplaintRecord } from './complaintRecord'
import { ComplaintStatus } from './complaintStatus'
import { ComplaintCannedResponse } from './complaintCannedResponse'
import { Customer } from './customer'
import { CustomerOrganization } from './customerOrganization'
import { CapaCounter } from './capaCounter'
import { CapaStatus } from './capaStatus'
import { CapaType } from './capaType'
import { CapaSource } from './capaSource'
import { CapaPriority } from './capaPriority'
import { CapaRecord } from './capaRecord'
import { ModuleSectionRecord } from './moduleSectionRecord'
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
import { Curriculum } from './curriculum'
import { CurriculumTraining } from './curriculumTraining'
import { RoleCurriculum } from './roleCurriculum'
import { EmployeeTitle } from './employeeTitle'
import { Shift } from './shift'
import { ProductionLine } from './productionLine'
import { StorageLocation } from './storageLocation'
import { RetainSample } from './retainSample'
import { RetainSampleEvent } from './retainSampleEvent'
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
import { LogBookType } from './logBookType'
import { SiteOnLogBook } from './siteOnLogBook'
import { DocumentSite } from './documentSite'
import { LogBookDocumentLink } from './logBookDocumentLink'
import { LogBookReviewer } from './logBookReviewer'
import { SharedWithUser } from './sharedWithUser'
import { Equipment } from './equipment'
import { FieldRecordFlag } from './fieldRecordFlag'
import { AssignmentInstance } from './assignmentInstance'
import { AssignmentInstanceStatus } from './assignmentInstanceStatus'
import { RecordLink } from './recordLink'
import { AuditReport } from './auditReport'
import { DocumentReview } from './documentReview'
import { RecordShareLink } from './recordShareLink'
import { RecordShareLinkItem } from './recordShareLinkItem'
import { RecordShareLinkView } from './recordShareLinkView'
import { NotificationRule } from './notificationRule'
import { EntityFieldSet } from './entityFieldSet'
import { EntityFieldValue } from './entityFieldValue'
import { QualityEvent } from './qualityEvent'
import { EventCategory } from './eventCategory'
import { EventSeverity } from './eventSeverity'
import { EventNote } from './eventNote'
import { EventAttachment } from './eventAttachment'
import { AutomationRule } from './automationRule'
import { AnalyticsDashboard } from './analyticsDashboard'
import { AnalyticsWidget } from './analyticsWidget'
import { AnalyticsReport } from './analyticsReport'
// Phase 8 — scheduled delivery + thresholds. Each model's header records the
// grants and the updated_at index it was verified against; both are load-bearing
// (an unindexed syncField is silently unsyncable, and a missing grant turns an
// affordance into a permanent 403).
import { AnalyticsReportSchedule } from './analyticsReportSchedule'
import { AnalyticsReportRun } from './analyticsReportRun'
import { AnalyticsAlert } from './analyticsAlert'
import { AnalyticsAlertEvent } from './analyticsAlertEvent'
import { AnalyticsInsight } from './analyticsInsight'
// Custom metrics — a tenant's own metric definitions, plus the read-only field
// vocabulary they are built from. The COMPILED counterpart in analytics_metrics
// is deliberately not modelled: app_user holds SELECT on it and nothing more.
import { AnalyticsCustomMetric } from './analyticsCustomMetric'
import { AnalyticsModuleField } from './analyticsModuleField'
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
  InspectionLotEvent,
  InspectionResult,
  InspectionSample,
  InspectionBatch,
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
  DocumentImportBatch,
  DocumentImportItem,
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
  Product,
  ProductOption,
  ProductFamily,
  ProductStatus,
  ProductSupplier,
  ProductType,
  Uom,
  ItemCategory,
  Record,
  RecordCounter,
  RecordStatus,
  RelatedStandard,
  RiskLevel,
  Role,
  RoleOnTeam,
  RoleOnUser,
  RoleOnWorkflowInstanceStep,
  RoleStatus,
  Site,
  SiteOnTemplate,
  Supplier,
  SupplierOption,
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
  UserSite,
  UserStatus,
  Nonconformance,
  NcCounter,
  NcStatus,
  InspectionLotStatus,
  QualityEventStatus,
  AuditInstanceStatus,
  NcType,
  NcSeverity,
  NcSource,
  NcDispositionType,
  NcRootCauseCategory,
  NcRecord,
  CustomerComplaint,
  CustomerComplaintStatus,
  CustomerComplaintSource,
  CustomerComplaintMessage,
  CustomerComplaintAttachment,
  ComplaintSourceType,
  Region,
  Country,
  ComplaintCustomerType,
  ComplaintCategory,
  ComplaintSubCategory,
  ComplaintType,
  ComplaintSeverity,
  ComplaintRiskLevel,
  ComplaintReportScheme,
  Complaint,
  ComplaintRecord,
  ComplaintStatus,
  ComplaintCannedResponse,
  Customer,
  CustomerOrganization,
  Capa,
  CapaCounter,
  CapaStatus,
  CapaType,
  CapaSource,
  CapaPriority,
  CapaRecord,
  ModuleSectionRecord,
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
  Curriculum,
  CurriculumTraining,
  RoleCurriculum,
  EmployeeTitle,
  Shift,
  ProductionLine,
  StorageLocation,
  RetainSample,
  RetainSampleEvent,
  TrainingInstance,
  TrainingAssignee,
  TrainingRole,
  TrainingUser,
  TrainingExternalLink,
  TrainingDocumentLink,
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
  LogBookType,
  SiteOnLogBook,
  DocumentSite,
  LogBookDocumentLink,
  LogBookReviewer,
  SharedWithUser,
  Equipment,
  FieldRecordFlag,
  AssignmentInstance,
  AssignmentInstanceStatus,
  RecordLink,
  AuditReport,
  DocumentReview,
  RecordShareLink,
  RecordShareLinkItem,
  RecordShareLinkView,
  NotificationRule,
  EntityFieldSet,
  EntityFieldValue,
  QualityEvent,
  EventCategory,
  EventSeverity,
  EventNote,
  EventAttachment,
  AutomationRule,
  AnalyticsDashboard,
  AnalyticsCustomMetric,
  AnalyticsModuleField,
  AnalyticsWidget,
  AnalyticsReport,
  AnalyticsReportSchedule,
  AnalyticsReportRun,
  AnalyticsAlert,
  AnalyticsAlertEvent,
  AnalyticsInsight,
}
