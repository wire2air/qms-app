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
import { AssetRequestOnContact } from './assetRequestOnContact'
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
import { ProductStatus } from './productStatus'
import { ProductType } from './productType'
import { Record } from './record'
import { RecordCounter } from './recordCounter'
import { RecordStatus } from './recordStatus'
import { RelatedStandard } from './relatedStandard'
import { RiskLevel } from './riskLevel'
import { Role } from './role'
import { RoleOnUser } from './roleOnUser'
import { RoleStatus } from './roleStatus'
import { Site } from './site'
import { SiteOnTemplate } from './siteOnTemplate'
import { Supplier } from './supplier'
import { SupplierAsset } from './supplierAsset'
import { SupplierContact } from './supplierContact'
import { SupplierDocument } from './supplierDocument'
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
import { NcDispositionType } from './ncDispositionType'
import { NcRootCauseCategory } from './ncRootCauseCategory'
import { NcRecord } from './ncRecord'
import { RcaTemplate } from './rcaTemplate'
import { RiskAssessmentTemplate } from './riskAssessmentTemplate'
import { Training } from './training'
import { TrainingInstance } from './trainingInstance'
import { TrainingAssignee } from './trainingAssignee'
import { TrainingRole } from './trainingRole'
import { TrainingUser } from './trainingUser'
import { TrainingExternalLink } from './trainingExternalLink'
import { TrainingDocumentLink } from './trainingDocumentLink'
import { TrainingMatrix } from './trainingMatrix'
import { TrainingVerification } from './trainingVerification'

export const db = {
  ApiKey,
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
  AssetRequestOnContact,
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
  ProductStatus,
  ProductType,
  Record,
  RecordCounter,
  RecordStatus,
  RelatedStandard,
  RiskLevel,
  Role,
  RoleOnUser,
  RoleStatus,
  Site,
  SiteOnTemplate,
  Supplier,
  SupplierAsset,
  SupplierContact,
  SupplierDocument,
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
  NcDispositionType,
  NcRootCauseCategory,
  NcRecord,
  RcaTemplate,
  RiskAssessmentTemplate,
  Training,
  TrainingInstance,
  TrainingAssignee,
  TrainingRole,
  TrainingUser,
  TrainingExternalLink,
  TrainingDocumentLink,
  TrainingMatrix,
  TrainingVerification,
}
