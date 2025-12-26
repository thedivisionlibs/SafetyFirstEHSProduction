/**
 * EHS Management System - Server
 * Comprehensive Environmental Health & Safety Management Platform
 * Similar to Intelex/Vector EHS
 */


require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/ehs_management',
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  SMTP: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM
  },
  TWILIO: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!'
};

// Subscription Tier Limits
const SUBSCRIPTION_TIERS = {
  starter: {
    name: 'Starter',
    price: 199,
    maxUsers: 10,
    maxIncidents: 100,
    maxActionItems: 250,
    maxInspections: 50,
    maxDocuments: 100,
    maxRiskAssessments: 25,
    maxJSAs: 25,
    maxPermits: 50,
    maxContractors: 10,
    features: ['incidents', 'actions', 'dashboard', 'basic_inspections', 'basic_training', 'documents'],
    oshaLogs: true,
    customForms: false,
    apiAccess: false,
    advancedReporting: false,
    trainingModule: true,
    auditModule: true,
    riskAssessment: false,
    jsaModule: false,
    permitToWork: false,
    contractorManagement: false,
    chemicalManagement: false,
    occupationalHealth: false,
    emergencyResponse: false,
    ergonomics: false,
    scheduledReports: false,
    ssoIntegration: false,
    webhooks: false,
    moc: false,
    suppliers: false,
    assets: false,
    environmental: false,
    quality: false,
    capa: false
  },
  professional: {
    name: 'Professional',
    price: 499,
    maxUsers: 50,
    maxIncidents: 1000,
    maxActionItems: 2500,
    maxInspections: 250,
    maxDocuments: 1000,
    maxRiskAssessments: 100,
    maxJSAs: 100,
    maxPermits: 200,
    maxContractors: 50,
    features: ['all_starter', 'osha_logs', 'risk_assessment', 'jsa', 'permit_to_work', 'contractor_mgmt', 'advanced_reporting', 'scheduled_reports'],
    oshaLogs: true,
    customForms: true,
    apiAccess: true,
    advancedReporting: true,
    trainingModule: true,
    auditModule: true,
    riskAssessment: true,
    jsaModule: true,
    permitToWork: true,
    contractorManagement: true,
    chemicalManagement: false,
    occupationalHealth: false,
    emergencyResponse: true,
    ergonomics: false,
    scheduledReports: true,
    ssoIntegration: false,
    webhooks: true,
    moc: true,
    suppliers: true,
    assets: true,
    environmental: false,
    quality: true,
    capa: true
  },
  enterprise: {
    name: 'Enterprise',
    price: 1299,
    maxUsers: -1,
    maxIncidents: -1,
    maxActionItems: -1,
    maxInspections: -1,
    maxDocuments: -1,
    maxRiskAssessments: -1,
    maxJSAs: -1,
    maxPermits: -1,
    maxContractors: -1,
    features: ['all'],
    oshaLogs: true,
    customForms: true,
    apiAccess: true,
    advancedReporting: true,
    trainingModule: true,
    auditModule: true,
    riskAssessment: true,
    jsaModule: true,
    permitToWork: true,
    contractorManagement: true,
    chemicalManagement: true,
    occupationalHealth: true,
    emergencyResponse: true,
    ergonomics: true,
    scheduledReports: true,
    ssoIntegration: true,
    webhooks: true,
    customBranding: true,
    dedicatedSupport: true,
    dataRetention: true,
    gdprTools: true,
    moc: true,
    suppliers: true,
    assets: true,
    environmental: true,
    quality: true,
    capa: true
  }
};

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api/', limiter);

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// =============================================================================
// DATABASE MODELS
// =============================================================================

// Organization Schema
const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  industry: String,
  size: String,
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  phone: String,
  email: String,
  website: String,
  subscription: {
    tier: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
    startDate: Date,
    endDate: Date,
    status: { type: String, enum: ['active', 'cancelled', 'expired', 'trial'], default: 'trial' }
  },
  settings: {
    timezone: { type: String, default: 'America/New_York' },
    dateFormat: { type: String, default: 'MM/DD/YYYY' },
    fiscalYearStart: { type: Number, default: 1 },
    oshaEstablishmentName: String,
    oshaEstablishmentAddress: String,
    naicsCode: String,
    customBranding: {
      logo: String,
      primaryColor: String,
      secondaryColor: String
    }
  },
  locations: [{
    name: String,
    address: String,
    type: String,
    isActive: { type: Boolean, default: true }
  }],
  departments: [{
    name: String,
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// User Schema
const userSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  email: { type: String, required: true },
  phone: String,
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['superadmin', 'admin', 'manager', 'supervisor', 'safety_officer', 'moderator', 'employee', 'user', 'readonly'],
    default: 'employee'
  },
  department: String,
  location: String,
  jobTitle: String,
  employeeId: String,
  hireDate: Date,
  permissions: {
    incidents: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean, approve: Boolean },
    actionItems: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean, approve: Boolean },
    inspections: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean, approve: Boolean },
    training: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean, approve: Boolean },
    documents: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean, approve: Boolean },
    reports: { view: Boolean, create: Boolean, export: Boolean },
    admin: { users: Boolean, settings: Boolean, billing: Boolean }
  },
  verification: {
    email: { verified: { type: Boolean, default: false }, token: String, expires: Date },
    phone: { verified: { type: Boolean, default: false }, code: String, expires: Date }
  },
  twoFactorAuth: {
    enabled: { type: Boolean, default: false },
    secret: String
  },
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index({ organization: 1, email: 1 }, { unique: true });

// Incident Schema - Comprehensive
const incidentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  incidentNumber: { type: String, unique: true },
  title: { type: String, required: true },
  description: String,
  
  // Classification
  type: {
    type: String,
    enum: ['injury', 'illness', 'near_miss', 'first_aid', 'property_damage', 'environmental', 'security', 'vehicle', 'fire', 'chemical_exposure', 'ergonomic', 'slip_trip_fall', 'struck_by', 'caught_in', 'electrical', 'other'],
    required: true
  },
  subType: String, // Specific sub-category
  severity: {
    type: String,
    enum: ['insignificant', 'minor', 'moderate', 'major', 'severe', 'catastrophic'],
    default: 'minor'
  },
  potentialSeverity: { // What could have happened
    type: String,
    enum: ['insignificant', 'minor', 'moderate', 'major', 'severe', 'catastrophic']
  },
  probability: {
    type: String,
    enum: ['rare', 'unlikely', 'possible', 'likely', 'almost_certain']
  },
  riskScore: Number, // Calculated from severity x probability
  status: {
    type: String,
    enum: ['draft', 'submitted', 'acknowledged', 'investigating', 'pending_review', 'pending_approval', 'approved', 'closed', 'reopened'],
    default: 'draft'
  },

  // Date/Time Information
  dateOccurred: { type: Date, required: true },
  timeOccurred: String,
  shift: { type: String, enum: ['day', 'evening', 'night', 'rotating', 'other'] },
  hoursIntoShift: Number,
  dateReported: { type: Date, default: Date.now },
  dateEmployerNotified: Date,
  dateInvestigationStarted: Date,
  dateInvestigationCompleted: Date,

  // Location Details
  location: {
    site: String,
    building: String,
    floor: String,
    department: String,
    area: String,
    specificLocation: String,
    coordinates: { lat: Number, lng: Number },
    indoorOutdoor: { type: String, enum: ['indoor', 'outdoor', 'both'] }
  },

  // Environmental Conditions
  environmentalConditions: {
    weather: { type: String, enum: ['clear', 'rain', 'snow', 'ice', 'fog', 'wind', 'extreme_heat', 'extreme_cold', 'na'] },
    lighting: { type: String, enum: ['adequate', 'poor', 'dark', 'glare', 'na'] },
    noise: { type: String, enum: ['normal', 'loud', 'very_loud', 'na'] },
    temperature: String,
    humidity: String,
    ventilation: { type: String, enum: ['adequate', 'poor', 'none', 'na'] },
    floorCondition: { type: String, enum: ['dry', 'wet', 'oily', 'dusty', 'uneven', 'cluttered', 'na'] },
    housekeeping: { type: String, enum: ['good', 'fair', 'poor'] },
    notes: String
  },

  // Involved Persons (Comprehensive)
  involvedPersons: [{
    personType: { type: String, enum: ['employee', 'contractor', 'visitor', 'vendor', 'customer', 'public', 'other'] },
    // Basic Info
    firstName: String,
    lastName: String,
    employeeId: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    // Employment Info
    department: String,
    jobTitle: String,
    supervisor: String,
    hireDate: Date,
    yearsExperience: Number,
    employmentStatus: { type: String, enum: ['full_time', 'part_time', 'temporary', 'contractor'] },
    regularJobDuties: String,
    // Contact Info
    phone: String,
    email: String,
    address: String,
    emergencyContact: { name: String, phone: String, relationship: String },
    
    // Injury/Illness Details
    wasInjured: { type: Boolean, default: false },
    injuryDescription: String,
    natureOfInjury: { 
      type: String, 
      enum: ['amputation', 'bruise', 'burn_chemical', 'burn_heat', 'burn_electrical', 'concussion', 'crushing', 'cut_laceration', 'dislocation', 'fracture', 'hearing_loss', 'hernia', 'internal_injury', 'poisoning', 'puncture', 'respiratory', 'skin_disorder', 'sprain_strain', 'vision_loss', 'other']
    },
    bodyPartsAffected: [{
      bodyPart: { type: String, enum: ['head', 'face', 'eye_left', 'eye_right', 'ear_left', 'ear_right', 'neck', 'shoulder_left', 'shoulder_right', 'arm_upper_left', 'arm_upper_right', 'elbow_left', 'elbow_right', 'arm_lower_left', 'arm_lower_right', 'wrist_left', 'wrist_right', 'hand_left', 'hand_right', 'finger_left', 'finger_right', 'chest', 'abdomen', 'back_upper', 'back_lower', 'hip_left', 'hip_right', 'groin', 'leg_upper_left', 'leg_upper_right', 'knee_left', 'knee_right', 'leg_lower_left', 'leg_lower_right', 'ankle_left', 'ankle_right', 'foot_left', 'foot_right', 'toe_left', 'toe_right', 'multiple', 'internal', 'other'] },
      side: { type: String, enum: ['left', 'right', 'both', 'na'] },
      severity: { type: String, enum: ['minor', 'moderate', 'severe'] }
    }],
    objectSubstanceCausedHarm: String,
    activityWhenInjured: String,
    
    // Medical Treatment
    treatmentType: { 
      type: String, 
      enum: ['none', 'first_aid_onsite', 'first_aid_offsite', 'medical_treatment', 'emergency_room', 'hospitalized', 'surgery', 'fatality'] 
    },
    firstAidProvided: String,
    medicalProvider: {
      name: String,
      address: String,
      phone: String,
      treatingPhysician: String
    },
    hospitalName: String,
    hospitalAdmitDate: Date,
    hospitalDischargeDate: Date,
    diagnosisCodes: [String], // ICD-10 codes
    treatmentNotes: String,
    
    // Work Status
    returnToWork: {
      status: { type: String, enum: ['working', 'off_work', 'restricted_duty', 'light_duty', 'terminated', 'retired', 'deceased'] },
      restrictedDutyStart: Date,
      restrictedDutyEnd: Date,
      restrictions: [String],
      offWorkStart: Date,
      offWorkEnd: Date,
      expectedReturnDate: Date,
      actualReturnDate: Date,
      fitnessForDutyDate: Date,
      fitnessForDutyClearance: String,
      permanentRestrictions: Boolean,
      permanentRestrictionsDetails: String
    },
    daysAwayFromWork: Number,
    daysRestrictedDuty: Number,
    daysJobTransfer: Number,

    // Training/PPE at time of incident
    trainingCurrent: Boolean,
    relevantTraining: [{ course: String, completedDate: Date }],
    ppeRequired: [String],
    ppeWorn: [String],
    ppeCondition: String,
    ppeFailure: Boolean,
    ppeFailureDetails: String,

    // Workers Comp
    workersCompClaim: {
      filed: Boolean,
      claimNumber: String,
      dateOfClaim: Date,
      status: { type: String, enum: ['open', 'accepted', 'denied', 'closed', 'appealed'] },
      insuranceCarrier: String,
      adjusterName: String,
      adjusterPhone: String,
      adjusterEmail: String,
      totalPaid: Number,
      notes: String
    }
  }],

  // Witnesses (Comprehensive)
  witnesses: [{
    firstName: String,
    lastName: String,
    personType: { type: String, enum: ['employee', 'contractor', 'visitor', 'vendor', 'public', 'other'] },
    employeeId: String,
    department: String,
    jobTitle: String,
    phone: String,
    email: String,
    locationDuringIncident: String,
    distanceFromIncident: String,
    statementTaken: Boolean,
    statementDate: Date,
    statementTakenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    statement: String,
    signedStatement: Boolean,
    statementDocument: String, // filename
    willingToTestify: Boolean,
    notes: String
  }],

  // Equipment/Machinery Involved
  equipmentInvolved: [{
    equipmentType: { type: String, enum: ['machine', 'vehicle', 'tool_power', 'tool_hand', 'ladder', 'scaffold', 'forklift', 'crane', 'conveyor', 'press', 'chemical', 'electrical', 'other'] },
    name: String,
    assetId: String,
    manufacturer: String,
    model: String,
    serialNumber: String,
    yearManufactured: Number,
    lastInspectionDate: Date,
    lastMaintenanceDate: Date,
    operatingCondition: { type: String, enum: ['normal', 'malfunction', 'improper_use', 'modified', 'damaged', 'unknown'] },
    safetyDevicesPresent: Boolean,
    safetyDevicesWorking: Boolean,
    safetyDevicesBypassed: Boolean,
    lockoutTagoutRequired: Boolean,
    lockoutTagoutFollowed: Boolean,
    equipmentSecured: Boolean,
    equipmentQuarantined: Boolean,
    notes: String
  }],

  // Substances/Materials Involved
  substancesInvolved: [{
    substanceType: { type: String, enum: ['chemical', 'biological', 'radioactive', 'dust', 'fumes', 'gas', 'liquid', 'solid', 'other'] },
    name: String,
    casNumber: String,
    sdsAvailable: Boolean,
    quantity: String,
    unit: String,
    exposureRoute: { type: String, enum: ['inhalation', 'skin_contact', 'eye_contact', 'ingestion', 'injection', 'multiple'] },
    exposureDuration: String,
    protectiveMeasuresUsed: [String],
    spillContained: Boolean,
    notes: String
  }],

  // Drug/Alcohol Testing
  drugAlcoholTesting: {
    testingRequired: Boolean,
    testingConducted: Boolean,
    reasonNotTested: String,
    testDate: Date,
    testTime: String,
    testType: { type: String, enum: ['drug', 'alcohol', 'both'] },
    testMethod: { type: String, enum: ['urine', 'blood', 'breath', 'hair', 'oral_fluid'] },
    testingFacility: String,
    collectorName: String,
    chainOfCustody: Boolean,
    results: { type: String, enum: ['negative', 'positive', 'pending', 'inconclusive', 'refused'] },
    substancesDetected: [String],
    mroName: String, // Medical Review Officer
    mroReviewDate: Date,
    documentFilename: String
  },

  // Root Cause Analysis (Comprehensive)
  rootCauseAnalysis: {
    method: { type: String, enum: ['5_whys', 'fishbone', 'fault_tree', 'taproot', 'apollo', 'other'] },
    performedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    performedDate: Date,
    
    // Immediate Causes
    immediateCauses: [{
      category: { type: String, enum: ['substandard_act', 'substandard_condition'] },
      description: String,
      details: String
    }],
    
    // Basic/Underlying Causes
    basicCauses: [{
      category: { type: String, enum: ['personal_factors', 'job_factors'] },
      subCategory: String,
      description: String
    }],
    
    // Root Causes
    rootCauses: [{
      category: { type: String, enum: ['management_system', 'training', 'procedures', 'equipment', 'communication', 'supervision', 'culture', 'resources', 'other'] },
      description: String,
      evidence: String
    }],
    
    // Contributing Factors
    contributingFactors: [{
      factor: String,
      category: { type: String, enum: ['human', 'equipment', 'environment', 'process', 'organizational'] },
      significance: { type: String, enum: ['primary', 'secondary', 'minor'] }
    }],
    
    // 5 Whys (if used)
    fiveWhys: {
      why1: { question: String, answer: String },
      why2: { question: String, answer: String },
      why3: { question: String, answer: String },
      why4: { question: String, answer: String },
      why5: { question: String, answer: String },
      rootCauseIdentified: String
    },
    
    summary: String,
    preventionStrategy: String
  },

  // Investigation
  investigation: {
    required: { type: Boolean, default: true },
    leadInvestigator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    startDate: Date,
    targetCompletionDate: Date,
    actualCompletionDate: Date,
    status: { type: String, enum: ['not_started', 'in_progress', 'pending_review', 'completed'] },
    methodology: String,
    findings: String,
    conclusions: String,
    recommendations: String,
    lessonsLearned: String,
    communicationPlan: String,
    timeline: [{
      date: Date,
      activity: String,
      performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: String
    }]
  },

  // Corrective Actions
  correctiveActions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' }],

  // OSHA Recordability (Comprehensive)
  oshaRecordability: {
    isRecordable: { type: Boolean, default: false },
    determinedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    determinedDate: Date,
    classification: {
      type: String,
      enum: ['fatality', 'days_away_from_work', 'job_transfer_restriction', 'other_recordable', 'first_aid_only', 'not_recordable']
    },
    caseNumber: String, // OSHA 300 log case number
    privacyCase: { type: Boolean, default: false }, // Privacy concern case
    hearingLossSTS: Boolean, // Standard Threshold Shift
    
    // Key Dates for OSHA
    dateOfInjury: Date,
    dateEmployerNotified: Date,
    dateBeganWork: Date,
    dateOfDeath: Date,
    
    // Days Tracking
    daysAwayFromWork: { count: Number, ongoing: Boolean },
    daysJobTransferRestriction: { count: Number, ongoing: Boolean },
    
    // Classification Details
    injuryType: { type: String, enum: ['injury', 'skin_disorder', 'respiratory_condition', 'poisoning', 'hearing_loss', 'other_illness'] },
    
    // OSHA 301 Information
    form301: {
      completed: Boolean,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      completedDate: Date,
      whatWasEmployeeDoing: String,
      howDidIncidentOccur: String,
      whatObjectOrSubstance: String,
      treatmentFacility: String,
      wasEmployeeHospitalized: Boolean,
      dateReturnedToWork: Date
    },
    
    documents: [{
      type: { type: String, enum: ['osha_300', 'osha_300a', 'osha_301', 'medical_record', 'witness_statement', 'investigation_report', 'photo', 'other'] },
      filename: String,
      originalName: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      uploadedAt: Date,
      notes: String
    }],
    
    annualLogYear: Number,
    linkedTo300Log: { type: mongoose.Schema.Types.ObjectId, ref: 'OSHA300Log' }
  },

  // Regulatory Reporting
  regulatoryReporting: {
    oshaReportable: Boolean,
    oshaReported: Boolean,
    oshaReportType: { type: String, enum: ['fatality', 'hospitalization', 'amputation', 'eye_loss', 'none'] },
    oshaReportedWithin: String, // 8 hours for fatality, 24 hours for hospitalization/amputation/eye loss
    oshaReportMethod: { type: String, enum: ['phone', 'online', 'in_person'] },
    oshaReportDate: Date,
    oshaReportTime: String,
    oshaReportNumber: String,
    oshaAreaOffice: String,
    oshaContactPerson: String,
    
    epaReportable: Boolean,
    epaReported: Boolean,
    epaReportDate: Date,
    epaReportNumber: String,
    epaReportDetails: String,
    
    dotReportable: Boolean,
    dotReported: Boolean,
    dotReportDate: Date,
    dotReportNumber: String,
    
    stateAgencyReportable: Boolean,
    stateAgencyReported: Boolean,
    stateAgency: String,
    stateReportDate: Date,
    stateReportNumber: String,
    
    otherAgencies: [{
      agencyName: String,
      reportRequired: Boolean,
      reported: Boolean,
      reportDate: Date,
      reportMethod: String,
      referenceNumber: String,
      contactPerson: String,
      notes: String
    }],
    
    regulatoryDocuments: [{
      documentType: String,
      filename: String,
      uploadedAt: Date
    }]
  },

  // Notifications & Communications
  notifications: {
    supervisorNotified: Boolean,
    supervisorNotifiedTime: Date,
    supervisorName: String,
    managementNotified: Boolean,
    managementNotifiedTime: Date,
    safetyNotified: Boolean,
    safetyNotifiedTime: Date,
    hrNotified: Boolean,
    hrNotifiedTime: Date,
    executiveNotified: Boolean,
    executiveNotifiedTime: Date,
    legalNotified: Boolean,
    legalNotifiedTime: Date,
    insuranceNotified: Boolean,
    insuranceNotifiedTime: Date,
    unionNotified: Boolean,
    unionNotifiedTime: Date,
    communicationLog: [{
      date: Date,
      type: { type: String, enum: ['email', 'phone', 'meeting', 'memo', 'other'] },
      recipient: String,
      subject: String,
      summary: String,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
  },

  // Attachments & Documentation
  attachments: [{
    category: { type: String, enum: ['photo', 'video', 'document', 'medical_record', 'witness_statement', 'investigation_report', 'training_record', 'procedure', 'sds', 'diagram', 'other'] },
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    description: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    isConfidential: Boolean
  }],

  // Photos with annotations
  photos: [{
    filename: String,
    caption: String,
    location: String,
    takenBy: String,
    takenAt: Date,
    annotations: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Cost Tracking (Comprehensive)
  costs: {
    // Direct Costs
    direct: {
      medical: { amount: Number, notes: String },
      medicalOngoing: { amount: Number, notes: String },
      workersComp: { amount: Number, notes: String },
      wageReplacement: { amount: Number, notes: String },
      propertyDamage: { amount: Number, notes: String },
      equipmentDamage: { amount: Number, notes: String },
      equipmentReplacement: { amount: Number, notes: String },
      cleanup: { amount: Number, notes: String },
      fines: { amount: Number, notes: String },
      legal: { amount: Number, notes: String }
    },
    // Indirect Costs
    indirect: {
      lostProductivity: { amount: Number, hours: Number, notes: String },
      overtime: { amount: Number, hours: Number, notes: String },
      temporaryWorkers: { amount: Number, notes: String },
      trainingReplacement: { amount: Number, notes: String },
      investigationTime: { amount: Number, hours: Number, notes: String },
      administrativeTime: { amount: Number, hours: Number, notes: String },
      supervisorTime: { amount: Number, hours: Number, notes: String },
      reputationalDamage: { amount: Number, notes: String },
      customerImpact: { amount: Number, notes: String },
      other: { amount: Number, description: String, notes: String }
    },
    totalDirect: Number,
    totalIndirect: Number,
    grandTotal: Number,
    estimatedVsActual: { type: String, enum: ['estimated', 'actual', 'partial'] },
    lastUpdated: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Workflow & Approvals
  workflow: {
    currentStep: String,
    history: [{
      step: String,
      action: String,
      performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      performedAt: Date,
      comments: String
    }],
    approvals: [{
      level: String,
      approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'returned'] },
      date: Date,
      comments: String
    }]
  },

  // Linked Records
  linkedRecords: {
    previousIncidents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' }],
    relatedIncidents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' }],
    inspections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inspection' }],
    riskAssessments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' }],
    jsas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JSA' }],
    permits: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PermitToWork' }],
    trainingRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TrainingRecord' }]
  },

  // Custom Form Data
  customFormId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncidentForm' },
  customFormData: mongoose.Schema.Types.Mixed,

  // Metadata
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: Date,
  closureNotes: String,
  
  tags: [String],
  internalNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Custom Incident Form Schema - For organizations to create their own forms
const incidentFormSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  description: String,
  incidentTypes: [{ type: String }], // Which incident types this form applies to
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['draft', 'active', 'inactive', 'archived'], default: 'draft' },
  isDefault: { type: Boolean, default: false },
  
  // Form Sections
  sections: [{
    name: String,
    description: String,
    order: Number,
    collapsible: Boolean,
    defaultCollapsed: Boolean,
    conditionalDisplay: {
      enabled: Boolean,
      field: String,
      operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] },
      value: mongoose.Schema.Types.Mixed
    },
    
    fields: [{
      fieldId: String, // Unique identifier
      label: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['text', 'textarea', 'number', 'decimal', 'email', 'phone', 'date', 'time', 'datetime', 'select', 'multiselect', 'radio', 'checkbox', 'checkboxgroup', 'file', 'image', 'signature', 'location', 'user_lookup', 'employee_lookup', 'equipment_lookup', 'rating', 'scale', 'rich_text', 'header', 'divider', 'instructions'],
        required: true
      },
      placeholder: String,
      helpText: String,
      defaultValue: mongoose.Schema.Types.Mixed,
      required: Boolean,
      readOnly: Boolean,
      hidden: Boolean,
      order: Number,
      width: { type: String, enum: ['full', 'half', 'third', 'quarter'], default: 'full' },
      
      // Validation
      validation: {
        minLength: Number,
        maxLength: Number,
        min: Number,
        max: Number,
        pattern: String,
        patternMessage: String,
        customValidation: String // JavaScript expression
      },
      
      // Options for select/radio/checkbox fields
      options: [{
        value: String,
        label: String,
        order: Number,
        isDefault: Boolean
      }],
      allowOther: Boolean, // Allow "Other" option with text input
      
      // Conditional Display
      conditionalDisplay: {
        enabled: Boolean,
        rules: [{
          field: String,
          operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty', 'in', 'not_in'] },
          value: mongoose.Schema.Types.Mixed,
          logic: { type: String, enum: ['and', 'or'], default: 'and' }
        }]
      },
      
      // File upload settings
      fileSettings: {
        allowedTypes: [String],
        maxSize: Number, // in bytes
        maxFiles: Number,
        requireCaption: Boolean
      },
      
      // Rating/Scale settings
      scaleSettings: {
        min: Number,
        max: Number,
        step: Number,
        minLabel: String,
        maxLabel: String,
        showLabels: Boolean
      },
      
      // Lookup settings
      lookupSettings: {
        entityType: String,
        displayField: String,
        filterBy: mongoose.Schema.Types.Mixed
      },
      
      // Data mapping to core incident fields
      mapsToField: String // Maps to a core incident schema field
    }]
  }],
  
  // Form Settings
  settings: {
    requireApproval: Boolean,
    approvers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    notifyOnSubmission: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    allowDraft: { type: Boolean, default: true },
    allowEdit: { type: Boolean, default: true },
    editTimeLimit: Number, // hours after submission
    requireSignature: Boolean,
    requireWitness: Boolean,
    autoAssign: {
      enabled: Boolean,
      assignTo: { type: String, enum: ['supervisor', 'safety_manager', 'specific_user', 'round_robin'] },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
  publishedAt: Date,
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const IncidentForm = mongoose.model('IncidentForm', incidentFormSchema);

// Action Item Schema
const actionItemSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  actionNumber: { type: String, unique: true },
  title: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: ['corrective', 'preventive', 'improvement', 'maintenance', 'training', 'other'],
    default: 'corrective'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'pending_verification', 'completed', 'overdue', 'cancelled'],
    default: 'open'
  },
  source: {
    type: { type: String, enum: ['incident', 'inspection', 'audit', 'observation', 'suggestion', 'regulatory', 'other'] },
    referenceId: mongoose.Schema.Types.ObjectId,
    referenceNumber: String
  },
  location: String,
  department: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueDate: Date,
  completedDate: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedDate: Date,
  verificationNotes: String,
  estimatedCost: Number,
  actualCost: Number,
  attachments: [{
    filename: String,
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    comment: String,
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: String,
    timestamp: { type: Date, default: Date.now }
  }],
  customFields: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Inspection Schema
const inspectionSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  inspectionNumber: { type: String, unique: true },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['safety', 'environmental', 'equipment', 'facility', 'vehicle', 'ppe', 'fire', 'ergonomic', 'custom'],
    default: 'safety'
  },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionTemplate' },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  scheduledDate: Date,
  completedDate: Date,
  location: String,
  department: String,
  inspector: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sections: [{
    title: String,
    items: [{
      question: String,
      type: { type: String, enum: ['yes_no', 'pass_fail', 'rating', 'text', 'number', 'checklist'] },
      response: mongoose.Schema.Types.Mixed,
      status: { type: String, enum: ['pass', 'fail', 'na', 'pending'] },
      notes: String,
      photos: [String],
      actionRequired: Boolean,
      actionItem: { type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' }
    }]
  }],
  summary: {
    totalItems: Number,
    passedItems: Number,
    failedItems: Number,
    naItems: Number,
    score: Number
  },
  findings: String,
  recommendations: String,
  actionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' }],
  attachments: [{
    filename: String,
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  signature: {
    inspector: { signed: Boolean, date: Date, signature: String },
    reviewer: { user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, signed: Boolean, date: Date, signature: String }
  },
  customFields: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Inspection Template Schema
const inspectionTemplateSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  type: String,
  description: String,
  sections: [{
    title: String,
    order: Number,
    items: [{
      question: String,
      type: { type: String, enum: ['yes_no', 'pass_fail', 'rating', 'text', 'number', 'checklist'] },
      required: Boolean,
      options: [String],
      order: Number
    }]
  }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Training Schema
const trainingSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: ['safety', 'compliance', 'orientation', 'certification', 'skill', 'refresher', 'other'],
    default: 'safety'
  },
  category: String,
  provider: {
    type: { type: String, enum: ['internal', 'external', 'online'] },
    name: String,
    contact: String
  },
  duration: { hours: Number, minutes: Number },
  frequency: {
    type: { type: String, enum: ['one_time', 'annual', 'biannual', 'quarterly', 'monthly', 'custom'] },
    customDays: Number
  },
  requirements: {
    roles: [String],
    departments: [String],
    locations: [String],
    prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Training' }]
  },
  content: {
    materials: [{
      title: String,
      type: { type: String },
      url: String,
      filename: String
    }],
    quiz: {
      enabled: Boolean,
      passingScore: Number,
      questions: [{
        question: String,
        type: { type: String, enum: ['multiple_choice', 'true_false', 'short_answer'] },
        options: [String],
        correctAnswer: mongoose.Schema.Types.Mixed,
        points: Number
      }]
    }
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Training Record Schema
const trainingRecordSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  training: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['assigned', 'in_progress', 'completed', 'expired', 'failed'],
    default: 'assigned'
  },
  assignedDate: { type: Date, default: Date.now },
  dueDate: Date,
  startedDate: Date,
  completedDate: Date,
  expirationDate: Date,
  instructor: String,
  location: String,
  score: Number,
  attempts: [{
    date: Date,
    score: Number,
    passed: Boolean
  }],
  certificate: {
    issued: Boolean,
    number: String,
    issuedDate: Date,
    expirationDate: Date,
    file: String
  },
  signature: {
    trainee: { signed: Boolean, date: Date },
    trainer: { signed: Boolean, date: Date, name: String }
  },
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Document Schema
const documentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['policy', 'procedure', 'form', 'permit', 'certificate', 'sds', 'manual', 'report', 'other'],
    default: 'other'
  },
  subcategory: String,
  documentNumber: String,
  version: { type: String, default: '1.0' },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'published', 'archived', 'obsolete'],
    default: 'draft'
  },
  file: {
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    path: String
  },
  effectiveDate: Date,
  expirationDate: Date,
  reviewDate: Date,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedDate: Date,
  departments: [String],
  locations: [String],
  tags: [String],
  accessLevel: {
    type: String,
    enum: ['public', 'internal', 'restricted', 'confidential'],
    default: 'internal'
  },
  relatedDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  revisionHistory: [{
    version: String,
    date: Date,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changes: String,
    file: String
  }],
  acknowledgments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: Date,
    acknowledged: Boolean
  }],
  customFields: mongoose.Schema.Types.Mixed,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// OSHA 300 Log Schema - Comprehensive
const osha300LogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  year: { type: Number, required: true },
  
  // Establishment Information (Form 300A)
  establishment: {
    name: String,
    streetAddress: String,
    city: String,
    state: String,
    zip: String,
    industry: String,
    naicsCode: String,
    sicCode: String,
    employerRepresentative: String,
    employerTitle: String,
    employerPhone: String
  },
  
  // OSHA 300 Log Entries
  entries: [{
    // Case Information
    caseNumber: { type: String, required: true },
    status: { type: String, enum: ['active', 'closed', 'updated'], default: 'active' },
    privacyCase: { type: Boolean, default: false },
    linkedIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
    
    // Employee Information
    employee: {
      name: String,
      privacyName: String, // "Privacy Case" if privacyCase is true
      jobTitle: String,
      department: String,
      employeeId: String
    },
    
    // Date Information
    dates: {
      dateOfInjuryIllness: Date,
      dateEmployerNotified: Date,
      dateBeganWork: Date,
      dateOfDeath: Date,
      dateEnteredLog: { type: Date, default: Date.now },
      dateLastUpdated: Date
    },
    
    // Location
    whereOccurred: String,
    
    // Description
    describeInjuryIllness: String,
    whatObjectSubstance: String,
    
    // Case Classification
    classification: {
      death: { type: Boolean, default: false },
      daysAwayFromWork: { type: Boolean, default: false },
      jobTransferOrRestriction: { type: Boolean, default: false },
      otherRecordableCase: { type: Boolean, default: false }
    },
    
    // Days Away/Restricted
    daysCount: {
      daysAwayFromWork: { type: Number, default: 0 },
      daysJobTransferRestriction: { type: Number, default: 0 },
      ongoing: Boolean,
      estimatedReturnDate: Date
    },
    
    // Injury or Illness Type (check one)
    injuryIllnessType: {
      injury: { type: Boolean, default: false },
      skinDisorder: { type: Boolean, default: false },
      respiratoryCondition: { type: Boolean, default: false },
      poisoning: { type: Boolean, default: false },
      hearingLoss: { type: Boolean, default: false },
      allOtherIllnesses: { type: Boolean, default: false }
    },
    
    // Standard Threshold Shift (Hearing Loss)
    hearingLossSTS: {
      identified: Boolean,
      dateIdentified: Date,
      baselineDate: Date,
      affectedEar: { type: String, enum: ['left', 'right', 'both'] },
      averageShiftDB: Number,
      ageAdjusted: Boolean,
      revisedBaseline: Boolean
    },
    
    // OSHA Form 301 - Detailed Information
    form301: {
      completed: { type: Boolean, default: false },
      completedDate: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      
      // About the Employee
      employeeInfo: {
        fullName: String,
        address: {
          street: String,
          city: String,
          state: String,
          zip: String
        },
        dateOfBirth: Date,
        dateHired: Date,
        gender: { type: String, enum: ['male', 'female'] },
        timeBeganWork: String
      },
      
      // About the Case
      caseInfo: {
        dateOfInjury: Date,
        timeOfInjury: String,
        timeEmployeeBeganWork: String,
        whatWasEmployeeDoing: String,
        howDidIncidentOccur: String,
        whatObjectOrSubstance: String,
        whatWasInjuryIllness: String,
        whatBodyPartWasAffected: String
      },
      
      // About the Treating Physician
      physicianInfo: {
        nameOfPhysician: String,
        facilityName: String,
        facilityAddress: {
          street: String,
          city: String,
          state: String,
          zip: String
        },
        facilityPhone: String,
        wasEmployeeHospitalized: Boolean,
        hospitalName: String,
        emergencyRoomOnly: Boolean
      },
      
      // Preparer Information
      preparer: {
        name: String,
        title: String,
        phone: String,
        date: Date
      }
    },
    
    // Documents
    documents: [{
      documentType: { 
        type: String, 
        enum: ['form_300', 'form_301', 'medical_record', 'first_report_injury', 'witness_statement', 'investigation_report', 'return_to_work', 'restriction_form', 'death_certificate', 'osha_correspondence', 'other'] 
      },
      filename: String,
      originalName: String,
      mimeType: String,
      size: Number,
      description: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      uploadedAt: { type: Date, default: Date.now },
      confidential: { type: Boolean, default: false }
    }],
    
    // Return to Work Tracking
    returnToWork: {
      status: { type: String, enum: ['off_work', 'restricted_duty', 'full_duty', 'terminated', 'deceased'] },
      restrictedDutyStartDate: Date,
      restrictedDutyEndDate: Date,
      fullDutyReturnDate: Date,
      restrictions: [String],
      accommodations: [String],
      fitnessForDutyCleared: Boolean,
      fitnessForDutyClearanceDate: Date,
      clearingPhysician: String
    },
    
    // Updates/History
    updateHistory: [{
      date: Date,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fieldChanged: String,
      previousValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String
    }],
    
    // Notes
    notes: String,
    internalNotes: String,
    
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Annual Summary (Form 300A)
  summary: {
    // Total Counts
    totalDeaths: { type: Number, default: 0 },
    totalDaysAwayFromWork: { type: Number, default: 0 },
    totalDaysTransferRestriction: { type: Number, default: 0 },
    totalOtherRecordable: { type: Number, default: 0 },
    
    // Injury/Illness Types
    totalInjuries: { type: Number, default: 0 },
    totalSkinDisorders: { type: Number, default: 0 },
    totalRespiratoryConditions: { type: Number, default: 0 },
    totalPoisonings: { type: Number, default: 0 },
    totalHearingLoss: { type: Number, default: 0 },
    totalOtherIllnesses: { type: Number, default: 0 },
    
    // Total Days
    totalDaysAwayFromWorkCount: { type: Number, default: 0 },
    totalDaysJobTransferRestriction: { type: Number, default: 0 },
    
    // Calculated at year end
    calculatedAt: Date,
    calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Employment Information
  employment: {
    annualAverageEmployees: Number,
    totalHoursWorked: Number,
    
    // Quarterly data for more accurate calculations
    quarterly: [{
      quarter: Number,
      averageEmployees: Number,
      hoursWorked: Number
    }]
  },
  
  // Injury/Illness Rates (Calculated)
  rates: {
    trir: Number, // Total Recordable Incident Rate
    dart: Number, // Days Away, Restricted, or Transferred Rate
    ltir: Number, // Lost Time Incident Rate
    severity: Number, // Severity Rate
    frequency: Number, // Frequency Rate
    calculatedAt: Date
  },
  
  // Certification (Form 300A)
  certification: {
    certified: { type: Boolean, default: false },
    certifiedBy: {
      name: String,
      title: String,
      phone: String,
      email: String
    },
    certificationDate: Date,
    signatureFilename: String,
    
    // Posting Information
    postedStartDate: Date,
    postedEndDate: Date,
    postedLocations: [String],
    
    // Company Executive
    companyExecutive: {
      name: String,
      title: String
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'ready_for_certification', 'certified', 'posted', 'archived'],
    default: 'draft'
  },
  
  // Documents for the entire log
  logDocuments: [{
    documentType: { type: String, enum: ['form_300', 'form_300a', 'supporting_document', 'audit_report', 'other'] },
    filename: String,
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date,
    description: String
  }],
  
  // Audit Trail
  auditTrail: [{
    action: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt: Date,
    details: String
  }],
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
});

osha300LogSchema.index({ organization: 1, year: 1 }, { unique: true });

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'approve', 'reject', 'assign', 'other'],
    required: true
  },
  module: {
    type: String,
    enum: ['incidents', 'action_items', 'inspections', 'training', 'documents', 'users', 'organization', 'reports', 'osha_logs', 'system'],
    required: true
  },
  entityType: String,
  entityId: mongoose.Schema.Types.ObjectId,
  entityName: String,
  details: String,
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['incident', 'action_item', 'inspection', 'training', 'document', 'system', 'reminder'],
    required: true
  },
  title: String,
  message: String,
  link: String,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  read: { type: Boolean, default: false },
  readAt: Date,
  emailSent: { type: Boolean, default: false },
  emailSentAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Custom Form Schema
const customFormSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  description: String,
  category: String,
  fields: [{
    name: String,
    label: String,
    type: { type: String, enum: ['text', 'textarea', 'number', 'date', 'time', 'datetime', 'select', 'multiselect', 'checkbox', 'radio', 'file', 'signature'] },
    required: Boolean,
    options: [String],
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      message: String
    },
    order: Number
  }],
  workflow: {
    approvalRequired: Boolean,
    approvers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    notifyOnSubmit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Custom Form Submission Schema
const customFormSubmissionSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomForm', required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  data: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'pending_approval', 'approved', 'rejected'],
    default: 'draft'
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectionReason: String,
  attachments: [{
    filename: String,
    originalName: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Risk Assessment Schema
const riskAssessmentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  assessmentNumber: { type: String, unique: true },
  title: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: ['job_task', 'process', 'equipment', 'chemical', 'ergonomic', 'environmental', 'general'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'active', 'expired', 'archived'],
    default: 'draft'
  },
  location: String,
  department: String,
  assessmentDate: { type: Date, default: Date.now },
  reviewDate: Date,
  expirationDate: Date,
  assessor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  hazards: [{
    hazardId: String,
    description: String,
    category: { type: String, enum: ['physical', 'chemical', 'biological', 'ergonomic', 'psychosocial', 'environmental', 'other'] },
    source: String,
    affectedPersons: [String],
    initialRisk: {
      likelihood: { type: Number, min: 1, max: 5 },
      severity: { type: Number, min: 1, max: 5 },
      score: Number,
      level: { type: String, enum: ['low', 'medium', 'high', 'critical'] }
    },
    controls: [{
      type: { type: String, enum: ['elimination', 'substitution', 'engineering', 'administrative', 'ppe'] },
      description: String,
      responsible: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      dueDate: Date,
      implementedDate: Date,
      status: { type: String, enum: ['planned', 'in_progress', 'implemented', 'verified'] }
    }],
    residualRisk: {
      likelihood: { type: Number, min: 1, max: 5 },
      severity: { type: Number, min: 1, max: 5 },
      score: Number,
      level: { type: String, enum: ['low', 'medium', 'high', 'critical'] }
    }
  }],
  overallRiskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
  actionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' }],
  attachments: [{ filename: String, originalName: String, uploadedAt: Date }],
  signatures: {
    assessor: { signed: Boolean, date: Date, signature: String },
    reviewer: { signed: Boolean, date: Date, signature: String },
    approver: { signed: Boolean, date: Date, signature: String }
  },
  revisionHistory: [{ version: String, date: Date, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, changes: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Job Safety Analysis (JSA) Schema
const jsaSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  jsaNumber: { type: String, unique: true },
  title: { type: String, required: true },
  jobDescription: String,
  department: String,
  location: String,
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'active', 'expired', 'archived'],
    default: 'draft'
  },
  createdDate: { type: Date, default: Date.now },
  reviewDate: Date,
  expirationDate: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requiredPPE: [{
    type: { type: String },
    description: String,
    required: { type: Boolean, default: true }
  }],
  requiredTraining: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Training' }],
  steps: [{
    stepNumber: Number,
    task: String,
    hazards: [{
      description: String,
      type: { type: String, enum: ['struck_by', 'caught_in', 'fall', 'electrical', 'chemical', 'ergonomic', 'environmental', 'other'] },
      riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] }
    }],
    controls: [{
      description: String,
      type: { type: String, enum: ['elimination', 'substitution', 'engineering', 'administrative', 'ppe'] }
    }],
    responsibleParty: String
  }],
  tools: [{ name: String, inspectionRequired: Boolean }],
  permits: [{ type: { type: String }, required: { type: Boolean } }],
  emergencyProcedures: String,
  signatures: {
    supervisor: { name: String, signed: Boolean, date: Date },
    safetyRep: { name: String, signed: Boolean, date: Date },
    employees: [{ name: String, signed: Boolean, date: Date }]
  },
  attachments: [{ filename: String, originalName: String }],
  relatedIncidents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Permit to Work Schema
const permitToWorkSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  permitNumber: { type: String, unique: true },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['hot_work', 'confined_space', 'electrical', 'excavation', 'height_work', 'lockout_tagout', 'chemical', 'general'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'active', 'suspended', 'completed', 'cancelled', 'expired'],
    default: 'draft'
  },
  priority: { type: String, enum: ['routine', 'urgent', 'emergency'], default: 'routine' },
  workDescription: String,
  location: { site: String, area: String, specificLocation: String },
  department: String,
  startDateTime: Date,
  endDateTime: Date,
  duration: { hours: Number, days: Number },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  contractor: { type: mongoose.Schema.Types.ObjectId, ref: 'Contractor' },
  workers: [{
    name: String,
    company: String,
    role: String,
    verified: Boolean
  }],
  hazardsIdentified: [{
    hazard: String,
    controls: [String],
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] }
  }],
  precautions: [{
    category: String,
    description: String,
    completed: Boolean,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date
  }],
  ppeRequired: [{ type: { type: String }, description: String }],
  isolations: [{
    type: { type: String, enum: ['electrical', 'mechanical', 'process', 'other'] },
    location: String,
    method: String,
    isolatedBy: String,
    verified: Boolean,
    verifiedBy: String,
    lockNumber: String
  }],
  gasTests: [{
    testType: String,
    result: String,
    testedBy: String,
    time: Date,
    acceptable: Boolean
  }],
  emergencyProcedures: String,
  communicationPlan: String,
  approvals: [{
    role: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    date: Date,
    comments: String,
    signature: String
  }],
  extensions: [{
    extendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    newEndDateTime: Date,
    reason: String,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: Date
  }],
  closeout: {
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    workCompleted: Boolean,
    areaSecured: Boolean,
    isolationsRemoved: Boolean,
    notes: String,
    signature: String
  },
  attachments: [{ filename: String, originalName: String, type: { type: String } }],
  relatedJSA: { type: mongoose.Schema.Types.ObjectId, ref: 'JSA' },
  relatedRiskAssessment: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Contractor Schema
const contractorSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  contractorNumber: { type: String, unique: true },
  companyName: { type: String, required: true },
  tradeName: String,
  type: { type: String, enum: ['general', 'electrical', 'mechanical', 'construction', 'cleaning', 'security', 'it', 'other'] },
  status: { type: String, enum: ['pending', 'approved', 'suspended', 'expired', 'blacklisted'], default: 'pending' },
  contact: {
    primaryName: String,
    primaryEmail: String,
    primaryPhone: String,
    secondaryName: String,
    secondaryEmail: String,
    secondaryPhone: String
  },
  address: { street: String, city: String, state: String, zip: String, country: String },
  insurance: {
    generalLiability: { provider: String, policyNumber: String, expirationDate: Date, coverageAmount: Number, verified: Boolean },
    workersComp: { provider: String, policyNumber: String, expirationDate: Date, verified: Boolean },
    autoLiability: { provider: String, policyNumber: String, expirationDate: Date, verified: Boolean }
  },
  certifications: [{
    name: String,
    issuingBody: String,
    number: String,
    issueDate: Date,
    expirationDate: Date,
    verified: Boolean,
    document: String
  }],
  safetyRecord: {
    emr: Number,
    trir: Number,
    dart: Number,
    lastUpdated: Date
  },
  prequalification: {
    status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'expired'] },
    completedDate: Date,
    expirationDate: Date,
    score: Number,
    notes: String
  },
  orientationRequired: { type: Boolean, default: true },
  orientationCompleted: Boolean,
  orientationDate: Date,
  authorizedLocations: [String],
  authorizedWorkTypes: [String],
  employees: [{
    name: String,
    role: String,
    phone: String,
    email: String,
    orientationComplete: Boolean,
    badgeNumber: String,
    certifications: [{ name: String, expirationDate: Date }]
  }],
  documents: [{
    type: { type: String },
    name: String,
    filename: String,
    uploadedAt: Date,
    expirationDate: Date
  }],
  performanceRatings: [{
    date: Date,
    ratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    project: String,
    safetyRating: Number,
    qualityRating: Number,
    timelinessRating: Number,
    overallRating: Number,
    comments: String
  }],
  incidents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Incident' }],
  permits: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PermitToWork' }],
  notes: [{ date: Date, author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, note: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Chemical/SDS Schema
const chemicalSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  chemicalId: { type: String, unique: true },
  productName: { type: String, required: true },
  manufacturer: String,
  supplier: String,
  casNumber: String,
  unNumber: String,
  status: { type: String, enum: ['active', 'inactive', 'pending_approval', 'discontinued'], default: 'active' },
  location: [{ site: String, building: String, room: String, quantity: Number, unit: String }],
  department: String,
  hazardClassification: {
    ghsCategories: [String],
    signalWord: { type: String, enum: ['danger', 'warning', 'none'] },
    hazardStatements: [String],
    precautionaryStatements: [String],
    pictograms: [String]
  },
  physicalProperties: {
    state: { type: String, enum: ['solid', 'liquid', 'gas'] },
    color: String,
    odor: String,
    ph: String,
    flashPoint: String,
    boilingPoint: String,
    meltingPoint: String,
    vaporPressure: String,
    specificGravity: String
  },
  healthHazards: {
    routes: [{ type: String, enum: ['inhalation', 'skin', 'eye', 'ingestion'] }],
    acuteEffects: [String],
    chronicEffects: [String],
    targetOrgans: [String],
    carcinogen: Boolean,
    mutagen: Boolean,
    reproductiveToxin: Boolean
  },
  exposureLimits: {
    osha_pel: String,
    acgih_tlv: String,
    niosh_rel: String,
    idlh: String
  },
  ppe: {
    respiratory: String,
    eye: String,
    skin: String,
    hand: String,
    other: String
  },
  storage: {
    requirements: String,
    incompatibilities: [String],
    temperature: String,
    ventilation: String
  },
  spill: {
    smallSpill: String,
    largeSpill: String,
    disposalMethod: String
  },
  firstAid: {
    inhalation: String,
    skin: String,
    eye: String,
    ingestion: String,
    notes: String
  },
  firefighting: {
    extinguishingMedia: [String],
    specialHazards: String,
    firefighterPPE: String
  },
  sds: {
    filename: String,
    originalName: String,
    version: String,
    issueDate: Date,
    reviewDate: Date,
    uploadedAt: Date
  },
  approvedUses: [String],
  restrictedUses: [String],
  trainingRequired: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Training' }],
  riskAssessment: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' },
  lastInventoryDate: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Occupational Health Record Schema
const occupationalHealthSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordType: {
    type: String,
    enum: ['medical_surveillance', 'fitness_for_duty', 'exposure_monitoring', 'health_screening', 'vaccination', 'drug_test', 'return_to_work', 'accommodation'],
    required: true
  },
  status: { type: String, enum: ['scheduled', 'completed', 'pending_results', 'action_required', 'cleared'], default: 'scheduled' },
  date: Date,
  provider: { name: String, facility: String, phone: String },
  examType: String,
  reason: String,
  exposureType: String,
  results: {
    outcome: { type: String, enum: ['normal', 'abnormal', 'pending', 'requires_follow_up'] },
    restrictions: [String],
    recommendations: [String],
    nextExamDate: Date,
    notes: String
  },
  clearance: {
    status: { type: String, enum: ['full', 'restricted', 'not_cleared'] },
    restrictions: [String],
    accommodations: [String],
    reviewDate: Date,
    clearedBy: String
  },
  attachments: [{ filename: String, type: { type: String }, uploadedAt: Date }],
  confidential: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Emergency Response Plan Schema
const emergencyResponseSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  planNumber: { type: String, unique: true },
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['fire', 'chemical_spill', 'medical', 'natural_disaster', 'active_shooter', 'evacuation', 'shelter_in_place', 'utility_failure', 'pandemic', 'general'],
    required: true
  },
  status: { type: String, enum: ['draft', 'active', 'under_review', 'archived'], default: 'draft' },
  location: String,
  effectiveDate: Date,
  reviewDate: Date,
  version: String,
  purpose: String,
  scope: String,
  emergencyContacts: [{
    role: String,
    name: String,
    title: String,
    phone: String,
    alternatePhone: String,
    email: String,
    available24x7: Boolean
  }],
  externalContacts: [{
    agency: String,
    type: { type: String },
    phone: String,
    address: String
  }],
  procedures: [{
    step: Number,
    action: String,
    responsible: String,
    details: String,
    timeframe: String
  }],
  evacuationRoutes: [{
    area: String,
    primaryRoute: String,
    alternateRoute: String,
    assemblyPoint: String,
    accountabilityPerson: String
  }],
  equipmentLocations: [{
    type: { type: String },
    location: String,
    quantity: Number,
    lastInspection: Date
  }],
  communicationPlan: {
    internalNotification: String,
    externalNotification: String,
    mediaContact: String,
    employeeCommunication: String
  },
  trainingRequirements: [{
    training: String,
    frequency: String,
    audience: String
  }],
  drills: [{
    type: { type: String },
    date: Date,
    participants: Number,
    duration: Number,
    observations: String,
    improvements: [String],
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  resources: [{
    type: { type: String },
    description: String,
    location: String,
    quantity: Number
  }],
  attachments: [{ filename: String, originalName: String, type: { type: String } }],
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedDate: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ergonomic Assessment Schema
const ergonomicAssessmentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  assessmentNumber: { type: String, unique: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  employeeName: String,
  jobTitle: String,
  department: String,
  location: String,
  assessmentDate: { type: Date, default: Date.now },
  assessor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'follow_up_required'], default: 'scheduled' },
  type: { type: String, enum: ['workstation', 'manual_handling', 'repetitive_motion', 'comprehensive'], default: 'workstation' },
  reason: { type: String, enum: ['new_employee', 'complaint', 'injury', 'periodic', 'job_change', 'equipment_change'] },
  workstation: {
    type: { type: String, enum: ['office', 'industrial', 'laboratory', 'warehouse', 'other'] },
    sharedWorkstation: Boolean,
    hoursPerDay: Number,
    breaks: String
  },
  findings: [{
    category: { type: String, enum: ['posture', 'equipment', 'environment', 'work_practices', 'physical_demands'] },
    issue: String,
    riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
    bodyPartAffected: String,
    currentCondition: String,
    photo: String
  }],
  measurements: {
    chairHeight: String,
    deskHeight: String,
    monitorDistance: String,
    monitorHeight: String,
    keyboardHeight: String,
    lighting: String,
    temperature: String,
    noise: String
  },
  recommendations: [{
    priority: { type: String, enum: ['immediate', 'short_term', 'long_term'] },
    category: String,
    recommendation: String,
    estimatedCost: Number,
    responsible: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'declined'] },
    completedDate: Date,
    notes: String
  }],
  equipmentProvided: [{
    item: String,
    dateProvided: Date,
    cost: Number
  }],
  followUp: {
    required: Boolean,
    date: Date,
    notes: String,
    completed: Boolean
  },
  employeeSignature: { signed: Boolean, date: Date },
  attachments: [{ filename: String, type: { type: String } }],
  actionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Scheduled Report Schema
const scheduledReportSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  reportType: {
    type: String,
    enum: ['incidents', 'action_items', 'inspections', 'training', 'osha_summary', 'kpi_dashboard', 'audit_log', 'custom'],
    required: true
  },
  status: { type: String, enum: ['active', 'paused', 'disabled'], default: 'active' },
  schedule: {
    frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'], required: true },
    dayOfWeek: Number,
    dayOfMonth: Number,
    time: String,
    timezone: String
  },
  filters: {
    dateRange: { type: String, enum: ['last_day', 'last_week', 'last_month', 'last_quarter', 'last_year', 'custom'] },
    locations: [String],
    departments: [String],
    types: [String],
    statuses: [String]
  },
  format: { type: String, enum: ['pdf', 'xlsx', 'csv'], default: 'pdf' },
  recipients: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    name: String
  }],
  includeCharts: { type: Boolean, default: true },
  includeSummary: { type: Boolean, default: true },
  lastRun: Date,
  nextRun: Date,
  runHistory: [{
    date: Date,
    status: { type: String, enum: ['success', 'failed'] },
    recipients: Number,
    error: String
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Action Item Template Schema
const actionItemTemplateSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  description: String,
  category: String,
  defaultType: { type: String, enum: ['corrective', 'preventive', 'improvement', 'maintenance', 'training', 'other'] },
  defaultPriority: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
  defaultDueDays: Number,
  checklist: [{ item: String, required: { type: Boolean, default: false } }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Create Models
const Organization = mongoose.model('Organization', organizationSchema);
const User = mongoose.model('User', userSchema);
const Incident = mongoose.model('Incident', incidentSchema);
const ActionItem = mongoose.model('ActionItem', actionItemSchema);
const Inspection = mongoose.model('Inspection', inspectionSchema);
const InspectionTemplate = mongoose.model('InspectionTemplate', inspectionTemplateSchema);
const Training = mongoose.model('Training', trainingSchema);
const TrainingRecord = mongoose.model('TrainingRecord', trainingRecordSchema);
const Document = mongoose.model('Document', documentSchema);
const OSHA300Log = mongoose.model('OSHA300Log', osha300LogSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const CustomForm = mongoose.model('CustomForm', customFormSchema);
const CustomFormSubmission = mongoose.model('CustomFormSubmission', customFormSubmissionSchema);
const RiskAssessment = mongoose.model('RiskAssessment', riskAssessmentSchema);
const JSA = mongoose.model('JSA', jsaSchema);
const PermitToWork = mongoose.model('PermitToWork', permitToWorkSchema);
const Contractor = mongoose.model('Contractor', contractorSchema);
const Chemical = mongoose.model('Chemical', chemicalSchema);
const OccupationalHealth = mongoose.model('OccupationalHealth', occupationalHealthSchema);
const EmergencyResponse = mongoose.model('EmergencyResponse', emergencyResponseSchema);
const ErgonomicAssessment = mongoose.model('ErgonomicAssessment', ergonomicAssessmentSchema);
const ScheduledReport = mongoose.model('ScheduledReport', scheduledReportSchema);
const ActionItemTemplate = mongoose.model('ActionItemTemplate', actionItemTemplateSchema);

// Safety Observation Schema
const observationSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  observationNumber: { type: String, unique: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['unsafe_condition', 'unsafe_act', 'near_miss', 'positive', 'hazard'], default: 'unsafe_condition' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  location: String,
  department: String,
  immediateAction: String,
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['open', 'in_progress', 'closed'], default: 'open' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rootCause: String,
  correctiveAction: String,
  closedDate: Date,
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Management of Change Schema
const mocSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  mocNumber: { type: String, unique: true },
  title: { type: String, required: true },
  changeType: { type: String, enum: ['process', 'equipment', 'personnel', 'procedure', 'material', 'software'], default: 'process' },
  description: String,
  justification: String,
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['draft', 'pending_review', 'approved', 'in_progress', 'completed', 'rejected'], default: 'draft' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalDate: Date,
  implementationDate: Date,
  riskAssessment: String,
  affectedAreas: [String],
  trainingRequired: Boolean,
  documentationChanges: [String],
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Supplier Schema
const supplierSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['materials', 'equipment', 'services', 'ppe', 'chemicals'], default: 'materials' },
  contactName: String,
  email: String,
  phone: String,
  address: String,
  status: { type: String, enum: ['pending', 'approved', 'probation', 'suspended'], default: 'pending' },
  rating: { type: Number, min: 1, max: 5 },
  certifications: String,
  qualificationDate: Date,
  lastAuditDate: Date,
  nextAuditDate: Date,
  notes: String,
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Asset Schema
const assetSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  assetNumber: { type: String, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['equipment', 'vehicle', 'tool', 'ppe', 'safety_device', 'instrument'], default: 'equipment' },
  serialNumber: String,
  manufacturer: String,
  model: String,
  location: String,
  department: String,
  purchaseDate: Date,
  purchaseCost: Number,
  warrantyExpiration: Date,
  status: { type: String, enum: ['active', 'maintenance', 'retired', 'disposed'], default: 'active' },
  lastInspection: Date,
  nextInspection: Date,
  inspectionFrequency: Number,
  maintenanceHistory: [{ date: Date, type: String, description: String, cost: Number, performedBy: String }],
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Environmental Record Schema
const environmentalSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  recordNumber: { type: String, unique: true },
  type: { type: String, enum: ['air', 'water', 'waste', 'noise', 'spill'], default: 'air' },
  source: { type: String, required: true },
  date: { type: Date, default: Date.now },
  value: Number,
  unit: String,
  permitLimit: String,
  status: { type: String, enum: ['compliant', 'non_compliant', 'exceedance', 'pending'], default: 'compliant' },
  permitNumber: String,
  monitoringPoint: String,
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  correctiveAction: String,
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Quality/NCR Schema
const qualitySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  ncrNumber: { type: String, unique: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['product', 'process', 'service', 'supplier', 'documentation'], default: 'product' },
  severity: { type: String, enum: ['minor', 'major', 'critical'], default: 'minor' },
  description: String,
  source: String,
  affectedProduct: String,
  detectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['open', 'investigating', 'containment', 'closed'], default: 'open' },
  rootCause: String,
  containmentAction: String,
  dispositionDecision: { type: String, enum: ['use_as_is', 'rework', 'repair', 'scrap', 'return_to_supplier'] },
  quantityAffected: Number,
  costOfNonconformance: Number,
  linkedCapa: { type: mongoose.Schema.Types.ObjectId, ref: 'CAPA' },
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// CAPA Schema
const capaSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  capaNumber: { type: String, unique: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['corrective', 'preventive'], default: 'corrective' },
  source: { type: String, enum: ['ncr', 'audit', 'inspection', 'incident', 'customer_complaint'], default: 'ncr' },
  sourceReference: String,
  description: String,
  rootCause: String,
  action: String,
  responsible: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueDate: Date,
  completedDate: Date,
  status: { type: String, enum: ['open', 'in_progress', 'pending_verification', 'closed'], default: 'open' },
  effectiveness: { type: String, enum: ['effective', 'not_effective', ''] },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verificationDate: Date,
  verificationNotes: String,
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Meeting Schema
const meetingSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['safety_committee', 'toolbox_talk', 'safety_stand_down', 'training_session', 'incident_review', 'management_review'], default: 'safety_committee' },
  date: Date,
  location: String,
  facilitator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  attendees: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, signature: Boolean }],
  agenda: String,
  minutes: String,
  actionItems: [{ description: String, responsible: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, dueDate: Date, status: String }],
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },
  attachments: [{ filename: String, url: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Observation = mongoose.model('Observation', observationSchema);
const MOC = mongoose.model('MOC', mocSchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const Asset = mongoose.model('Asset', assetSchema);
const Environmental = mongoose.model('Environmental', environmentalSchema);
const Quality = mongoose.model('Quality', qualitySchema);
const CAPA = mongoose.model('CAPA', capaSchema);
const Meeting = mongoose.model('Meeting', meetingSchema);

// =============================================================================
// PLATFORM ADMINISTRATION SCHEMAS
// =============================================================================

// Platform Announcement Schema
const platformAnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['info', 'warning', 'critical', 'maintenance', 'feature', 'promotion'],
    default: 'info'
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  targetAudience: {
    type: { type: String, enum: ['all', 'tier', 'specific_orgs'], default: 'all' },
    tiers: [String],
    organizations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }]
  },
  displayLocation: [{ type: String, enum: ['dashboard', 'login', 'banner', 'modal'] }],
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  isActive: { type: Boolean, default: true },
  dismissible: { type: Boolean, default: true },
  requireAcknowledgment: { type: Boolean, default: false },
  acknowledgments: [{
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date
  }],
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Support Ticket Schema
const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submitterEmail: String,
  submitterName: String,
  
  category: { 
    type: String, 
    enum: ['bug', 'feature_request', 'question', 'billing', 'account', 'data', 'integration', 'training', 'other'],
    required: true
  },
  subcategory: String,
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { 
    type: String, 
    enum: ['new', 'open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed'],
    default: 'new'
  },
  
  subject: { type: String, required: true },
  description: { type: String, required: true },
  
  // Affected area
  affectedModule: String,
  affectedUrl: String,
  browserInfo: String,
  
  // Attachments
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    uploadedAt: Date
  }],
  
  // Assignment
  assignedTo: String, // Platform admin name/email
  escalatedTo: String,
  escalatedAt: Date,
  
  // Communication
  messages: [{
    sender: { type: String, enum: ['customer', 'support'] },
    senderName: String,
    message: String,
    attachments: [{ filename: String, originalName: String }],
    sentAt: { type: Date, default: Date.now },
    internal: { type: Boolean, default: false }
  }],
  
  // Resolution
  resolution: String,
  resolutionCategory: String,
  resolvedAt: Date,
  resolvedBy: String,
  
  // Satisfaction
  satisfactionRating: { type: Number, min: 1, max: 5 },
  satisfactionFeedback: String,
  
  // SLA
  slaDeadline: Date,
  slaBreached: { type: Boolean, default: false },
  
  // Timestamps
  firstResponseAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: Date
});

// Feature Flag Schema
const featureFlagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  key: { type: String, required: true, unique: true },
  description: String,
  
  // Status
  enabled: { type: Boolean, default: false },
  
  // Targeting
  targetType: { type: String, enum: ['all', 'percentage', 'tiers', 'organizations', 'users'], default: 'all' },
  percentage: { type: Number, min: 0, max: 100 },
  targetTiers: [String],
  targetOrganizations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Schedule
  enabledFrom: Date,
  enabledUntil: Date,
  
  // Metadata
  category: String,
  tags: [String],
  
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Platform Metrics Schema (Daily aggregation)
const platformMetricsSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  
  // User Metrics
  users: {
    total: Number,
    active: Number, // Logged in within last 30 days
    newToday: Number,
    newThisWeek: Number,
    newThisMonth: Number
  },
  
  // Organization Metrics
  organizations: {
    total: Number,
    active: Number,
    newToday: Number,
    byTier: {
      starter: Number,
      professional: Number,
      enterprise: Number
    },
    byStatus: {
      trial: Number,
      active: Number,
      cancelled: Number,
      expired: Number
    }
  },
  
  // Revenue Metrics (MRR)
  revenue: {
    mrr: Number,
    arr: Number,
    newMrr: Number,
    churnedMrr: Number,
    expansionMrr: Number,
    netNewMrr: Number
  },
  
  // Usage Metrics
  usage: {
    apiCalls: Number,
    incidentsCreated: Number,
    inspectionsCompleted: Number,
    trainingCompleted: Number,
    documentsUploaded: Number,
    reportsGenerated: Number,
    storageUsedMB: Number
  },
  
  // Engagement Metrics
  engagement: {
    dailyActiveUsers: Number,
    weeklyActiveUsers: Number,
    monthlyActiveUsers: Number,
    averageSessionDuration: Number,
    pageViews: Number
  },
  
  createdAt: { type: Date, default: Date.now }
});

// Revenue Transaction Schema
const revenueTransactionSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  type: { 
    type: String, 
    enum: ['subscription', 'upgrade', 'downgrade', 'addon', 'refund', 'credit', 'chargeback'],
    required: true 
  },
  
  // Subscription details
  previousTier: String,
  newTier: String,
  
  // Amount
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  
  // Billing
  billingPeriod: { start: Date, end: Date },
  invoiceNumber: String,
  
  // Payment
  paymentMethod: String,
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  paymentDate: Date,
  transactionId: String,
  
  // Notes
  description: String,
  notes: String,
  
  createdAt: { type: Date, default: Date.now }
});

// API Usage Log Schema
const apiUsageLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  endpoint: String,
  method: String,
  statusCode: Number,
  responseTime: Number, // milliseconds
  
  requestSize: Number,
  responseSize: Number,
  
  ipAddress: String,
  userAgent: String,
  
  // Rate limiting
  rateLimitRemaining: Number,
  rateLimitReset: Date,
  
  timestamp: { type: Date, default: Date.now }
});

// System Health Log Schema
const systemHealthSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  
  // Server metrics
  server: {
    cpuUsage: Number,
    memoryUsage: Number,
    diskUsage: Number,
    uptime: Number
  },
  
  // Database metrics
  database: {
    connections: Number,
    queryTime: Number,
    operationsPerSecond: Number
  },
  
  // Application metrics
  application: {
    activeConnections: Number,
    requestsPerMinute: Number,
    averageResponseTime: Number,
    errorRate: Number
  },
  
  // Status
  status: { type: String, enum: ['healthy', 'degraded', 'down'], default: 'healthy' },
  alerts: [{
    type: String,
    message: String,
    severity: String
  }]
});

const PlatformAnnouncement = mongoose.model('PlatformAnnouncement', platformAnnouncementSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
const PlatformMetrics = mongoose.model('PlatformMetrics', platformMetricsSchema);
const RevenueTransaction = mongoose.model('RevenueTransaction', revenueTransactionSchema);
const ApiUsageLog = mongoose.model('ApiUsageLog', apiUsageLogSchema);
const SystemHealth = mongoose.model('SystemHealth', systemHealthSchema);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Generate unique numbers
const generateNumber = async (model, prefix, orgId) => {
  const year = new Date().getFullYear();
  const count = await model.countDocuments({ organization: orgId });
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
};

// Create audit log entry
const createAuditLog = async (req, action, module, entityType, entityId, entityName, details, changes = null) => {
  try {
    await AuditLog.create({
      organization: req.user?.organization,
      user: req.user?._id,
      action,
      module,
      entityType,
      entityId,
      entityName,
      details,
      changes,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

// Email transporter
let emailTransporter = null;
if (CONFIG.SMTP.host && CONFIG.SMTP.user) {
  emailTransporter = nodemailer.createTransport({
    host: CONFIG.SMTP.host,
    port: CONFIG.SMTP.port,
    secure: false,
    auth: {
      user: CONFIG.SMTP.user,
      pass: CONFIG.SMTP.pass
    }
  });
}

// Send email
const sendEmail = async (to, subject, html) => {
  if (!emailTransporter) {
    console.log('Email not configured. Would send:', { to, subject });
    return { success: true, mock: true };
  }
  try {
    await emailTransporter.sendMail({
      from: CONFIG.SMTP.from,
      to,
      subject,
      html
    });
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
};

// Twilio client
let twilioClient = null;
if (CONFIG.TWILIO.accountSid && CONFIG.TWILIO.authToken) {
  try {
    // Only require twilio if it's installed
    const twilio = require('twilio');
    twilioClient = twilio(CONFIG.TWILIO.accountSid, CONFIG.TWILIO.authToken);
  } catch (e) {
    console.log('Twilio not available:', e.message);
  }
}

// Send SMS
const sendSMS = async (to, message) => {
  if (!twilioClient) {
    console.log('SMS not configured. Would send:', { to, message });
    return { success: true, mock: true };
  }
  try {
    await twilioClient.messages.create({
      body: message,
      from: CONFIG.TWILIO.phoneNumber,
      to
    });
    return { success: true };
  } catch (error) {
    console.error('SMS error:', error);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    
    // Handle demo mode
    if (decoded.demo || mongoose.connection.readyState !== 1) {
      req.user = {
        _id: 'demo-user-1',
        email: 'demo@safetyfirst.com',
        firstName: 'Demo',
        lastName: 'User',
        role: 'admin',
        isActive: true,
        permissions: {
          incidents: { view: true, create: true, edit: true, delete: true, approve: true },
          actionItems: { view: true, create: true, edit: true, delete: true, approve: true },
          inspections: { view: true, create: true, edit: true, delete: true, approve: true },
          training: { view: true, create: true, edit: true, delete: true, approve: true },
          documents: { view: true, create: true, edit: true, delete: true, approve: true },
          reports: { view: true, create: true, export: true },
          admin: { users: true, settings: true, billing: true }
        }
      };
      req.organization = {
        _id: 'demo-org-1',
        name: 'Demo Safety Corp',
        isActive: true,
        subscription: { tier: 'enterprise', status: 'active' },
        settings: { timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY' }
      };
      return next();
    }
    
    const user = await User.findById(decoded.userId).populate('organization');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    if (!user.organization || !user.organization.isActive) {
      return res.status(401).json({ error: 'Organization not found or inactive' });
    }

    req.user = user;
    req.organization = user.organization;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Subscription feature check middleware
const requireFeature = (feature) => {
  return (req, res, next) => {
    const tier = req.organization.subscription.tier;
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    
    if (!tierConfig[feature] && !tierConfig.features.includes('all')) {
      return res.status(403).json({ 
        error: 'Feature not available',
        message: `This feature requires a ${feature === 'oshaLogs' ? 'Professional' : 'Enterprise'} subscription`,
        requiredTier: feature === 'oshaLogs' ? 'professional' : 'enterprise'
      });
    }
    next();
  };
};

// Check subscription limits
const checkLimit = (limitType) => {
  return async (req, res, next) => {
    const tier = req.organization.subscription.tier;
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const limit = tierConfig[limitType];
    
    if (limit === -1) return next(); // Unlimited
    
    let count = 0;
    switch (limitType) {
      case 'maxUsers':
        count = await User.countDocuments({ organization: req.organization._id, isActive: true });
        break;
      case 'maxIncidents':
        count = await Incident.countDocuments({ organization: req.organization._id });
        break;
      case 'maxActionItems':
        count = await ActionItem.countDocuments({ organization: req.organization._id });
        break;
      case 'maxInspections':
        count = await Inspection.countDocuments({ organization: req.organization._id });
        break;
      case 'maxDocuments':
        count = await Document.countDocuments({ organization: req.organization._id });
        break;
    }
    
    if (count >= limit) {
      return res.status(403).json({
        error: 'Limit reached',
        message: `You have reached the maximum ${limitType.replace('max', '').toLowerCase()} for your subscription tier`,
        currentCount: count,
        limit: limit,
        upgrade: true
      });
    }
    next();
  };
};

// =============================================================================
// API ROUTES
// =============================================================================

// Helper to check if in demo mode
const isDemoMode = () => mongoose.connection.readyState !== 1;

// Demo mode empty response helper
const demoEmptyList = (key) => ({ [key]: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    demoMode: isDemoMode()
  });
});

// -----------------------------------------------------------------------------
// AUTH ROUTES
// -----------------------------------------------------------------------------

// Register organization and admin user
app.post('/api/auth/register', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected',
        message: 'Registration requires database connection. Please try again later or contact support.'
      });
    }

    const { organizationName, email, phone, password, firstName, lastName, industry } = req.body;

    // Validate required fields
    if (!organizationName || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields: organizationName, email, password, firstName, lastName' });
    }

    // Check if email exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create organization
    const slug = organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const organization = await Organization.create({
      name: organizationName,
      slug: `${slug}-${Date.now()}`,
      industry: industry || 'other',
      subscription: {
        tier: 'starter',
        startDate: new Date(),
        status: 'trial'
      }
    });

    // Create admin user
    const hashedPassword = await bcrypt.hash(password, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const phoneVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await User.create({
      organization: organization._id,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      firstName,
      lastName,
      role: 'admin',
      permissions: {
        incidents: { view: true, create: true, edit: true, delete: true, approve: true },
        actionItems: { view: true, create: true, edit: true, delete: true, approve: true },
        inspections: { view: true, create: true, edit: true, delete: true, approve: true },
        training: { view: true, create: true, edit: true, delete: true, approve: true },
        documents: { view: true, create: true, edit: true, delete: true, approve: true },
        reports: { view: true, create: true, export: true },
        admin: { users: true, settings: true, billing: true }
      },
      verification: {
        email: {
          verified: true, // Auto-verify for now since email isn't configured
          token: emailVerificationToken,
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        phone: {
          verified: true, // Auto-verify for now since SMS isn't configured
          code: phoneVerificationCode,
          expires: new Date(Date.now() + 10 * 60 * 1000)
        }
      }
    });

    // Try to send verification email (non-blocking)
    const verifyUrl = `${CONFIG.APP_URL}/verify-email?token=${emailVerificationToken}`;
    sendEmail(
      email,
      'Verify Your EHS Management Account',
      `<h1>Welcome to EHS Management System</h1>
       <p>Please verify your email by clicking the link below:</p>
       <a href="${verifyUrl}">${verifyUrl}</a>
       <p>This link expires in 24 hours.</p>`
    ).catch(e => console.log('Email send skipped:', e.message));

    // Try to send SMS (non-blocking)
    if (phone) {
      sendSMS(phone, `Your EHS verification code is: ${phoneVerificationCode}`)
        .catch(e => console.log('SMS send skipped:', e.message));
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, CONFIG.JWT_SECRET, { expiresIn: CONFIG.JWT_EXPIRES_IN });

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions,
        organization: {
          id: organization._id,
          name: organization.name,
          subscription: organization.subscription,
          settings: organization.settings || {}
        },
        verification: {
          emailVerified: true,
          phoneVerified: true
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// Verify email
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    const user = await User.findOne({
      'verification.email.token': token,
      'verification.email.expires': { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.verification.email.verified = true;
    user.verification.email.token = undefined;
    user.verification.email.expires = undefined;
    await user.save();

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Verify phone
app.post('/api/auth/verify-phone', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (req.user.verification.phone.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (new Date() > req.user.verification.phone.expires) {
      return res.status(400).json({ error: 'Verification code expired' });
    }

    req.user.verification.phone.verified = true;
    req.user.verification.phone.code = undefined;
    req.user.verification.phone.expires = undefined;
    await req.user.save();

    res.json({ success: true, message: 'Phone verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend phone verification
app.post('/api/auth/resend-phone-verification', authenticate, async (req, res) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    req.user.verification.phone.code = code;
    req.user.verification.phone.expires = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();

    await sendSMS(req.user.phone, `Your EHS verification code is: ${code}`);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      // Demo mode login
      if (email === 'demo@safetyfirst.com' && password === 'demo123') {
        const token = jwt.sign({ userId: 'demo-user-1', demo: true }, CONFIG.JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          success: true,
          token,
          user: {
            id: 'demo-user-1',
            email: 'demo@safetyfirst.com',
            firstName: 'Demo',
            lastName: 'User',
            role: 'admin',
            permissions: {
              incidents: { view: true, create: true, edit: true, delete: true, approve: true },
              actionItems: { view: true, create: true, edit: true, delete: true, approve: true },
              inspections: { view: true, create: true, edit: true, delete: true, approve: true },
              training: { view: true, create: true, edit: true, delete: true, approve: true },
              documents: { view: true, create: true, edit: true, delete: true, approve: true },
              reports: { view: true, create: true, export: true },
              admin: { users: true, settings: true, billing: true }
            },
            organization: {
              id: 'demo-org-1',
              name: 'Demo Safety Corp',
              subscription: { tier: 'enterprise', status: 'active' },
              settings: { timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY' }
            },
            verification: { emailVerified: true, phoneVerified: true }
          }
        });
      }
      return res.status(503).json({ 
        error: 'Database not connected',
        message: 'Please use demo@safetyfirst.com / demo123 to test, or try again later.'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate('organization');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ error: 'Account locked. Try again later.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Create audit log
    await createAuditLog({ user, ip: req.ip, get: (h) => req.get(h) }, 'login', 'system', 'User', user._id, user.email, 'User logged in');

    const token = jwt.sign({ userId: user._id }, CONFIG.JWT_SECRET, { expiresIn: CONFIG.JWT_EXPIRES_IN });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions,
        organization: {
          id: user.organization._id,
          name: user.organization.name,
          subscription: user.organization.subscription,
          settings: user.organization.settings
        },
        verification: {
          emailVerified: user.verification.email.verified,
          phoneVerified: user.verification.phone.verified
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('organization');
    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        location: user.location,
        jobTitle: user.jobTitle,
        permissions: user.permissions,
        organization: {
          id: user.organization._id,
          name: user.organization.name,
          subscription: user.organization.subscription,
          settings: user.organization.settings,
          locations: user.organization.locations,
          departments: user.organization.departments
        },
        verification: {
          emailVerified: user.verification.email.verified,
          phoneVerified: user.verification.phone.verified
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// -----------------------------------------------------------------------------
// SUPER ADMIN ROUTES (Platform Administration)
// -----------------------------------------------------------------------------

// Super Admin credentials (in production, store in database)
const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@safetyfirst.com',
  password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!'
};

// Super Admin login
app.post('/api/auth/superadmin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (email !== SUPER_ADMIN.email || password !== SUPER_ADMIN.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ 
      isSuperAdmin: true, 
      email: SUPER_ADMIN.email 
    }, CONFIG.JWT_SECRET, { expiresIn: '8h' });
    
    res.json({
      success: true,
      token,
      user: {
        email: SUPER_ADMIN.email,
        role: 'superadmin',
        isSuperAdmin: true
      }
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Super Admin middleware
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    if (!decoded.isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    
    req.superAdmin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ===== DASHBOARD & STATISTICS =====

// Get comprehensive dashboard stats
app.get('/api/superadmin/dashboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);

    // Organization metrics
    const [totalOrgs, activeOrgs, newOrgsMonth, newOrgsWeek, trialOrgs] = await Promise.all([
      Organization.countDocuments(),
      Organization.countDocuments({ isActive: true }),
      Organization.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Organization.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Organization.countDocuments({ 'subscription.status': 'trial' })
    ]);

    // User metrics
    const [totalUsers, activeUsers, newUsersMonth] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } })
    ]);

    // Tier breakdown
    const [starterOrgs, professionalOrgs, enterpriseOrgs] = await Promise.all([
      Organization.countDocuments({ 'subscription.tier': 'starter' }),
      Organization.countDocuments({ 'subscription.tier': 'professional' }),
      Organization.countDocuments({ 'subscription.tier': 'enterprise' })
    ]);

    // Revenue calculations
    const currentMRR = (starterOrgs * 199) + (professionalOrgs * 499) + (enterpriseOrgs * 1299);
    const currentARR = currentMRR * 12;

    // Activity metrics
    const [incidentsMonth, inspectionsMonth, trainingsMonth] = await Promise.all([
      Incident.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Inspection.countDocuments({ createdAt: { $gte: startOfMonth } }),
      TrainingRecord.countDocuments({ createdAt: { $gte: startOfMonth } })
    ]);

    // Growth trends
    const lastMonthOrgs = await Organization.countDocuments({ 
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } 
    });
    const orgGrowthRate = lastMonthOrgs > 0 ? ((newOrgsMonth - lastMonthOrgs) / lastMonthOrgs * 100).toFixed(1) : 100;

    // Top organizations by activity
    const topOrgs = await Incident.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: '$organization', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      { $unwind: '$org' },
      { $project: { name: '$org.name', tier: '$org.subscription.tier', activityCount: '$count' } }
    ]);

    // Recent signups
    const recentSignups = await Organization.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name industry subscription.tier createdAt');

    res.json({
      overview: {
        totalOrgs,
        activeOrgs,
        totalUsers,
        activeUsers,
        trialOrgs,
        currentMRR,
        currentARR
      },
      growth: {
        newOrgsMonth,
        newOrgsWeek,
        newUsersMonth,
        orgGrowthRate: parseFloat(orgGrowthRate)
      },
      tiers: {
        starter: starterOrgs,
        professional: professionalOrgs,
        enterprise: enterpriseOrgs
      },
      activity: {
        incidentsMonth,
        inspectionsMonth,
        trainingsMonth
      },
      topOrgs,
      recentSignups
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Get detailed statistics
app.get('/api/superadmin/stats', authenticateSuperAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const now = new Date();
    let startDate;
    
    switch(period) {
      case '7d': startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(now - 90 * 24 * 60 * 60 * 1000); break;
      case '1y': startDate = new Date(now - 365 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    // Aggregate metrics by day
    const dailySignups = await Organization.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dailyIncidents = await Incident.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Industry breakdown
    const byIndustry = await Organization.aggregate([
      { $group: { _id: '$industry', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Subscription status breakdown
    const byStatus = await Organization.aggregate([
      { $group: { _id: '$subscription.status', count: { $sum: 1 } } }
    ]);

    // Feature usage (what modules are being used most)
    const featureUsage = {
      incidents: await Incident.countDocuments({ createdAt: { $gte: startDate } }),
      inspections: await Inspection.countDocuments({ createdAt: { $gte: startDate } }),
      training: await TrainingRecord.countDocuments({ createdAt: { $gte: startDate } }),
      documents: await Document.countDocuments({ createdAt: { $gte: startDate } }),
      actionItems: await ActionItem.countDocuments({ createdAt: { $gte: startDate } }),
      riskAssessments: await RiskAssessment.countDocuments({ createdAt: { $gte: startDate } })
    };

    res.json({
      dailySignups,
      dailyIncidents,
      byIndustry,
      byStatus,
      featureUsage,
      period
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ===== ORGANIZATION MANAGEMENT =====

// Get all organizations with filtering and pagination
app.get('/api/superadmin/organizations', authenticateSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tier, status, industry, sort = '-createdAt' } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } }
      ];
    }
    if (tier) query['subscription.tier'] = tier;
    if (status) query['subscription.status'] = status;
    if (industry) query.industry = industry;
    
    const total = await Organization.countDocuments(query);
    const organizations = await Organization.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Enrich with user counts and activity
    const enrichedOrgs = await Promise.all(organizations.map(async (org) => {
      const [userCount, incidentCount, lastActivity] = await Promise.all([
        User.countDocuments({ organization: org._id }),
        Incident.countDocuments({ organization: org._id }),
        AuditLog.findOne({ organization: org._id }).sort({ timestamp: -1 }).select('timestamp')
      ]);
      
      return {
        ...org.toObject(),
        userCount,
        incidentCount,
        lastActivity: lastActivity?.timestamp
      };
    }));
    
    res.json({
      organizations: enrichedOrgs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Get single organization details
app.get('/api/superadmin/organizations/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    // Get detailed metrics
    const [
      userCount, adminCount, incidentCount, openIncidents,
      inspectionCount, documentCount, trainingRecords
    ] = await Promise.all([
      User.countDocuments({ organization: org._id }),
      User.countDocuments({ organization: org._id, role: 'admin' }),
      Incident.countDocuments({ organization: org._id }),
      Incident.countDocuments({ organization: org._id, status: { $nin: ['closed'] } }),
      Inspection.countDocuments({ organization: org._id }),
      Document.countDocuments({ organization: org._id }),
      TrainingRecord.countDocuments({ organization: org._id })
    ]);
    
    // Get users list
    const users = await User.find({ organization: org._id })
      .select('firstName lastName email role lastLogin createdAt isActive')
      .sort({ createdAt: -1 })
      .limit(50);
    
    // Get recent activity
    const recentActivity = await AuditLog.find({ organization: org._id })
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('user', 'firstName lastName');
    
    // Get subscription history (if RevenueTransaction exists)
    const transactions = await RevenueTransaction.find({ organization: org._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json({
      organization: org,
      metrics: {
        userCount, adminCount, incidentCount, openIncidents,
        inspectionCount, documentCount, trainingRecords
      },
      users,
      recentActivity,
      transactions
    });
  } catch (error) {
    console.error('Get organization details error:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Create organization
app.post('/api/superadmin/organizations', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, industry, email, phone, subscription, adminUser } = req.body;
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    const organization = new Organization({
      name,
      slug: `${slug}-${Date.now()}`,
      industry,
      email,
      phone,
      subscription: {
        tier: subscription?.tier || 'starter',
        status: subscription?.status || 'active',
        startDate: new Date(),
        billingCycle: 'monthly'
      },
      settings: {
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY'
      }
    });
    
    await organization.save();
    
    // Create admin user if provided
    if (adminUser?.email && adminUser?.password) {
      const hashedPassword = await bcrypt.hash(adminUser.password, 12);
      await User.create({
        organization: organization._id,
        email: adminUser.email.toLowerCase(),
        password: hashedPassword,
        firstName: adminUser.firstName || 'Admin',
        lastName: adminUser.lastName || 'User',
        role: 'admin',
        isActive: true,
        permissions: {
          incidents: { view: true, create: true, edit: true, delete: true, approve: true },
          actionItems: { view: true, create: true, edit: true, delete: true, approve: true },
          inspections: { view: true, create: true, edit: true, delete: true, approve: true },
          training: { view: true, create: true, edit: true, delete: true, approve: true },
          documents: { view: true, create: true, edit: true, delete: true, approve: true },
          reports: { view: true, create: true, export: true },
          admin: { users: true, settings: true, billing: true }
        },
        verification: { email: { verified: true }, phone: { verified: true } }
      });
    }
    
    // Log revenue transaction
    const tierPrices = { starter: 199, professional: 499, enterprise: 1299 };
    await RevenueTransaction.create({
      organization: organization._id,
      type: 'subscription',
      newTier: subscription?.tier || 'starter',
      amount: tierPrices[subscription?.tier || 'starter'],
      billingPeriod: { start: new Date(), end: new Date(Date.now() + 30*24*60*60*1000) },
      paymentStatus: 'completed',
      paymentDate: new Date(),
      description: 'Initial subscription'
    });
    
    res.status(201).json({ organization });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Update organization
app.put('/api/superadmin/organizations/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, industry, email, phone, subscription, isActive, settings } = req.body;
    
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    const oldTier = org.subscription?.tier;
    
    // Update fields
    if (name) org.name = name;
    if (industry) org.industry = industry;
    if (email) org.email = email;
    if (phone) org.phone = phone;
    if (subscription?.tier) org.subscription.tier = subscription.tier;
    if (subscription?.status) org.subscription.status = subscription.status;
    if (typeof isActive === 'boolean') org.isActive = isActive;
    if (settings) org.settings = { ...org.settings, ...settings };
    
    org.updatedAt = new Date();
    await org.save();
    
    // Log tier change as revenue transaction
    if (subscription?.tier && subscription.tier !== oldTier) {
      const tierPrices = { starter: 199, professional: 499, enterprise: 1299 };
      const type = tierPrices[subscription.tier] > tierPrices[oldTier] ? 'upgrade' : 'downgrade';
      
      await RevenueTransaction.create({
        organization: org._id,
        type,
        previousTier: oldTier,
        newTier: subscription.tier,
        amount: tierPrices[subscription.tier] - tierPrices[oldTier],
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} from ${oldTier} to ${subscription.tier}`
      });
    }
    
    res.json({ organization: org });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Delete organization
app.delete('/api/superadmin/organizations/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    // Delete all related data (in production, consider soft delete)
    await Promise.all([
      User.deleteMany({ organization: org._id }),
      Incident.deleteMany({ organization: org._id }),
      ActionItem.deleteMany({ organization: org._id }),
      Inspection.deleteMany({ organization: org._id }),
      Training.deleteMany({ organization: org._id }),
      TrainingRecord.deleteMany({ organization: org._id }),
      Document.deleteMany({ organization: org._id }),
      AuditLog.deleteMany({ organization: org._id })
    ]);
    
    await Organization.findByIdAndDelete(org._id);
    
    res.json({ success: true, message: 'Organization and all data deleted' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// ===== USER MANAGEMENT (Platform-wide) =====

// Get all users across platform
app.get('/api/superadmin/users', authenticateSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, role, orgId } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (orgId) query.organization = orgId;
    
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('organization', 'name subscription.tier')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password');
    
    res.json({
      users,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Impersonate user (login as)
app.post('/api/superadmin/impersonate/:userId', authenticateSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('organization');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const token = jwt.sign({ 
      userId: user._id,
      impersonatedBy: req.superAdmin.email 
    }, CONFIG.JWT_SECRET, { expiresIn: '2h' });
    
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: {
          id: user.organization._id,
          name: user.organization.name,
          subscription: user.organization.subscription
        },
        impersonated: true
      }
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

// ===== ANNOUNCEMENTS =====

// Get announcements
app.get('/api/superadmin/announcements', authenticateSuperAdmin, async (req, res) => {
  try {
    const announcements = await PlatformAnnouncement.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get announcements' });
  }
});

// Create announcement
app.post('/api/superadmin/announcements', authenticateSuperAdmin, async (req, res) => {
  try {
    const announcement = new PlatformAnnouncement({
      ...req.body,
      createdBy: req.superAdmin.email
    });
    await announcement.save();
    res.status(201).json({ announcement });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement
app.put('/api/superadmin/announcements/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const announcement = await PlatformAnnouncement.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ announcement });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement
app.delete('/api/superadmin/announcements/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await PlatformAnnouncement.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// ===== SUPPORT TICKETS =====

// Get support tickets
app.get('/api/superadmin/tickets', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, priority, category, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    
    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get status counts
    const statusCounts = await SupportTicket.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      tickets,
      statusCounts: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tickets' });
  }
});

// Get single ticket
app.get('/api/superadmin/tickets/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('organization', 'name subscription')
      .populate('submittedBy', 'firstName lastName email');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ticket' });
  }
});

// Update ticket
app.put('/api/superadmin/tickets/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, priority, assignedTo, resolution } = req.body;
    
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (assignedTo) ticket.assignedTo = assignedTo;
    if (resolution) {
      ticket.resolution = resolution;
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = req.superAdmin.email;
    }
    
    // Track first response time
    if (!ticket.firstResponseAt && req.body.message) {
      ticket.firstResponseAt = new Date();
    }
    
    ticket.updatedAt = new Date();
    await ticket.save();
    
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Add message to ticket
app.post('/api/superadmin/tickets/:id/messages', authenticateSuperAdmin, async (req, res) => {
  try {
    const { message, internal } = req.body;
    
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    ticket.messages.push({
      sender: 'support',
      senderName: req.superAdmin.email,
      message,
      internal: internal || false
    });
    
    if (!ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
    }
    
    if (ticket.status === 'new') {
      ticket.status = 'open';
    }
    
    ticket.updatedAt = new Date();
    await ticket.save();
    
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// ===== FEATURE FLAGS =====

// Get feature flags
app.get('/api/superadmin/feature-flags', authenticateSuperAdmin, async (req, res) => {
  try {
    const flags = await FeatureFlag.find().sort({ name: 1 });
    res.json({ flags });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get feature flags' });
  }
});

// Create/Update feature flag
app.post('/api/superadmin/feature-flags', authenticateSuperAdmin, async (req, res) => {
  try {
    const { key, name, description, enabled, targetType, percentage, targetTiers } = req.body;
    
    let flag = await FeatureFlag.findOne({ key });
    if (flag) {
      Object.assign(flag, req.body);
      flag.updatedAt = new Date();
    } else {
      flag = new FeatureFlag({
        ...req.body,
        createdBy: req.superAdmin.email
      });
    }
    
    await flag.save();
    res.json({ flag });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save feature flag' });
  }
});

// Delete feature flag
app.delete('/api/superadmin/feature-flags/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await FeatureFlag.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete feature flag' });
  }
});

// ===== REVENUE & BILLING =====

// Get revenue overview
app.get('/api/superadmin/revenue', authenticateSuperAdmin, async (req, res) => {
  try {
    const tierPrices = { starter: 199, professional: 499, enterprise: 1299 };
    
    const [starterOrgs, professionalOrgs, enterpriseOrgs] = await Promise.all([
      Organization.countDocuments({ 'subscription.tier': 'starter', 'subscription.status': 'active' }),
      Organization.countDocuments({ 'subscription.tier': 'professional', 'subscription.status': 'active' }),
      Organization.countDocuments({ 'subscription.tier': 'enterprise', 'subscription.status': 'active' })
    ]);
    
    const mrr = (starterOrgs * tierPrices.starter) + 
                (professionalOrgs * tierPrices.professional) + 
                (enterpriseOrgs * tierPrices.enterprise);
    
    // Get recent transactions
    const transactions = await RevenueTransaction.find()
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    
    // Monthly revenue trend
    const monthlyRevenue = await RevenueTransaction.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 365*24*60*60*1000) } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      current: {
        mrr,
        arr: mrr * 12,
        byTier: {
          starter: { count: starterOrgs, revenue: starterOrgs * tierPrices.starter },
          professional: { count: professionalOrgs, revenue: professionalOrgs * tierPrices.professional },
          enterprise: { count: enterpriseOrgs, revenue: enterpriseOrgs * tierPrices.enterprise }
        }
      },
      transactions,
      monthlyRevenue
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get revenue' });
  }
});

// ===== SYSTEM HEALTH =====

// Get system health
app.get('/api/superadmin/health', authenticateSuperAdmin, async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Get collection stats
    const collections = await Promise.all([
      { name: 'organizations', count: await Organization.countDocuments() },
      { name: 'users', count: await User.countDocuments() },
      { name: 'incidents', count: await Incident.countDocuments() },
      { name: 'inspections', count: await Inspection.countDocuments() },
      { name: 'documents', count: await Document.countDocuments() }
    ]);
    
    res.json({
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      database: dbStatus,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      collections,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

// ===== AUDIT LOGS (Platform-wide) =====

// Get platform audit logs
app.get('/api/superadmin/audit-logs', authenticateSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, orgId, action, module } = req.query;
    
    const query = {};
    if (orgId) query.organization = orgId;
    if (action) query.action = action;
    if (module) query.module = module;
    
    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('organization', 'name')
      .populate('user', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({
      logs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// ===== BULK OPERATIONS =====

// Bulk update organizations
app.post('/api/superadmin/bulk/organizations', authenticateSuperAdmin, async (req, res) => {
  try {
    const { organizationIds, updates } = req.body;
    
    const result = await Organization.updateMany(
      { _id: { $in: organizationIds } },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk update' });
  }
});

// Export organizations data
app.get('/api/superadmin/export/organizations', authenticateSuperAdmin, async (req, res) => {
  try {
    const organizations = await Organization.find()
      .select('name industry email phone subscription createdAt')
      .lean();
    
    // Add user counts
    const enriched = await Promise.all(organizations.map(async (org) => ({
      ...org,
      userCount: await User.countDocuments({ organization: org._id })
    })));
    
    res.json({ data: enriched, exportedAt: new Date() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to export' });
  }
});

// -----------------------------------------------------------------------------
// INCIDENT ROUTES
// -----------------------------------------------------------------------------

// Get all incidents
app.get('/api/incidents', authenticate, async (req, res) => {
  try {
    if (isDemoMode()) return res.json(demoEmptyList('incidents'));
    
    const { status, type, severity, startDate, endDate, search, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (severity) query.severity = severity;
    if (startDate || endDate) {
      query.dateOccurred = {};
      if (startDate) query.dateOccurred.$gte = new Date(startDate);
      if (endDate) query.dateOccurred.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { incidentNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Incident.countDocuments(query);
    const incidents = await Incident.find(query)
      .populate('reportedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .sort({ dateOccurred: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      incidents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to get incidents' });
  }
});

// Get single incident
app.get('/api/incidents/:id', authenticate, async (req, res) => {
  try {
    const incident = await Incident.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('reportedBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .populate('correctiveActions')
      .populate('investigation.investigator', 'firstName lastName');

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    await createAuditLog(req, 'read', 'incidents', 'Incident', incident._id, incident.incidentNumber, 'Viewed incident');

    res.json({ incident });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get incident' });
  }
});

// Create incident
app.post('/api/incidents', authenticate, checkLimit('maxIncidents'), async (req, res) => {
  try {
    const incidentNumber = await generateNumber(Incident, 'INC', req.organization._id);
    
    const incident = await Incident.create({
      ...req.body,
      organization: req.organization._id,
      incidentNumber,
      reportedBy: req.user._id,
      status: req.body.status || 'draft'
    });

    await createAuditLog(req, 'create', 'incidents', 'Incident', incident._id, incident.incidentNumber, 'Created incident');

    // Create notification for assigned user
    if (incident.assignedTo) {
      await Notification.create({
        organization: req.organization._id,
        user: incident.assignedTo,
        type: 'incident',
        title: 'New Incident Assigned',
        message: `You have been assigned to incident ${incident.incidentNumber}: ${incident.title}`,
        link: `/incidents/${incident._id}`,
        priority: incident.severity === 'severe' || incident.severity === 'catastrophic' ? 'urgent' : 'medium'
      });
    }

    res.status(201).json({ incident });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// Update incident
app.put('/api/incidents/:id', authenticate, async (req, res) => {
  try {
    const incident = await Incident.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const before = incident.toObject();
    Object.assign(incident, req.body);
    incident.updatedAt = new Date();
    await incident.save();

    await createAuditLog(req, 'update', 'incidents', 'Incident', incident._id, incident.incidentNumber, 'Updated incident', { before, after: incident.toObject() });

    res.json({ incident });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// Delete incident
app.delete('/api/incidents/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const incident = await Incident.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    await createAuditLog(req, 'delete', 'incidents', 'Incident', incident._id, incident.incidentNumber, 'Deleted incident');

    res.json({ success: true, message: 'Incident deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete incident' });
  }
});

// -----------------------------------------------------------------------------
// ACTION ITEM ROUTES
// -----------------------------------------------------------------------------

// Get all action items
app.get('/api/action-items', authenticate, async (req, res) => {
  try {
    if (isDemoMode()) return res.json(demoEmptyList('actionItems'));
    
    const { status, priority, assignedTo, dueDate, overdue, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (dueDate) query.dueDate = { $lte: new Date(dueDate) };
    if (overdue === 'true') {
      query.dueDate = { $lt: new Date() };
      query.status = { $nin: ['completed', 'cancelled'] };
    }

    const total = await ActionItem.countDocuments(query);
    const actionItems = await ActionItem.find(query)
      .populate('assignedTo', 'firstName lastName')
      .populate('assignedBy', 'firstName lastName')
      .sort({ dueDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      actionItems,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get action items' });
  }
});

// Get single action item
app.get('/api/action-items/:id', authenticate, async (req, res) => {
  try {
    const actionItem = await ActionItem.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('assignedTo', 'firstName lastName email')
      .populate('assignedBy', 'firstName lastName')
      .populate('verifiedBy', 'firstName lastName')
      .populate('comments.user', 'firstName lastName');

    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    res.json({ actionItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get action item' });
  }
});

// Create action item
app.post('/api/action-items', authenticate, checkLimit('maxActionItems'), async (req, res) => {
  try {
    const actionNumber = await generateNumber(ActionItem, 'ACT', req.organization._id);
    
    const actionItem = await ActionItem.create({
      ...req.body,
      organization: req.organization._id,
      actionNumber,
      assignedBy: req.user._id,
      history: [{
        action: 'Created',
        user: req.user._id,
        details: 'Action item created',
        timestamp: new Date()
      }]
    });

    await createAuditLog(req, 'create', 'action_items', 'ActionItem', actionItem._id, actionItem.actionNumber, 'Created action item');

    // Create notification
    if (actionItem.assignedTo) {
      await Notification.create({
        organization: req.organization._id,
        user: actionItem.assignedTo,
        type: 'action_item',
        title: 'New Action Item Assigned',
        message: `You have been assigned action item ${actionItem.actionNumber}: ${actionItem.title}`,
        link: `/action-items/${actionItem._id}`,
        priority: actionItem.priority === 'critical' ? 'urgent' : 'medium'
      });
    }

    res.status(201).json({ actionItem });
  } catch (error) {
    console.error('Create action item error:', error);
    res.status(500).json({ error: 'Failed to create action item' });
  }
});

// Update action item
app.put('/api/action-items/:id', authenticate, async (req, res) => {
  try {
    const actionItem = await ActionItem.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    const before = actionItem.toObject();
    const statusChanged = req.body.status && req.body.status !== actionItem.status;
    
    Object.assign(actionItem, req.body);
    actionItem.updatedAt = new Date();

    // Add history entry
    if (statusChanged) {
      actionItem.history.push({
        action: 'Status Changed',
        user: req.user._id,
        details: `Status changed from ${before.status} to ${req.body.status}`,
        timestamp: new Date()
      });

      if (req.body.status === 'completed') {
        actionItem.completedDate = new Date();
      }
    }

    await actionItem.save();

    await createAuditLog(req, 'update', 'action_items', 'ActionItem', actionItem._id, actionItem.actionNumber, 'Updated action item', { before, after: actionItem.toObject() });

    res.json({ actionItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update action item' });
  }
});

// Add comment to action item
app.post('/api/action-items/:id/comments', authenticate, async (req, res) => {
  try {
    const actionItem = await ActionItem.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    actionItem.comments.push({
      user: req.user._id,
      comment: req.body.comment,
      createdAt: new Date()
    });

    actionItem.history.push({
      action: 'Comment Added',
      user: req.user._id,
      details: 'Added a comment',
      timestamp: new Date()
    });

    await actionItem.save();

    res.json({ actionItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete action item
app.delete('/api/action-items/:id', authenticate, authorize('admin', 'superadmin', 'manager'), async (req, res) => {
  try {
    const actionItem = await ActionItem.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    await createAuditLog(req, 'delete', 'action_items', 'ActionItem', actionItem._id, actionItem.actionNumber, 'Deleted action item');

    res.json({ success: true, message: 'Action item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete action item' });
  }
});

// -----------------------------------------------------------------------------
// INSPECTION ROUTES
// -----------------------------------------------------------------------------

// Get all inspections
app.get('/api/inspections', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const { status, type, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const total = await Inspection.countDocuments(query);
    const inspections = await Inspection.find(query)
      .populate('inspector', 'firstName lastName')
      .populate('template', 'name')
      .sort({ scheduledDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      inspections,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get inspections' });
  }
});

// Get single inspection
app.get('/api/inspections/:id', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const inspection = await Inspection.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('inspector', 'firstName lastName email')
      .populate('participants', 'firstName lastName')
      .populate('template')
      .populate('actionItems');

    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    res.json({ inspection });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get inspection' });
  }
});

// Create inspection
app.post('/api/inspections', authenticate, requireFeature('auditModule'), checkLimit('maxInspections'), async (req, res) => {
  try {
    const inspectionNumber = await generateNumber(Inspection, 'INS', req.organization._id);
    
    const inspection = await Inspection.create({
      ...req.body,
      organization: req.organization._id,
      inspectionNumber,
      inspector: req.body.inspector || req.user._id
    });

    await createAuditLog(req, 'create', 'inspections', 'Inspection', inspection._id, inspection.inspectionNumber, 'Created inspection');

    res.status(201).json({ inspection });
  } catch (error) {
    console.error('Create inspection error:', error);
    res.status(500).json({ error: 'Failed to create inspection' });
  }
});

// Update inspection
app.put('/api/inspections/:id', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const inspection = await Inspection.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    const before = inspection.toObject();
    Object.assign(inspection, req.body);
    inspection.updatedAt = new Date();

    // Calculate summary if sections are provided
    if (req.body.sections) {
      let totalItems = 0, passedItems = 0, failedItems = 0, naItems = 0;
      
      inspection.sections.forEach(section => {
        section.items.forEach(item => {
          totalItems++;
          if (item.status === 'pass') passedItems++;
          else if (item.status === 'fail') failedItems++;
          else if (item.status === 'na') naItems++;
        });
      });

      inspection.summary = {
        totalItems,
        passedItems,
        failedItems,
        naItems,
        score: totalItems > 0 ? Math.round((passedItems / (totalItems - naItems)) * 100) : 0
      };
    }

    await inspection.save();

    await createAuditLog(req, 'update', 'inspections', 'Inspection', inspection._id, inspection.inspectionNumber, 'Updated inspection', { before, after: inspection.toObject() });

    res.json({ inspection });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inspection' });
  }
});

// Delete inspection
app.delete('/api/inspections/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const inspection = await Inspection.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    await createAuditLog(req, 'delete', 'inspections', 'Inspection', inspection._id, inspection.inspectionNumber, 'Deleted inspection');

    res.json({ success: true, message: 'Inspection deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete inspection' });
  }
});

// -----------------------------------------------------------------------------
// INSPECTION TEMPLATE ROUTES
// -----------------------------------------------------------------------------

app.get('/api/inspection-templates', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const templates = await InspectionTemplate.find({ organization: req.organization._id, isActive: true });
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

app.post('/api/inspection-templates', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const template = await InspectionTemplate.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ template });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

app.put('/api/inspection-templates/:id', authenticate, requireFeature('auditModule'), async (req, res) => {
  try {
    const template = await InspectionTemplate.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ template });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

app.delete('/api/inspection-templates/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    await InspectionTemplate.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { isActive: false }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// -----------------------------------------------------------------------------
// TRAINING ROUTES
// -----------------------------------------------------------------------------

// Get all training courses
app.get('/api/training', authenticate, requireFeature('trainingModule'), async (req, res) => {
  try {
    const { type, category, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id, isActive: true };
    if (type) query.type = type;
    if (category) query.category = category;

    const total = await Training.countDocuments(query);
    const trainings = await Training.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      trainings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get training courses' });
  }
});

// Get single training
app.get('/api/training/:id', authenticate, requireFeature('trainingModule'), async (req, res) => {
  try {
    const training = await Training.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }
    res.json({ training });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get training' });
  }
});

// Create training
app.post('/api/training', authenticate, requireFeature('trainingModule'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const training = await Training.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });

    await createAuditLog(req, 'create', 'training', 'Training', training._id, training.title, 'Created training course');

    res.status(201).json({ training });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// Update training
app.put('/api/training/:id', authenticate, requireFeature('trainingModule'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const training = await Training.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ training });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// Get training records for current user
app.get('/api/training-records/my', authenticate, requireFeature('trainingModule'), async (req, res) => {
  try {
    const records = await TrainingRecord.find({ user: req.user._id })
      .populate('training')
      .sort({ dueDate: 1 });
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get training records' });
  }
});

// Get all training records (admin)
app.get('/api/training-records', authenticate, requireFeature('trainingModule'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const { userId, trainingId, status, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    if (userId) query.user = userId;
    if (trainingId) query.training = trainingId;
    if (status) query.status = status;

    const total = await TrainingRecord.countDocuments(query);
    const records = await TrainingRecord.find(query)
      .populate('training', 'title type')
      .populate('user', 'firstName lastName email department')
      .sort({ dueDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      records,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get training records' });
  }
});

// Assign training
app.post('/api/training-records', authenticate, requireFeature('trainingModule'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const { trainingId, userIds, dueDate } = req.body;

    const training = await Training.findById(trainingId);
    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    const records = [];
    for (const userId of userIds) {
      const existingRecord = await TrainingRecord.findOne({
        training: trainingId,
        user: userId,
        status: { $in: ['assigned', 'in_progress'] }
      });

      if (!existingRecord) {
        const record = await TrainingRecord.create({
          organization: req.organization._id,
          training: trainingId,
          user: userId,
          dueDate,
          status: 'assigned'
        });
        records.push(record);

        // Create notification
        await Notification.create({
          organization: req.organization._id,
          user: userId,
          type: 'training',
          title: 'Training Assigned',
          message: `You have been assigned training: ${training.title}`,
          link: `/training/${trainingId}`,
          priority: 'medium'
        });
      }
    }

    res.status(201).json({ records, assigned: records.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign training' });
  }
});

// Complete training
app.post('/api/training-records/:id/complete', authenticate, requireFeature('trainingModule'), async (req, res) => {
  try {
    const record = await TrainingRecord.findOne({ _id: req.params.id, user: req.user._id });
    if (!record) {
      return res.status(404).json({ error: 'Training record not found' });
    }

    const training = await Training.findById(record.training);
    
    record.status = 'completed';
    record.completedDate = new Date();
    record.score = req.body.score;

    // Calculate expiration date
    if (training.frequency.type !== 'one_time') {
      let expirationDays;
      switch (training.frequency.type) {
        case 'annual': expirationDays = 365; break;
        case 'biannual': expirationDays = 180; break;
        case 'quarterly': expirationDays = 90; break;
        case 'monthly': expirationDays = 30; break;
        case 'custom': expirationDays = training.frequency.customDays; break;
      }
      record.expirationDate = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
    }

    await record.save();

    await createAuditLog(req, 'update', 'training', 'TrainingRecord', record._id, training.title, 'Completed training');

    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete training' });
  }
});

// -----------------------------------------------------------------------------
// DOCUMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/documents', authenticate, async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const total = await Document.countDocuments(query);
    const documents = await Document.find(query)
      .populate('owner', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      documents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

app.get('/api/documents/:id', authenticate, async (req, res) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('owner', 'firstName lastName email')
      .populate('approver', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .populate('relatedDocuments', 'title documentNumber');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await createAuditLog(req, 'read', 'documents', 'Document', document._id, document.title, 'Viewed document');

    res.json({ document });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document' });
  }
});

app.post('/api/documents', authenticate, checkLimit('maxDocuments'), upload.single('file'), async (req, res) => {
  try {
    const documentData = {
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id,
      owner: req.user._id
    };

    if (req.file) {
      documentData.file = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

    if (req.body.tags && typeof req.body.tags === 'string') {
      documentData.tags = req.body.tags.split(',').map(t => t.trim());
    }

    const document = await Document.create(documentData);

    await createAuditLog(req, 'create', 'documents', 'Document', document._id, document.title, 'Created document');

    res.status(201).json({ document });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

app.put('/api/documents/:id', authenticate, upload.single('file'), async (req, res) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const before = document.toObject();
    
    // Handle version control
    if (req.file && document.file) {
      document.revisionHistory.push({
        version: document.version,
        date: document.updatedAt,
        changedBy: req.user._id,
        changes: req.body.revisionNotes || 'Updated document',
        file: document.file.filename
      });
      
      // Increment version
      const [major, minor] = document.version.split('.').map(Number);
      document.version = req.body.majorUpdate ? `${major + 1}.0` : `${major}.${minor + 1}`;
      
      document.file = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

    Object.keys(req.body).forEach(key => {
      if (key !== 'file' && key !== 'revisionNotes' && key !== 'majorUpdate') {
        document[key] = req.body[key];
      }
    });

    document.updatedAt = new Date();
    await document.save();

    await createAuditLog(req, 'update', 'documents', 'Document', document._id, document.title, 'Updated document', { before, after: document.toObject() });

    res.json({ document });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document' });
  }
});

app.delete('/api/documents/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const document = await Document.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await createAuditLog(req, 'delete', 'documents', 'Document', document._id, document.title, 'Deleted document');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// -----------------------------------------------------------------------------
// OSHA 300 LOG ROUTES
// -----------------------------------------------------------------------------

app.get('/api/osha-logs', authenticate, requireFeature('oshaLogs'), async (req, res) => {
  try {
    const logs = await OSHA300Log.find({ organization: req.organization._id }).sort({ year: -1 });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get OSHA logs' });
  }
});

app.get('/api/osha-logs/:year', authenticate, requireFeature('oshaLogs'), async (req, res) => {
  try {
    let log = await OSHA300Log.findOne({ organization: req.organization._id, year: parseInt(req.params.year) })
      .populate('entries.incident');

    if (!log) {
      // Create new log for the year
      log = await OSHA300Log.create({
        organization: req.organization._id,
        year: parseInt(req.params.year),
        establishment: {
          name: req.organization.settings.oshaEstablishmentName || req.organization.name,
          address: req.organization.settings.oshaEstablishmentAddress || '',
          naicsCode: req.organization.settings.naicsCode || ''
        },
        entries: [],
        summary: {
          totalDeaths: 0,
          totalDaysAway: 0,
          totalDaysTransferRestriction: 0,
          totalOtherRecordable: 0,
          totalInjuries: 0,
          totalSkinDisorders: 0,
          totalRespiratoryConditions: 0,
          totalPoisonings: 0,
          totalHearingLoss: 0,
          totalOtherIllnesses: 0,
          totalDaysAwayFromWork: 0,
          totalDaysJobTransferRestriction: 0
        }
      });
    }

    res.json({ log });
  } catch (error) {
    console.error('Get OSHA log error:', error);
    res.status(500).json({ error: 'Failed to get OSHA log' });
  }
});

app.put('/api/osha-logs/:year', authenticate, requireFeature('oshaLogs'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const log = await OSHA300Log.findOneAndUpdate(
      { organization: req.organization._id, year: parseInt(req.params.year) },
      { ...req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    await createAuditLog(req, 'update', 'osha_logs', 'OSHA300Log', log._id, `OSHA 300 Log ${req.params.year}`, 'Updated OSHA log');

    res.json({ log });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update OSHA log' });
  }
});

// Sync recordable incidents to OSHA log
app.post('/api/osha-logs/:year/sync', authenticate, requireFeature('oshaLogs'), authorize('admin', 'manager'), async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const recordableIncidents = await Incident.find({
      organization: req.organization._id,
      oshaRecordable: true,
      dateOccurred: { $gte: startDate, $lte: endDate }
    });

    let log = await OSHA300Log.findOne({ organization: req.organization._id, year });
    if (!log) {
      log = new OSHA300Log({
        organization: req.organization._id,
        year,
        establishment: {
          name: req.organization.settings.oshaEstablishmentName || req.organization.name
        }
      });
    }

    // Clear existing entries and rebuild from incidents
    log.entries = recordableIncidents.map((incident, index) => {
      const involvedPerson = incident.involvedPersons[0] || {};
      return {
        caseNumber: `${year}-${String(index + 1).padStart(3, '0')}`,
        employeeName: involvedPerson.name || 'Unknown',
        jobTitle: involvedPerson.jobTitle || '',
        dateOfInjury: incident.dateOccurred,
        whereOccurred: incident.location?.specificLocation || incident.location?.site || '',
        describeInjury: incident.description,
        classifyCase: {
          death: incident.oshaClassification === 'death',
          daysAwayFromWork: incident.oshaClassification === 'days_away',
          jobTransferOrRestriction: incident.oshaClassification === 'restricted_transfer',
          otherRecordableCase: incident.oshaClassification === 'other_recordable'
        },
        daysAwayFromWork: involvedPerson.daysAwayFromWork || 0,
        daysJobTransferRestriction: involvedPerson.daysRestrictedDuty || 0,
        injuryType: {
          injury: incident.type === 'injury',
          skinDisorder: false,
          respiratoryCondition: false,
          poisoning: false,
          hearingLoss: false,
          allOtherIllnesses: incident.type === 'illness'
        },
        incident: incident._id
      };
    });

    // Calculate summary
    log.summary = {
      totalDeaths: log.entries.filter(e => e.classifyCase.death).length,
      totalDaysAway: log.entries.filter(e => e.classifyCase.daysAwayFromWork).length,
      totalDaysTransferRestriction: log.entries.filter(e => e.classifyCase.jobTransferOrRestriction).length,
      totalOtherRecordable: log.entries.filter(e => e.classifyCase.otherRecordableCase).length,
      totalInjuries: log.entries.filter(e => e.injuryType.injury).length,
      totalSkinDisorders: log.entries.filter(e => e.injuryType.skinDisorder).length,
      totalRespiratoryConditions: log.entries.filter(e => e.injuryType.respiratoryCondition).length,
      totalPoisonings: log.entries.filter(e => e.injuryType.poisoning).length,
      totalHearingLoss: log.entries.filter(e => e.injuryType.hearingLoss).length,
      totalOtherIllnesses: log.entries.filter(e => e.injuryType.allOtherIllnesses).length,
      totalDaysAwayFromWork: log.entries.reduce((sum, e) => sum + (e.daysAwayFromWork || 0), 0),
      totalDaysJobTransferRestriction: log.entries.reduce((sum, e) => sum + (e.daysJobTransferRestriction || 0), 0)
    };

    await log.save();

    await createAuditLog(req, 'update', 'osha_logs', 'OSHA300Log', log._id, `OSHA 300 Log ${year}`, 'Synced incidents to OSHA log');

    res.json({ log, syncedIncidents: recordableIncidents.length });
  } catch (error) {
    console.error('Sync OSHA log error:', error);
    res.status(500).json({ error: 'Failed to sync OSHA log' });
  }
});

// Generate OSHA 300/300A/301 PDF
app.get('/api/osha-logs/:year/export/:form', authenticate, requireFeature('oshaLogs'), async (req, res) => {
  try {
    const { year, form } = req.params;
    const log = await OSHA300Log.findOne({ organization: req.organization._id, year: parseInt(year) });
    
    if (!log) {
      return res.status(404).json({ error: 'OSHA log not found' });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=OSHA-${form}-${year}.pdf`);
    doc.pipe(res);

    if (form === '300') {
      // OSHA 300 Log
      doc.fontSize(16).text('OSHA Form 300', { align: 'center' });
      doc.fontSize(12).text('Log of Work-Related Injuries and Illnesses', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Year: ${year}`);
      doc.text(`Establishment: ${log.establishment.name}`);
      doc.text(`Address: ${log.establishment.address || 'N/A'}`);
      doc.moveDown();

      // Table headers
      doc.fontSize(8);
      doc.text('Case No. | Employee Name | Job Title | Date | Location | Description | Classification', { continued: false });
      doc.moveDown(0.5);

      log.entries.forEach(entry => {
        doc.text(`${entry.caseNumber} | ${entry.employeeName} | ${entry.jobTitle} | ${new Date(entry.dateOfInjury).toLocaleDateString()} | ${entry.whereOccurred} | ${entry.describeInjury?.substring(0, 50)}...`);
      });

    } else if (form === '300a') {
      // OSHA 300A Summary
      doc.fontSize(16).text('OSHA Form 300A', { align: 'center' });
      doc.fontSize(12).text('Summary of Work-Related Injuries and Illnesses', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Calendar Year: ${year}`);
      doc.text(`Establishment: ${log.establishment.name}`);
      doc.moveDown();

      doc.text('Number of Cases:');
      doc.text(`  Total deaths: ${log.summary.totalDeaths}`);
      doc.text(`  Cases with days away from work: ${log.summary.totalDaysAway}`);
      doc.text(`  Cases with job transfer or restriction: ${log.summary.totalDaysTransferRestriction}`);
      doc.text(`  Other recordable cases: ${log.summary.totalOtherRecordable}`);
      doc.moveDown();

      doc.text('Number of Days:');
      doc.text(`  Total days away from work: ${log.summary.totalDaysAwayFromWork}`);
      doc.text(`  Total days of job transfer or restriction: ${log.summary.totalDaysJobTransferRestriction}`);
      doc.moveDown();

      doc.text('Injury and Illness Types:');
      doc.text(`  Injuries: ${log.summary.totalInjuries}`);
      doc.text(`  Skin disorders: ${log.summary.totalSkinDisorders}`);
      doc.text(`  Respiratory conditions: ${log.summary.totalRespiratoryConditions}`);
      doc.text(`  Poisonings: ${log.summary.totalPoisonings}`);
      doc.text(`  Hearing loss: ${log.summary.totalHearingLoss}`);
      doc.text(`  All other illnesses: ${log.summary.totalOtherIllnesses}`);

    } else if (form === '301') {
      // OSHA 301 - Individual incident reports
      doc.fontSize(16).text('OSHA Form 301', { align: 'center' });
      doc.fontSize(12).text('Injury and Illness Incident Report', { align: 'center' });
      doc.moveDown();

      log.entries.forEach((entry, index) => {
        if (index > 0) doc.addPage();
        
        doc.fontSize(12).text(`Case Number: ${entry.caseNumber}`);
        doc.fontSize(10);
        doc.text(`Employee Name: ${entry.employeeName}`);
        doc.text(`Job Title: ${entry.jobTitle}`);
        doc.text(`Date of Injury: ${new Date(entry.dateOfInjury).toLocaleDateString()}`);
        doc.text(`Where did the event occur: ${entry.whereOccurred}`);
        doc.moveDown();
        doc.text('Description of injury or illness:');
        doc.text(entry.describeInjury || 'N/A');
        doc.moveDown();
        doc.text(`Days away from work: ${entry.daysAwayFromWork || 0}`);
        doc.text(`Days of restricted work: ${entry.daysJobTransferRestriction || 0}`);
      });
    }

    doc.end();

    await createAuditLog(req, 'export', 'osha_logs', 'OSHA300Log', log._id, `OSHA ${form} ${year}`, `Exported OSHA ${form} form`);
  } catch (error) {
    console.error('Export OSHA log error:', error);
    res.status(500).json({ error: 'Failed to export OSHA log' });
  }
});

// -----------------------------------------------------------------------------
// USER MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/users', authenticate, authorize('admin', 'superadmin', 'manager'), async (req, res) => {
  try {
    const { role, department, isActive, page = 1, limit = 20 } = req.query;
    
    const query = { organization: req.organization._id };
    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password -verification.email.token -verification.phone.code -twoFactorAuth.secret')
      .sort({ lastName: 1, firstName: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

app.get('/api/users/:id', authenticate, authorize('admin', 'superadmin', 'manager'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id })
      .select('-password -verification.email.token -verification.phone.code -twoFactorAuth.secret');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

app.post('/api/users', authenticate, authorize('admin', 'superadmin'), checkLimit('maxUsers'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, department, location, jobTitle, permissions } = req.body;

    const existingUser = await User.findOne({ organization: req.organization._id, email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists in organization' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      organization: req.organization._id,
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'user',
      department,
      location,
      jobTitle,
      permissions: permissions || getDefaultPermissions(role || 'user'),
      verification: {
        email: {
          verified: false,
          token: emailVerificationToken,
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }
    });

    // Send welcome email
    const verifyUrl = `${CONFIG.APP_URL}/verify-email?token=${emailVerificationToken}`;
    await sendEmail(
      email,
      `Welcome to ${req.organization.name} EHS System`,
      `<h1>Welcome to the EHS Management System</h1>
       <p>You have been added to ${req.organization.name}'s EHS system.</p>
       <p>Your temporary password is: ${password}</p>
       <p>Please verify your email by clicking: <a href="${verifyUrl}">${verifyUrl}</a></p>
       <p>You will be asked to change your password on first login.</p>`
    );

    await createAuditLog(req, 'create', 'users', 'User', user._id, user.email, 'Created user');

    res.status(201).json({ 
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password, ...updateData } = req.body;
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    Object.assign(user, updateData);
    user.updatedAt = new Date();
    await user.save();

    await createAuditLog(req, 'update', 'users', 'User', user._id, user.email, 'Updated user');

    res.json({ 
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        permissions: user.permissions,
        isActive: user.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await createAuditLog(req, 'delete', 'users', 'User', user._id, user.email, 'Deactivated user');

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Helper function for default permissions
function getDefaultPermissions(role) {
  const permissions = {
    incidents: { view: true, create: false, edit: false, delete: false, approve: false },
    actionItems: { view: true, create: false, edit: false, delete: false, approve: false },
    inspections: { view: true, create: false, edit: false, delete: false, approve: false },
    training: { view: true, create: false, edit: false, delete: false, approve: false },
    documents: { view: true, create: false, edit: false, delete: false, approve: false },
    reports: { view: true, create: false, export: false },
    admin: { users: false, settings: false, billing: false }
  };

  switch (role) {
    case 'admin':
    case 'superadmin':
      Object.keys(permissions).forEach(key => {
        Object.keys(permissions[key]).forEach(perm => {
          permissions[key][perm] = true;
        });
      });
      break;
    case 'manager':
      permissions.incidents = { view: true, create: true, edit: true, delete: false, approve: true };
      permissions.actionItems = { view: true, create: true, edit: true, delete: false, approve: true };
      permissions.inspections = { view: true, create: true, edit: true, delete: false, approve: true };
      permissions.training = { view: true, create: true, edit: true, delete: false, approve: true };
      permissions.documents = { view: true, create: true, edit: true, delete: false, approve: false };
      permissions.reports = { view: true, create: true, export: true };
      break;
    case 'supervisor':
      permissions.incidents = { view: true, create: true, edit: true, delete: false, approve: false };
      permissions.actionItems = { view: true, create: true, edit: true, delete: false, approve: false };
      permissions.inspections = { view: true, create: true, edit: true, delete: false, approve: false };
      permissions.training = { view: true, create: false, edit: false, delete: false, approve: false };
      permissions.documents = { view: true, create: true, edit: false, delete: false, approve: false };
      permissions.reports = { view: true, create: true, export: false };
      break;
    case 'user':
      permissions.incidents = { view: true, create: true, edit: false, delete: false, approve: false };
      permissions.actionItems = { view: true, create: false, edit: false, delete: false, approve: false };
      break;
  }

  return permissions;
}

// -----------------------------------------------------------------------------
// ORGANIZATION ROUTES
// -----------------------------------------------------------------------------

app.get('/api/organization', authenticate, async (req, res) => {
  try {
    const organization = await Organization.findById(req.organization._id);
    res.json({ organization });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

app.put('/api/organization', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const before = req.organization.toObject();
    Object.assign(req.organization, req.body);
    req.organization.updatedAt = new Date();
    await req.organization.save();

    await createAuditLog(req, 'update', 'organization', 'Organization', req.organization._id, req.organization.name, 'Updated organization settings', { before, after: req.organization.toObject() });

    res.json({ organization: req.organization });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Locations
app.post('/api/organization/locations', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    req.organization.locations.push(req.body);
    await req.organization.save();
    res.json({ locations: req.organization.locations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add location' });
  }
});

app.put('/api/organization/locations/:index', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    if (index >= 0 && index < req.organization.locations.length) {
      req.organization.locations[index] = { ...req.organization.locations[index], ...req.body };
      await req.organization.save();
    }
    res.json({ locations: req.organization.locations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Departments
app.post('/api/organization/departments', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    req.organization.departments.push(req.body);
    await req.organization.save();
    res.json({ departments: req.organization.departments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add department' });
  }
});

// -----------------------------------------------------------------------------
// NOTIFICATION ROUTES
// -----------------------------------------------------------------------------

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;
    
    const query = { user: req.user._id };
    if (unreadOnly === 'true') query.read = false;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// -----------------------------------------------------------------------------
// AUDIT LOG ROUTES
// -----------------------------------------------------------------------------

app.get('/api/audit-logs', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { module, action, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const query = { organization: req.organization._id };
    if (module) query.module = module;
    if (action) query.action = action;
    if (userId) query.user = userId;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Export audit logs
app.get('/api/audit-logs/export', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { startDate, endDate, format = 'xlsx' } = req.query;
    
    const query = { organization: req.organization._id };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ timestamp: -1 });

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Audit Logs');

      worksheet.columns = [
        { header: 'Timestamp', key: 'timestamp', width: 20 },
        { header: 'User', key: 'user', width: 25 },
        { header: 'Action', key: 'action', width: 15 },
        { header: 'Module', key: 'module', width: 15 },
        { header: 'Entity', key: 'entity', width: 25 },
        { header: 'Details', key: 'details', width: 50 },
        { header: 'IP Address', key: 'ip', width: 15 }
      ];

      logs.forEach(log => {
        worksheet.addRow({
          timestamp: log.timestamp,
          user: log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
          action: log.action,
          module: log.module,
          entity: log.entityName,
          details: log.details,
          ip: log.ipAddress
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({ logs });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// -----------------------------------------------------------------------------
// DASHBOARD & REPORTING ROUTES
// -----------------------------------------------------------------------------

app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    // Demo mode - return sample dashboard data
    if (isDemoMode()) {
      return res.json({
        incidents: { total: 12, open: 3, ytd: 12, mtd: 2, recordable: 1 },
        actionItems: { total: 25, open: 8, overdue: 2 },
        inspections: { total: 15, completed: 12, scheduled: 3 },
        training: { assigned: 5, overdue: 1, completed: 20 },
        recentIncidents: [],
        recentActionItems: [],
        incidentsByMonth: [
          { month: 'Jan', count: 2 }, { month: 'Feb', count: 1 }, { month: 'Mar', count: 3 },
          { month: 'Apr', count: 1 }, { month: 'May', count: 2 }, { month: 'Jun', count: 1 }
        ],
        incidentsByType: [
          { type: 'injury', count: 5 }, { type: 'near_miss', count: 4 }, { type: 'property_damage', count: 3 }
        ],
        tier: 'enterprise'
      });
    }
    
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Incidents summary
    const [
      totalIncidents,
      openIncidents,
      ytdIncidents,
      mtdIncidents,
      recordableIncidents
    ] = await Promise.all([
      Incident.countDocuments({ organization: req.organization._id }),
      Incident.countDocuments({ organization: req.organization._id, status: { $nin: ['closed', 'draft'] } }),
      Incident.countDocuments({ organization: req.organization._id, dateOccurred: { $gte: startOfYear } }),
      Incident.countDocuments({ organization: req.organization._id, dateOccurred: { $gte: startOfMonth } }),
      Incident.countDocuments({ organization: req.organization._id, oshaRecordable: true, dateOccurred: { $gte: startOfYear } })
    ]);

    // Action items summary
    const [
      totalActionItems,
      openActionItems,
      overdueActionItems
    ] = await Promise.all([
      ActionItem.countDocuments({ organization: req.organization._id }),
      ActionItem.countDocuments({ organization: req.organization._id, status: { $nin: ['completed', 'cancelled'] } }),
      ActionItem.countDocuments({ 
        organization: req.organization._id, 
        status: { $nin: ['completed', 'cancelled'] },
        dueDate: { $lt: now }
      })
    ]);

    // Inspections summary (if feature enabled)
    let inspectionsSummary = null;
    const tier = req.organization.subscription.tier;
    if (SUBSCRIPTION_TIERS[tier].auditModule) {
      const [totalInspections, completedInspections, scheduledInspections] = await Promise.all([
        Inspection.countDocuments({ organization: req.organization._id }),
        Inspection.countDocuments({ organization: req.organization._id, status: 'completed', completedDate: { $gte: startOfMonth } }),
        Inspection.countDocuments({ organization: req.organization._id, status: 'scheduled', scheduledDate: { $gte: now } })
      ]);
      inspectionsSummary = { totalInspections, completedInspections, scheduledInspections };
    }

    // Training summary (if feature enabled)
    let trainingSummary = null;
    if (SUBSCRIPTION_TIERS[tier].trainingModule) {
      const [assignedTraining, overdueTraining, completedTraining] = await Promise.all([
        TrainingRecord.countDocuments({ organization: req.organization._id, status: 'assigned' }),
        TrainingRecord.countDocuments({ organization: req.organization._id, status: 'assigned', dueDate: { $lt: now } }),
        TrainingRecord.countDocuments({ organization: req.organization._id, status: 'completed', completedDate: { $gte: startOfMonth } })
      ]);
      trainingSummary = { assignedTraining, overdueTraining, completedTraining };
    }

    // Recent activity
    const recentIncidents = await Incident.find({ organization: req.organization._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('incidentNumber title type severity status dateOccurred');

    const recentActionItems = await ActionItem.find({ organization: req.organization._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('actionNumber title priority status dueDate');

    // Incident trends (last 12 months)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const incidentTrends = await Incident.aggregate([
      {
        $match: {
          organization: req.organization._id,
          dateOccurred: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$dateOccurred' },
            month: { $month: '$dateOccurred' }
          },
          count: { $sum: 1 },
          recordable: { $sum: { $cond: ['$oshaRecordable', 1, 0] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Incidents by type
    const incidentsByType = await Incident.aggregate([
      {
        $match: {
          organization: req.organization._id,
          dateOccurred: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      incidents: {
        total: totalIncidents,
        open: openIncidents,
        ytd: ytdIncidents,
        mtd: mtdIncidents,
        recordable: recordableIncidents
      },
      actionItems: {
        total: totalActionItems,
        open: openActionItems,
        overdue: overdueActionItems
      },
      inspections: inspectionsSummary,
      training: trainingSummary,
      recentActivity: {
        incidents: recentIncidents,
        actionItems: recentActionItems
      },
      trends: {
        incidents: incidentTrends,
        byType: incidentsByType
      },
      subscription: {
        tier: req.organization.subscription.tier,
        features: SUBSCRIPTION_TIERS[req.organization.subscription.tier]
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Reports endpoint
app.get('/api/reports/:type', authenticate, requireFeature('advancedReporting'), async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    let reportData;

    switch (type) {
      case 'incidents':
        reportData = await Incident.aggregate([
          {
            $match: {
              organization: req.organization._id,
              ...(Object.keys(dateFilter).length && { dateOccurred: dateFilter })
            }
          },
          {
            $group: {
              _id: {
                type: '$type',
                severity: '$severity',
                month: { $month: '$dateOccurred' },
                year: { $year: '$dateOccurred' }
              },
              count: { $sum: 1 },
              recordable: { $sum: { $cond: ['$oshaRecordable', 1, 0] } }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        break;

      case 'action-items':
        reportData = await ActionItem.aggregate([
          {
            $match: {
              organization: req.organization._id,
              ...(Object.keys(dateFilter).length && { createdAt: dateFilter })
            }
          },
          {
            $group: {
              _id: {
                status: '$status',
                priority: '$priority',
                type: '$type'
              },
              count: { $sum: 1 },
              avgDaysToComplete: {
                $avg: {
                  $cond: [
                    { $eq: ['$status', 'completed'] },
                    { $divide: [{ $subtract: ['$completedDate', '$createdAt'] }, 86400000] },
                    null
                  ]
                }
              }
            }
          }
        ]);
        break;

      case 'training':
        reportData = await TrainingRecord.aggregate([
          {
            $match: {
              organization: req.organization._id,
              ...(Object.keys(dateFilter).length && { assignedDate: dateFilter })
            }
          },
          {
            $lookup: {
              from: 'trainings',
              localField: 'training',
              foreignField: '_id',
              as: 'trainingInfo'
            }
          },
          { $unwind: '$trainingInfo' },
          {
            $group: {
              _id: {
                training: '$trainingInfo.title',
                status: '$status'
              },
              count: { $sum: 1 },
              avgScore: { $avg: '$score' }
            }
          }
        ]);
        break;

      case 'inspections':
        reportData = await Inspection.aggregate([
          {
            $match: {
              organization: req.organization._id,
              ...(Object.keys(dateFilter).length && { scheduledDate: dateFilter })
            }
          },
          {
            $group: {
              _id: {
                type: '$type',
                status: '$status',
                month: { $month: '$scheduledDate' },
                year: { $year: '$scheduledDate' }
              },
              count: { $sum: 1 },
              avgScore: { $avg: '$summary.score' },
              totalFindings: { $sum: '$summary.failedItems' }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      if (reportData.length > 0) {
        const flatData = reportData.map(item => ({
          ...item._id,
          ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== '_id'))
        }));

        const columns = Object.keys(flatData[0]).map(key => ({
          header: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          key,
          width: 15
        }));

        worksheet.columns = columns;
        flatData.forEach(row => worksheet.addRow(row));
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({ report: reportData });
    }

    await createAuditLog(req, 'export', 'reports', 'Report', null, `${type} report`, `Generated ${type} report`);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// -----------------------------------------------------------------------------
// CUSTOM FORMS ROUTES (Enterprise only)
// -----------------------------------------------------------------------------

app.get('/api/custom-forms', authenticate, requireFeature('customForms'), async (req, res) => {
  try {
    const forms = await CustomForm.find({ organization: req.organization._id, isActive: true });
    res.json({ forms });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get custom forms' });
  }
});

app.post('/api/custom-forms', authenticate, requireFeature('customForms'), authorize('admin'), async (req, res) => {
  try {
    const form = await CustomForm.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ form });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create custom form' });
  }
});

app.get('/api/custom-forms/:id/submissions', authenticate, requireFeature('customForms'), async (req, res) => {
  try {
    const submissions = await CustomFormSubmission.find({
      form: req.params.id,
      organization: req.organization._id
    })
      .populate('submittedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ submissions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

app.post('/api/custom-forms/:id/submit', authenticate, requireFeature('customForms'), async (req, res) => {
  try {
    const form = await CustomForm.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const submission = await CustomFormSubmission.create({
      organization: req.organization._id,
      form: form._id,
      submittedBy: req.user._id,
      data: req.body.data,
      status: form.workflow.approvalRequired ? 'pending_approval' : 'submitted'
    });

    res.status(201).json({ submission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// -----------------------------------------------------------------------------
// RISK ASSESSMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/risk-assessments', authenticate, requireFeature('riskAssessment'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await RiskAssessment.countDocuments(query);
    const assessments = await RiskAssessment.find(query)
      .populate('assessor', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ assessments, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get risk assessments' });
  }
});

app.get('/api/risk-assessments/:id', authenticate, requireFeature('riskAssessment'), async (req, res) => {
  try {
    const assessment = await RiskAssessment.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('assessor', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .populate('actionItems');
    if (!assessment) return res.status(404).json({ error: 'Risk assessment not found' });
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get risk assessment' });
  }
});

app.post('/api/risk-assessments', authenticate, requireFeature('riskAssessment'), async (req, res) => {
  try {
    const assessmentNumber = await generateNumber(RiskAssessment, 'RA', req.organization._id);
    const assessment = await RiskAssessment.create({
      ...req.body,
      organization: req.organization._id,
      assessmentNumber,
      assessor: req.user._id
    });
    await createAuditLog(req, 'create', 'risk_assessment', 'RiskAssessment', assessment._id, assessment.assessmentNumber, 'Created risk assessment');
    res.status(201).json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create risk assessment' });
  }
});

app.put('/api/risk-assessments/:id', authenticate, requireFeature('riskAssessment'), async (req, res) => {
  try {
    const assessment = await RiskAssessment.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!assessment) return res.status(404).json({ error: 'Risk assessment not found' });
    await createAuditLog(req, 'update', 'risk_assessment', 'RiskAssessment', assessment._id, assessment.assessmentNumber, 'Updated risk assessment');
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update risk assessment' });
  }
});

app.delete('/api/risk-assessments/:id', authenticate, requireFeature('riskAssessment'), authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const assessment = await RiskAssessment.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!assessment) return res.status(404).json({ error: 'Risk assessment not found' });
    await createAuditLog(req, 'delete', 'risk_assessment', 'RiskAssessment', assessment._id, assessment.assessmentNumber, 'Deleted risk assessment');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete risk assessment' });
  }
});

// -----------------------------------------------------------------------------
// JSA (JOB SAFETY ANALYSIS) ROUTES
// -----------------------------------------------------------------------------

app.get('/api/jsa', authenticate, requireFeature('jsaModule'), async (req, res) => {
  try {
    const { status, department, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (department) query.department = department;

    const total = await JSA.countDocuments(query);
    const jsas = await JSA.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ jsas, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get JSAs' });
  }
});

app.get('/api/jsa/:id', authenticate, requireFeature('jsaModule'), async (req, res) => {
  try {
    const jsa = await JSA.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('createdBy', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .populate('requiredTraining');
    if (!jsa) return res.status(404).json({ error: 'JSA not found' });
    res.json({ jsa });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get JSA' });
  }
});

app.post('/api/jsa', authenticate, requireFeature('jsaModule'), async (req, res) => {
  try {
    const jsaNumber = await generateNumber(JSA, 'JSA', req.organization._id);
    const jsa = await JSA.create({
      ...req.body,
      organization: req.organization._id,
      jsaNumber,
      createdBy: req.user._id
    });
    await createAuditLog(req, 'create', 'jsa', 'JSA', jsa._id, jsa.jsaNumber, 'Created JSA');
    res.status(201).json({ jsa });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create JSA' });
  }
});

app.put('/api/jsa/:id', authenticate, requireFeature('jsaModule'), async (req, res) => {
  try {
    const jsa = await JSA.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!jsa) return res.status(404).json({ error: 'JSA not found' });
    await createAuditLog(req, 'update', 'jsa', 'JSA', jsa._id, jsa.jsaNumber, 'Updated JSA');
    res.json({ jsa });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update JSA' });
  }
});

app.delete('/api/jsa/:id', authenticate, requireFeature('jsaModule'), authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const jsa = await JSA.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    if (!jsa) return res.status(404).json({ error: 'JSA not found' });
    await createAuditLog(req, 'delete', 'jsa', 'JSA', jsa._id, jsa.jsaNumber, 'Deleted JSA');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete JSA' });
  }
});

// -----------------------------------------------------------------------------
// PERMIT TO WORK ROUTES
// -----------------------------------------------------------------------------

app.get('/api/permits', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await PermitToWork.countDocuments(query);
    const permits = await PermitToWork.find(query)
      .populate('requestedBy', 'firstName lastName')
      .populate('contractor', 'companyName')
      .sort({ startDateTime: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ permits, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get permits' });
  }
});

app.get('/api/permits/:id', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const permit = await PermitToWork.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('requestedBy', 'firstName lastName')
      .populate('contractor')
      .populate('approvals.user', 'firstName lastName')
      .populate('relatedJSA')
      .populate('relatedRiskAssessment');
    if (!permit) return res.status(404).json({ error: 'Permit not found' });
    res.json({ permit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get permit' });
  }
});

app.post('/api/permits', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const permitNumber = await generateNumber(PermitToWork, 'PTW', req.organization._id);
    const permit = await PermitToWork.create({
      ...req.body,
      organization: req.organization._id,
      permitNumber,
      requestedBy: req.user._id
    });
    await createAuditLog(req, 'create', 'permits', 'PermitToWork', permit._id, permit.permitNumber, 'Created permit to work');
    res.status(201).json({ permit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create permit' });
  }
});

app.put('/api/permits/:id', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const permit = await PermitToWork.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!permit) return res.status(404).json({ error: 'Permit not found' });
    await createAuditLog(req, 'update', 'permits', 'PermitToWork', permit._id, permit.permitNumber, 'Updated permit');
    res.json({ permit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update permit' });
  }
});

app.post('/api/permits/:id/approve', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const permit = await PermitToWork.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!permit) return res.status(404).json({ error: 'Permit not found' });
    
    permit.approvals.push({
      role: req.body.role || req.user.role,
      user: req.user._id,
      status: 'approved',
      date: new Date(),
      comments: req.body.comments,
      signature: req.body.signature
    });

    const allApproved = permit.approvals.every(a => a.status === 'approved');
    if (allApproved && permit.status === 'pending_approval') {
      permit.status = 'approved';
    }
    
    await permit.save();
    await createAuditLog(req, 'approve', 'permits', 'PermitToWork', permit._id, permit.permitNumber, 'Approved permit');
    res.json({ permit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve permit' });
  }
});

app.post('/api/permits/:id/close', authenticate, requireFeature('permitToWork'), async (req, res) => {
  try {
    const permit = await PermitToWork.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!permit) return res.status(404).json({ error: 'Permit not found' });
    
    permit.status = 'completed';
    permit.closeout = {
      completedBy: req.user._id,
      completedAt: new Date(),
      workCompleted: req.body.workCompleted,
      areaSecured: req.body.areaSecured,
      isolationsRemoved: req.body.isolationsRemoved,
      notes: req.body.notes,
      signature: req.body.signature
    };
    
    await permit.save();
    await createAuditLog(req, 'update', 'permits', 'PermitToWork', permit._id, permit.permitNumber, 'Closed permit');
    res.json({ permit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close permit' });
  }
});

// -----------------------------------------------------------------------------
// CONTRACTOR MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/contractors', authenticate, requireFeature('contractorManagement'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await Contractor.countDocuments(query);
    const contractors = await Contractor.find(query)
      .sort({ companyName: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ contractors, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get contractors' });
  }
});

app.get('/api/contractors/:id', authenticate, requireFeature('contractorManagement'), async (req, res) => {
  try {
    const contractor = await Contractor.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('incidents')
      .populate('permits');
    if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
    res.json({ contractor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get contractor' });
  }
});

app.post('/api/contractors', authenticate, requireFeature('contractorManagement'), async (req, res) => {
  try {
    const contractorNumber = await generateNumber(Contractor, 'CON', req.organization._id);
    const contractor = await Contractor.create({
      ...req.body,
      organization: req.organization._id,
      contractorNumber
    });
    await createAuditLog(req, 'create', 'contractors', 'Contractor', contractor._id, contractor.companyName, 'Created contractor');
    res.status(201).json({ contractor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create contractor' });
  }
});

app.put('/api/contractors/:id', authenticate, requireFeature('contractorManagement'), async (req, res) => {
  try {
    const contractor = await Contractor.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
    await createAuditLog(req, 'update', 'contractors', 'Contractor', contractor._id, contractor.companyName, 'Updated contractor');
    res.json({ contractor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update contractor' });
  }
});

app.post('/api/contractors/:id/rate', authenticate, requireFeature('contractorManagement'), async (req, res) => {
  try {
    const contractor = await Contractor.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
    
    contractor.performanceRatings.push({
      date: new Date(),
      ratedBy: req.user._id,
      project: req.body.project,
      safetyRating: req.body.safetyRating,
      qualityRating: req.body.qualityRating,
      timelinessRating: req.body.timelinessRating,
      overallRating: req.body.overallRating,
      comments: req.body.comments
    });
    
    await contractor.save();
    res.json({ contractor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rate contractor' });
  }
});

// -----------------------------------------------------------------------------
// CHEMICAL/SDS MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/chemicals', authenticate, requireFeature('chemicalManagement'), async (req, res) => {
  try {
    const { status, location, search, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
        { casNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Chemical.countDocuments(query);
    const chemicals = await Chemical.find(query)
      .sort({ productName: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ chemicals, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chemicals' });
  }
});

app.get('/api/chemicals/:id', authenticate, requireFeature('chemicalManagement'), async (req, res) => {
  try {
    const chemical = await Chemical.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('trainingRequired')
      .populate('riskAssessment');
    if (!chemical) return res.status(404).json({ error: 'Chemical not found' });
    res.json({ chemical });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chemical' });
  }
});

app.post('/api/chemicals', authenticate, requireFeature('chemicalManagement'), async (req, res) => {
  try {
    const chemicalId = await generateNumber(Chemical, 'CHEM', req.organization._id);
    const chemical = await Chemical.create({
      ...req.body,
      organization: req.organization._id,
      chemicalId,
      createdBy: req.user._id
    });
    await createAuditLog(req, 'create', 'chemicals', 'Chemical', chemical._id, chemical.productName, 'Created chemical record');
    res.status(201).json({ chemical });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chemical' });
  }
});

app.put('/api/chemicals/:id', authenticate, requireFeature('chemicalManagement'), async (req, res) => {
  try {
    const chemical = await Chemical.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!chemical) return res.status(404).json({ error: 'Chemical not found' });
    await createAuditLog(req, 'update', 'chemicals', 'Chemical', chemical._id, chemical.productName, 'Updated chemical record');
    res.json({ chemical });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update chemical' });
  }
});

// -----------------------------------------------------------------------------
// OCCUPATIONAL HEALTH ROUTES
// -----------------------------------------------------------------------------

app.get('/api/occupational-health', authenticate, requireFeature('occupationalHealth'), async (req, res) => {
  try {
    const { recordType, status, employeeId, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (recordType) query.recordType = recordType;
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;

    const total = await OccupationalHealth.countDocuments(query);
    const records = await OccupationalHealth.find(query)
      .populate('employee', 'firstName lastName employeeId')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ records, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get health records' });
  }
});

app.post('/api/occupational-health', authenticate, requireFeature('occupationalHealth'), async (req, res) => {
  try {
    const record = await OccupationalHealth.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    await createAuditLog(req, 'create', 'occupational_health', 'OccupationalHealth', record._id, record.recordType, 'Created health record');
    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create health record' });
  }
});

app.put('/api/occupational-health/:id', authenticate, requireFeature('occupationalHealth'), async (req, res) => {
  try {
    const record = await OccupationalHealth.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: 'Health record not found' });
    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update health record' });
  }
});

// -----------------------------------------------------------------------------
// EMERGENCY RESPONSE ROUTES
// -----------------------------------------------------------------------------

app.get('/api/emergency-plans', authenticate, requireFeature('emergencyResponse'), async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (type) query.type = type;
    if (status) query.status = status;

    const total = await EmergencyResponse.countDocuments(query);
    const plans = await EmergencyResponse.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ plans, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get emergency plans' });
  }
});

app.get('/api/emergency-plans/:id', authenticate, requireFeature('emergencyResponse'), async (req, res) => {
  try {
    const plan = await EmergencyResponse.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('createdBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName');
    if (!plan) return res.status(404).json({ error: 'Emergency plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get emergency plan' });
  }
});

app.post('/api/emergency-plans', authenticate, requireFeature('emergencyResponse'), async (req, res) => {
  try {
    const planNumber = await generateNumber(EmergencyResponse, 'ERP', req.organization._id);
    const plan = await EmergencyResponse.create({
      ...req.body,
      organization: req.organization._id,
      planNumber,
      createdBy: req.user._id
    });
    await createAuditLog(req, 'create', 'emergency_plans', 'EmergencyResponse', plan._id, plan.title, 'Created emergency plan');
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create emergency plan' });
  }
});

app.put('/api/emergency-plans/:id', authenticate, requireFeature('emergencyResponse'), async (req, res) => {
  try {
    const plan = await EmergencyResponse.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!plan) return res.status(404).json({ error: 'Emergency plan not found' });
    await createAuditLog(req, 'update', 'emergency_plans', 'EmergencyResponse', plan._id, plan.title, 'Updated emergency plan');
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update emergency plan' });
  }
});

app.post('/api/emergency-plans/:id/drills', authenticate, requireFeature('emergencyResponse'), async (req, res) => {
  try {
    const plan = await EmergencyResponse.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!plan) return res.status(404).json({ error: 'Emergency plan not found' });
    
    plan.drills.push({
      ...req.body,
      date: new Date(),
      conductedBy: req.user._id
    });
    
    await plan.save();
    await createAuditLog(req, 'update', 'emergency_plans', 'EmergencyResponse', plan._id, plan.title, 'Recorded emergency drill');
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record drill' });
  }
});

// -----------------------------------------------------------------------------
// ERGONOMIC ASSESSMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/ergonomic-assessments', authenticate, requireFeature('ergonomics'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await ErgonomicAssessment.countDocuments(query);
    const assessments = await ErgonomicAssessment.find(query)
      .populate('employee', 'firstName lastName')
      .populate('assessor', 'firstName lastName')
      .sort({ assessmentDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ assessments, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ergonomic assessments' });
  }
});

app.get('/api/ergonomic-assessments/:id', authenticate, requireFeature('ergonomics'), async (req, res) => {
  try {
    const assessment = await ErgonomicAssessment.findOne({ _id: req.params.id, organization: req.organization._id })
      .populate('employee', 'firstName lastName email department')
      .populate('assessor', 'firstName lastName')
      .populate('actionItems');
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get assessment' });
  }
});

app.post('/api/ergonomic-assessments', authenticate, requireFeature('ergonomics'), async (req, res) => {
  try {
    const assessmentNumber = await generateNumber(ErgonomicAssessment, 'ERGO', req.organization._id);
    const assessment = await ErgonomicAssessment.create({
      ...req.body,
      organization: req.organization._id,
      assessmentNumber,
      assessor: req.user._id
    });
    await createAuditLog(req, 'create', 'ergonomics', 'ErgonomicAssessment', assessment._id, assessment.assessmentNumber, 'Created ergonomic assessment');
    res.status(201).json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

app.put('/api/ergonomic-assessments/:id', authenticate, requireFeature('ergonomics'), async (req, res) => {
  try {
    const assessment = await ErgonomicAssessment.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update assessment' });
  }
});

// -----------------------------------------------------------------------------
// SCHEDULED REPORTS ROUTES
// -----------------------------------------------------------------------------

app.get('/api/scheduled-reports', authenticate, requireFeature('scheduledReports'), async (req, res) => {
  try {
    const reports = await ScheduledReport.find({ organization: req.organization._id })
      .populate('createdBy', 'firstName lastName')
      .sort({ name: 1 });
    res.json({ reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scheduled reports' });
  }
});

app.post('/api/scheduled-reports', authenticate, requireFeature('scheduledReports'), async (req, res) => {
  try {
    const report = await ScheduledReport.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create scheduled report' });
  }
});

app.put('/api/scheduled-reports/:id', authenticate, requireFeature('scheduledReports'), async (req, res) => {
  try {
    const report = await ScheduledReport.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Scheduled report not found' });
    res.json({ report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update scheduled report' });
  }
});

app.delete('/api/scheduled-reports/:id', authenticate, requireFeature('scheduledReports'), async (req, res) => {
  try {
    await ScheduledReport.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scheduled report' });
  }
});

// -----------------------------------------------------------------------------
// ACTION ITEM TEMPLATES ROUTES
// -----------------------------------------------------------------------------

app.get('/api/action-item-templates', authenticate, async (req, res) => {
  try {
    const templates = await ActionItemTemplate.find({ organization: req.organization._id, isActive: true });
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

app.post('/api/action-item-templates', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const template = await ActionItemTemplate.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ template });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

app.put('/api/action-item-templates/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const template = await ActionItemTemplate.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      req.body,
      { new: true }
    );
    res.json({ template });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

app.delete('/api/action-item-templates/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await ActionItemTemplate.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { isActive: false }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// -----------------------------------------------------------------------------
// SUBSCRIPTION ROUTES
// -----------------------------------------------------------------------------

app.get('/api/subscription', authenticate, async (req, res) => {
  try {
    const tier = req.organization.subscription.tier;
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    const [userCount, incidentCount, actionItemCount, inspectionCount, documentCount] = await Promise.all([
      User.countDocuments({ organization: req.organization._id, isActive: true }),
      Incident.countDocuments({ organization: req.organization._id }),
      ActionItem.countDocuments({ organization: req.organization._id }),
      Inspection.countDocuments({ organization: req.organization._id }),
      Document.countDocuments({ organization: req.organization._id })
    ]);

    res.json({
      subscription: req.organization.subscription,
      tier: tierConfig,
      usage: {
        users: { current: userCount, limit: tierConfig.maxUsers },
        incidents: { current: incidentCount, limit: tierConfig.maxIncidents },
        actionItems: { current: actionItemCount, limit: tierConfig.maxActionItems },
        inspections: { current: inspectionCount, limit: tierConfig.maxInspections },
        documents: { current: documentCount, limit: tierConfig.maxDocuments }
      },
      availableTiers: SUBSCRIPTION_TIERS
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get subscription info' });
  }
});

app.post('/api/subscription/upgrade', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { tier } = req.body;
    
    if (!SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    req.organization.subscription.tier = tier;
    req.organization.subscription.status = 'active';
    req.organization.subscription.startDate = new Date();
    await req.organization.save();

    await createAuditLog(req, 'update', 'organization', 'Organization', req.organization._id, req.organization.name, `Upgraded subscription to ${tier}`);

    res.json({ 
      success: true,
      subscription: req.organization.subscription,
      tier: SUBSCRIPTION_TIERS[tier]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

// -----------------------------------------------------------------------------
// FILE UPLOAD ROUTES
// -----------------------------------------------------------------------------

app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.post('/api/upload/multiple', authenticate, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: `/uploads/${file.filename}`
    }));

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================================================
// PLATFORM ADMIN ROUTES (Super Admin for managing all organizations)
// =============================================================================

// Platform admin authentication middleware
const platformAdminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    
    // Check if this is a platform admin
    if (decoded.isPlatformAdmin) {
      req.platformAdmin = decoded;
      return next();
    }
    
    // Also allow superadmin users from any org
    const user = await User.findById(decoded.userId).populate('organization');
    if (user && user.role === 'superadmin') {
      req.platformAdmin = { ...decoded, user };
      return next();
    }
    
    return res.status(403).json({ error: 'Platform admin access required' });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Platform admin login
app.post('/api/platform/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check for platform admin credentials (stored in env)
    const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL || 'admin@safetyfirst.io';
    const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin123!';
    
    if (email === platformAdminEmail && password === platformAdminPassword) {
      const token = jwt.sign(
        { isPlatformAdmin: true, email, role: 'platform_admin' },
        CONFIG.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: { email, role: 'platform_admin', firstName: 'Platform', lastName: 'Admin' }
      });
    }
    
    // Also check for superadmin users
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user && user.role === 'superadmin') {
      const validPassword = await bcrypt.compare(password, user.password);
      if (validPassword) {
        const token = jwt.sign(
          { userId: user._id, organizationId: user.organization, role: user.role, isPlatformAdmin: true },
          CONFIG.JWT_SECRET,
          { expiresIn: '24h' }
        );
        return res.json({
          token,
          user: { email: user.email, role: 'platform_admin', firstName: user.firstName, lastName: user.lastName }
        });
      }
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get all organizations (platform admin)
app.get('/api/platform/organizations', platformAdminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, tier } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.isActive = status === 'active';
    if (tier) query['subscription.tier'] = tier;
    
    const total = await Organization.countDocuments(query);
    const organizations = await Organization.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Get user counts for each org
    const orgsWithCounts = await Promise.all(organizations.map(async (org) => {
      const userCount = await User.countDocuments({ organization: org._id });
      const incidentCount = await Incident.countDocuments({ organization: org._id });
      return {
        ...org.toObject(),
        userCount,
        incidentCount
      };
    }));
    
    res.json({
      organizations: orgsWithCounts,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Get single organization details (platform admin)
app.get('/api/platform/organizations/:id', platformAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    const users = await User.find({ organization: org._id }).select('-password');
    const stats = {
      users: users.length,
      incidents: await Incident.countDocuments({ organization: org._id }),
      actionItems: await ActionItem.countDocuments({ organization: org._id }),
      inspections: await Inspection.countDocuments({ organization: org._id })
    };
    
    res.json({ organization: org, users, stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Create organization (platform admin)
app.post('/api/platform/organizations', platformAdminAuth, async (req, res) => {
  try {
    const { name, email, phone, industry, tier, adminEmail, adminFirstName, adminLastName, adminPassword } = req.body;
    
    // Create organization
    const org = await Organization.create({
      name,
      email,
      phone,
      industry,
      subscription: {
        tier: tier || 'starter',
        status: 'active',
        startDate: new Date(),
        billingCycle: 'monthly'
      },
      settings: { naicsCode: '', timezone: 'America/New_York' }
    });
    
    // Create admin user
    const hashedPassword = await bcrypt.hash(adminPassword || 'TempPass123!', 12);
    const admin = await User.create({
      organization: org._id,
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: 'admin',
      permissions: getDefaultPermissions('admin')
    });
    
    res.status(201).json({ organization: org, admin: { id: admin._id, email: admin.email } });
  } catch (error) {
    console.error('Create org error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Update organization (platform admin)
app.put('/api/platform/organizations/:id', platformAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: org });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Delete/Deactivate organization (platform admin)
app.delete('/api/platform/organizations/:id', platformAdminAuth, async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    // Deactivate all users
    await User.updateMany({ organization: org._id }, { isActive: false });
    
    res.json({ success: true, message: 'Organization deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// Platform statistics
app.get('/api/platform/stats', platformAdminAuth, async (req, res) => {
  try {
    const stats = {
      organizations: {
        total: await Organization.countDocuments(),
        active: await Organization.countDocuments({ isActive: true }),
        byTier: {
          starter: await Organization.countDocuments({ 'subscription.tier': 'starter' }),
          professional: await Organization.countDocuments({ 'subscription.tier': 'professional' }),
          enterprise: await Organization.countDocuments({ 'subscription.tier': 'enterprise' })
        }
      },
      users: {
        total: await User.countDocuments(),
        active: await User.countDocuments({ isActive: true })
      },
      incidents: {
        total: await Incident.countDocuments(),
        thisMonth: await Incident.countDocuments({
          createdAt: { $gte: new Date(new Date().setDate(1)) }
        })
      },
      revenue: {
        mrr: await calculateMRR()
      }
    };
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Helper to calculate MRR
async function calculateMRR() {
  const orgs = await Organization.find({ isActive: true });
  return orgs.reduce((sum, org) => {
    const tier = SUBSCRIPTION_TIERS[org.subscription?.tier || 'starter'];
    return sum + (tier?.price || 0);
  }, 0);
}

// =============================================================================
// USER INVITATION SYSTEM
// =============================================================================

// Send user invitation
app.post('/api/users/invite', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { email, firstName, lastName, role, department, jobTitle } = req.body;
    
    // Check if user already exists
    const existing = await User.findOne({ organization: req.organization._id, email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'User already exists in this organization' });
    }
    
    // Check user limit
    const userCount = await User.countDocuments({ organization: req.organization._id });
    const tier = SUBSCRIPTION_TIERS[req.organization.subscription?.tier || 'starter'];
    if (tier.maxUsers !== -1 && userCount >= tier.maxUsers) {
      return res.status(400).json({ error: 'User limit reached for your subscription tier' });
    }
    
    // Generate invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    
    // Create user with pending status
    const user = await User.create({
      organization: req.organization._id,
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'user',
      department,
      jobTitle,
      permissions: getDefaultPermissions(role || 'user'),
      isActive: false,
      verification: {
        email: {
          verified: false,
          token: inviteToken,
          expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      }
    });
    
    // Send invitation email
    const inviteUrl = `${CONFIG.APP_URL}/accept-invite?token=${inviteToken}`;
    await sendEmail(
      email,
      `You've been invited to ${req.organization.name}`,
      `<h1>Welcome to ${req.organization.name}</h1>
       <p>${req.user.firstName} ${req.user.lastName} has invited you to join their EHS Management System.</p>
       <p><strong>Your temporary password:</strong> ${tempPassword}</p>
       <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;">Accept Invitation</a></p>
       <p>This invitation expires in 7 days.</p>`
    );
    
    await createAuditLog(req, 'create', 'users', 'User', user._id, email, 'Invited user');
    
    res.status(201).json({ 
      success: true, 
      message: 'Invitation sent',
      user: { id: user._id, email: user.email, firstName, lastName, role }
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Accept invitation
app.post('/api/users/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    const user = await User.findOne({
      'verification.email.token': token,
      'verification.email.expires': { $gt: new Date() }
    }).populate('organization');
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }
    
    // Update user
    user.password = await bcrypt.hash(password, 12);
    user.isActive = true;
    user.verification.email.verified = true;
    user.verification.email.token = undefined;
    await user.save();
    
    // Generate login token
    const authToken = jwt.sign(
      { userId: user._id, organizationId: user.organization._id, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: CONFIG.JWT_EXPIRES_IN }
    );
    
    res.json({
      token: authToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: user.organization
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Resend invitation
app.post('/api/users/:id/resend-invite', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isActive) return res.status(400).json({ error: 'User already active' });
    
    // Generate new token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tempPassword = crypto.randomBytes(8).toString('hex');
    user.password = await bcrypt.hash(tempPassword, 12);
    user.verification.email.token = inviteToken;
    user.verification.email.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();
    
    // Send email
    const inviteUrl = `${CONFIG.APP_URL}/accept-invite?token=${inviteToken}`;
    await sendEmail(
      user.email,
      `Reminder: You've been invited to ${req.organization.name}`,
      `<h1>Invitation Reminder</h1>
       <p>You have a pending invitation to join ${req.organization.name}'s EHS Management System.</p>
       <p><strong>Your new temporary password:</strong> ${tempPassword}</p>
       <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;">Accept Invitation</a></p>`
    );
    
    res.json({ success: true, message: 'Invitation resent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// Activate/Deactivate user
app.post('/api/users/:id/toggle-status', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }
    
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.isActive = !user.isActive;
    user.updatedAt = new Date();
    await user.save();
    
    await createAuditLog(req, 'update', 'users', 'User', user._id, user.email, 
      user.isActive ? 'Activated user' : 'Deactivated user');
    
    res.json({ success: true, isActive: user.isActive });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Reset user password (admin)
app.post('/api/users/:id/reset-password', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const tempPassword = crypto.randomBytes(8).toString('hex');
    user.password = await bcrypt.hash(tempPassword, 12);
    await user.save();
    
    await sendEmail(
      user.email,
      'Password Reset',
      `<h1>Password Reset</h1>
       <p>Your password has been reset by an administrator.</p>
       <p><strong>Your new temporary password:</strong> ${tempPassword}</p>
       <p>Please login and change your password immediately.</p>`
    );
    
    res.json({ success: true, message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// -----------------------------------------------------------------------------
// SAFETY OBSERVATIONS ROUTES
// -----------------------------------------------------------------------------

app.get('/api/observations', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.$or = [
      { description: { $regex: search, $options: 'i' } },
      { observationNumber: { $regex: search, $options: 'i' } }
    ];
    const observations = await Observation.find(query)
      .populate('reportedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Observation.countDocuments(query);
    res.json({ observations, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get observations' });
  }
});

app.post('/api/observations', authenticate, async (req, res) => {
  try {
    const observationNumber = await generateNumber(Observation, 'OBS', req.organization._id);
    const observation = await Observation.create({ ...req.body, organization: req.organization._id, reportedBy: req.user._id, observationNumber });
    res.status(201).json({ observation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create observation' });
  }
});

app.put('/api/observations/:id', authenticate, async (req, res) => {
  try {
    const observation = await Observation.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!observation) return res.status(404).json({ error: 'Observation not found' });
    res.json({ observation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update observation' });
  }
});

app.delete('/api/observations/:id', authenticate, async (req, res) => {
  try {
    await Observation.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete observation' });
  }
});

// -----------------------------------------------------------------------------
// MANAGEMENT OF CHANGE ROUTES
// -----------------------------------------------------------------------------

app.get('/api/moc', authenticate, requireFeature('moc'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { mocNumber: { $regex: search, $options: 'i' } }
    ];
    const mocs = await MOC.find(query)
      .populate('requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await MOC.countDocuments(query);
    res.json({ mocs, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get MOCs' });
  }
});

app.post('/api/moc', authenticate, requireFeature('moc'), async (req, res) => {
  try {
    const mocNumber = await generateNumber(MOC, 'MOC', req.organization._id);
    const moc = await MOC.create({ ...req.body, organization: req.organization._id, requestedBy: req.user._id, mocNumber });
    res.status(201).json({ moc });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create MOC' });
  }
});

app.put('/api/moc/:id', authenticate, requireFeature('moc'), async (req, res) => {
  try {
    const moc = await MOC.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!moc) return res.status(404).json({ error: 'MOC not found' });
    res.json({ moc });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update MOC' });
  }
});

app.delete('/api/moc/:id', authenticate, requireFeature('moc'), async (req, res) => {
  try {
    await MOC.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete MOC' });
  }
});

// -----------------------------------------------------------------------------
// SUPPLIER MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/suppliers', authenticate, requireFeature('suppliers'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.name = { $regex: search, $options: 'i' };
    const suppliers = await Supplier.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Supplier.countDocuments(query);
    res.json({ suppliers, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

app.post('/api/suppliers', authenticate, requireFeature('suppliers'), async (req, res) => {
  try {
    const supplier = await Supplier.create({ ...req.body, organization: req.organization._id });
    res.status(201).json({ supplier });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

app.put('/api/suppliers/:id', authenticate, requireFeature('suppliers'), async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ supplier });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

app.delete('/api/suppliers/:id', authenticate, requireFeature('suppliers'), async (req, res) => {
  try {
    await Supplier.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// -----------------------------------------------------------------------------
// ASSET MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/assets', authenticate, requireFeature('assets'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { assetNumber: { $regex: search, $options: 'i' } }
    ];
    const assets = await Asset.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Asset.countDocuments(query);
    res.json({ assets, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get assets' });
  }
});

app.post('/api/assets', authenticate, requireFeature('assets'), async (req, res) => {
  try {
    const assetNumber = await generateNumber(Asset, 'AST', req.organization._id);
    const asset = await Asset.create({ ...req.body, organization: req.organization._id, assetNumber });
    res.status(201).json({ asset });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

app.put('/api/assets/:id', authenticate, requireFeature('assets'), async (req, res) => {
  try {
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

app.delete('/api/assets/:id', authenticate, requireFeature('assets'), async (req, res) => {
  try {
    await Asset.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// -----------------------------------------------------------------------------
// ENVIRONMENTAL MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/environmental', authenticate, requireFeature('environmental'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search, type } = req.query;
    const query = { organization: req.organization._id };
    if (type) query.type = type;
    if (search) query.source = { $regex: search, $options: 'i' };
    const records = await Environmental.find(query)
      .populate('reportedBy', 'firstName lastName')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Environmental.countDocuments(query);
    res.json({ records, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get environmental records' });
  }
});

app.post('/api/environmental', authenticate, requireFeature('environmental'), async (req, res) => {
  try {
    const recordNumber = await generateNumber(Environmental, 'ENV', req.organization._id);
    const record = await Environmental.create({ ...req.body, organization: req.organization._id, reportedBy: req.user._id, recordNumber });
    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create environmental record' });
  }
});

app.put('/api/environmental/:id', authenticate, requireFeature('environmental'), async (req, res) => {
  try {
    const record = await Environmental.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update environmental record' });
  }
});

app.delete('/api/environmental/:id', authenticate, requireFeature('environmental'), async (req, res) => {
  try {
    await Environmental.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete environmental record' });
  }
});

// -----------------------------------------------------------------------------
// QUALITY/NCR ROUTES
// -----------------------------------------------------------------------------

app.get('/api/quality', authenticate, requireFeature('quality'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { ncrNumber: { $regex: search, $options: 'i' } }
    ];
    const ncrs = await Quality.find(query)
      .populate('detectedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Quality.countDocuments(query);
    res.json({ ncrs, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get NCRs' });
  }
});

app.post('/api/quality', authenticate, requireFeature('quality'), async (req, res) => {
  try {
    const ncrNumber = await generateNumber(Quality, 'NCR', req.organization._id);
    const ncr = await Quality.create({ ...req.body, organization: req.organization._id, detectedBy: req.user._id, ncrNumber });
    res.status(201).json({ ncr });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create NCR' });
  }
});

app.put('/api/quality/:id', authenticate, requireFeature('quality'), async (req, res) => {
  try {
    const ncr = await Quality.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });
    res.json({ ncr });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update NCR' });
  }
});

app.delete('/api/quality/:id', authenticate, requireFeature('quality'), async (req, res) => {
  try {
    await Quality.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete NCR' });
  }
});

// -----------------------------------------------------------------------------
// CAPA ROUTES
// -----------------------------------------------------------------------------

app.get('/api/capa', authenticate, requireFeature('capa'), async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { capaNumber: { $regex: search, $options: 'i' } }
    ];
    const capas = await CAPA.find(query)
      .populate('responsible', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await CAPA.countDocuments(query);
    res.json({ capas, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get CAPAs' });
  }
});

app.post('/api/capa', authenticate, requireFeature('capa'), async (req, res) => {
  try {
    const capaNumber = await generateNumber(CAPA, 'CAPA', req.organization._id);
    const capa = await CAPA.create({ ...req.body, organization: req.organization._id, capaNumber });
    res.status(201).json({ capa });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create CAPA' });
  }
});

app.put('/api/capa/:id', authenticate, requireFeature('capa'), async (req, res) => {
  try {
    const capa = await CAPA.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    res.json({ capa });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update CAPA' });
  }
});

app.delete('/api/capa/:id', authenticate, requireFeature('capa'), async (req, res) => {
  try {
    await CAPA.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete CAPA' });
  }
});

// -----------------------------------------------------------------------------
// MEETINGS ROUTES
// -----------------------------------------------------------------------------

app.get('/api/meetings', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 15, search } = req.query;
    const query = { organization: req.organization._id };
    if (search) query.title = { $regex: search, $options: 'i' };
    const meetings = await Meeting.find(query)
      .populate('facilitator', 'firstName lastName')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Meeting.countDocuments(query);
    res.json({ meetings, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get meetings' });
  }
});

app.post('/api/meetings', authenticate, async (req, res) => {
  try {
    const meeting = await Meeting.create({ ...req.body, organization: req.organization._id, facilitator: req.user._id });
    res.status(201).json({ meeting });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

app.put('/api/meetings/:id', authenticate, async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ meeting });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

app.delete('/api/meetings/:id', authenticate, async (req, res) => {
  try {
    await Meeting.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// =============================================================================
// SERVE FRONTEND
// =============================================================================

app.use(express.static(path.join(__dirname, 'public')));

// Serve landing page for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve app for authenticated routes
app.get(['/app', '/app/*', '/login', '/register', '/superadmin', '/superadmin/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// =============================================================================
// DEMO MODE DATA (when MongoDB not available)
// =============================================================================

let DEMO_MODE = false;

// =============================================================================
// ENHANCED FEATURES - NOTIFICATIONS, INBOX, HIERARCHY, CUSTOM REPORTS
// =============================================================================

// Notification Schema - Real-time user notifications
const notificationSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  type: {
    type: String,
    enum: [
      'action_assigned', 'action_due_soon', 'action_overdue', 'action_completed', 'action_rejected',
      'incident_assigned', 'incident_status_change', 'incident_comment', 'incident_needs_review',
      'audit_assigned', 'audit_due_soon', 'audit_overdue', 'audit_completed',
      'training_assigned', 'training_due_soon', 'training_overdue', 'training_completed',
      'inspection_assigned', 'inspection_due_soon', 'inspection_completed',
      'approval_needed', 'approval_granted', 'approval_rejected',
      'mention', 'comment', 'document_shared', 'system_alert', 'reminder',
      'icare_received', 'icare_followup_due',
      'report_ready', 'export_ready'
    ],
    required: true
  },
  
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  
  title: { type: String, required: true },
  message: String,
  
  // Related entity
  entityType: { type: String, enum: ['incident', 'action', 'inspection', 'training', 'audit', 'document', 'icare', 'report', 'user'] },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityNumber: String,
  
  // Links
  actionUrl: String,
  actionLabel: String,
  
  // Status
  isRead: { type: Boolean, default: false },
  readAt: Date,
  isDismissed: { type: Boolean, default: false },
  dismissedAt: Date,
  
  // Email/Push notification status
  emailSent: { type: Boolean, default: false },
  emailSentAt: Date,
  pushSent: { type: Boolean, default: false },
  pushSentAt: Date,
  
  // Expiry
  expiresAt: Date,
  
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ organization: 1, createdAt: -1 });
const Notification = mongoose.model('Notification', notificationSchema);

// User Hierarchy Schema - Reporting structure
const userHierarchySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Direct supervisor
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // All supervisors up the chain (for quick lookups)
  supervisorChain: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Direct reports
  directReports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // All reports (including indirect) count
  totalReportsCount: { type: Number, default: 0 },
  
  // Level in hierarchy (0 = top, 1 = reports to top, etc.)
  hierarchyLevel: { type: Number, default: 0 },
  
  // Can approve for these users
  canApproveFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Can assign tasks to these users
  canAssignTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Delegation (when supervisor is out)
  delegatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  delegationStart: Date,
  delegationEnd: Date,
  
  updatedAt: { type: Date, default: Date.now }
});

const UserHierarchy = mongoose.model('UserHierarchy', userHierarchySchema);

// I-CARE Notes Schema - Behavior-Based Safety Observations
const iCareNoteSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  noteNumber: { type: String, unique: true },
  
  // Observer
  observer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observerName: String,
  
  // Observed Person (can be anonymous)
  observedPerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  observedPersonName: String,
  isAnonymous: { type: Boolean, default: false },
  
  // Observation Details
  type: {
    type: String,
    enum: ['safe_behavior', 'at_risk_behavior', 'positive_recognition', 'coaching_opportunity', 'safety_suggestion', 'hazard_observation'],
    required: true
  },
  
  category: {
    type: String,
    enum: ['ppe', 'body_positioning', 'tool_equipment', 'housekeeping', 'procedures', 'communication', 'awareness', 'line_of_fire', 'ergonomics', 'lifting', 'driving', 'other']
  },
  
  // Location
  location: String,
  department: String,
  
  // Description
  observation: { type: String, required: true },
  immediateAction: String, // What was done immediately
  
  // Conversation held?
  conversationHeld: { type: Boolean, default: false },
  conversationNotes: String,
  
  // Recognition
  recognitionType: { type: String, enum: ['verbal', 'written', 'award', 'none'] },
  recognitionDetails: String,
  
  // Follow-up
  followUpRequired: { type: Boolean, default: false },
  followUpType: { type: String, enum: ['training', 'coaching', 'investigation', 'equipment', 'procedure', 'other'] },
  followUpDescription: String,
  followUpAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  followUpDueDate: Date,
  followUpCompletedDate: Date,
  followUpStatus: { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending' },
  followUpNotes: String,
  
  // Linked records
  linkedIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
  linkedAction: { type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' },
  linkedTraining: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingRecord' },
  
  // Attachments
  photos: [{
    filename: String,
    caption: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Acknowledgment (by observed person)
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Status
  status: { type: String, enum: ['draft', 'submitted', 'reviewed', 'closed'], default: 'draft' },
  
  // Tags for analytics
  tags: [String],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ICareNote = mongoose.model('ICareNote', iCareNoteSchema);

// Scheduled Audit Schema
const scheduledAuditSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  auditNumber: { type: String, unique: true },
  
  // Basic Info
  title: { type: String, required: true },
  description: String,
  
  // Type & Category
  auditType: {
    type: String,
    enum: ['internal', 'external', 'regulatory', 'compliance', 'safety', 'environmental', 'quality', 'process', 'supplier', 'management_system'],
    required: true
  },
  category: String,
  
  // Standard/Framework being audited
  standard: String, // ISO 45001, OSHA, ISO 14001, etc.
  
  // Schedule
  scheduledDate: { type: Date, required: true },
  scheduledEndDate: Date,
  duration: Number, // in hours
  
  // Recurrence
  isRecurring: { type: Boolean, default: false },
  recurrence: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annually'] },
    interval: Number,
    endDate: Date,
    occurrences: Number
  },
  
  // Scope
  scope: String,
  departments: [String],
  locations: [String],
  processes: [String],
  
  // Team
  leadAuditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  auditTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  auditees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Checklist/Protocol
  checklist: [{
    section: String,
    question: String,
    expectedEvidence: String,
    weight: Number,
    response: { type: String, enum: ['conforming', 'minor_nc', 'major_nc', 'observation', 'opportunity', 'na', 'pending'] },
    findings: String,
    evidence: String,
    photos: [String]
  }],
  
  // Findings Summary
  findings: [{
    findingNumber: String,
    type: { type: String, enum: ['major_nonconformity', 'minor_nonconformity', 'observation', 'opportunity_for_improvement', 'positive_finding'] },
    description: String,
    requirement: String,
    evidence: String,
    rootCause: String,
    correctiveAction: { type: mongoose.Schema.Types.ObjectId, ref: 'ActionItem' },
    status: { type: String, enum: ['open', 'in_progress', 'closed', 'verified'], default: 'open' },
    dueDate: Date,
    closedDate: Date
  }],
  
  // Documents
  documents: [{
    type: { type: String, enum: ['audit_plan', 'checklist', 'evidence', 'report', 'corrective_action', 'other'] },
    filename: String,
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date
  }],
  
  // Status & Workflow
  status: {
    type: String,
    enum: ['scheduled', 'in_preparation', 'in_progress', 'pending_report', 'pending_review', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  
  // Scores
  overallScore: Number,
  conformityRate: Number,
  
  // Report
  reportSummary: String,
  conclusions: String,
  recommendations: String,
  reportApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportApprovedAt: Date,
  
  // Notifications
  remindersSent: [{
    type: { type: String, enum: ['upcoming', 'due', 'overdue'] },
    sentAt: Date,
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ScheduledAudit = mongoose.model('ScheduledAudit', scheduledAuditSchema);

// Custom Dashboard Widget Schema
const dashboardWidgetSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  name: { type: String, required: true },
  description: String,
  
  // Widget Type
  widgetType: {
    type: String,
    enum: ['stat_card', 'line_chart', 'bar_chart', 'pie_chart', 'donut_chart', 'table', 'list', 'gauge', 'heatmap', 'map', 'calendar', 'timeline', 'kpi', 'custom'],
    required: true
  },
  
  // Data Source
  dataSource: {
    type: String,
    enum: ['incidents', 'actions', 'inspections', 'training', 'audits', 'observations', 'icare', 'osha', 'custom_query'],
    required: true
  },
  
  // Filters/Query
  filters: {
    dateRange: { type: String, enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom'] },
    startDate: Date,
    endDate: Date,
    departments: [String],
    locations: [String],
    statuses: [String],
    types: [String],
    severities: [String],
    customFilters: mongoose.Schema.Types.Mixed
  },
  
  // Aggregation
  aggregation: {
    groupBy: String, // 'day', 'week', 'month', 'department', 'type', etc.
    metric: String, // 'count', 'sum', 'avg', 'min', 'max'
    field: String
  },
  
  // Display Options
  display: {
    title: String,
    subtitle: String,
    color: String,
    icon: String,
    showTrend: Boolean,
    trendPeriod: String,
    format: String, // 'number', 'percent', 'currency', 'duration'
    decimals: Number,
    threshold: { warning: Number, danger: Number },
    size: { type: String, enum: ['small', 'medium', 'large', 'xlarge'], default: 'medium' }
  },
  
  // Chart specific options
  chartOptions: {
    xAxis: String,
    yAxis: String,
    series: [{ name: String, field: String, color: String }],
    stacked: Boolean,
    showLegend: Boolean,
    showLabels: Boolean
  },
  
  // Refresh
  refreshInterval: Number, // in seconds, 0 = manual only
  lastRefreshed: Date,
  cachedData: mongoose.Schema.Types.Mixed,
  
  // Sharing
  isPublic: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const DashboardWidget = mongoose.model('DashboardWidget', dashboardWidgetSchema);

// Custom Dashboard Schema
const customDashboardSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  name: { type: String, required: true },
  description: String,
  
  // Layout
  layout: [{
    widgetId: { type: mongoose.Schema.Types.ObjectId, ref: 'DashboardWidget' },
    position: { x: Number, y: Number }, // Grid position
    size: { width: Number, height: Number }, // Grid units
    order: Number
  }],
  
  // Settings
  isDefault: { type: Boolean, default: false }, // User's default dashboard
  isOrgDefault: { type: Boolean, default: false }, // Org-wide default
  
  // Sharing
  isPublic: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sharedWithRoles: [String],
  
  // Auto-refresh
  autoRefresh: { type: Boolean, default: true },
  refreshInterval: { type: Number, default: 300 }, // seconds
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CustomDashboard = mongoose.model('CustomDashboard', customDashboardSchema);

// Custom Report Schema
const customReportSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  name: { type: String, required: true },
  description: String,
  
  // Report Type
  reportType: {
    type: String,
    enum: ['tabular', 'summary', 'trend', 'comparison', 'cross_tab', 'kpi', 'executive'],
    default: 'tabular'
  },
  
  // Data Sources
  primarySource: {
    type: String,
    enum: ['incidents', 'actions', 'inspections', 'training', 'audits', 'observations', 'icare', 'osha', 'users', 'contractors'],
    required: true
  },
  
  // Columns/Fields to include
  columns: [{
    field: String,
    label: String,
    type: { type: String, enum: ['text', 'number', 'date', 'boolean', 'lookup'] },
    format: String,
    width: Number,
    sortable: Boolean,
    visible: { type: Boolean, default: true },
    order: Number,
    aggregation: { type: String, enum: ['none', 'count', 'sum', 'avg', 'min', 'max'] }
  }],
  
  // Filters
  filters: [{
    field: String,
    operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'between', 'in', 'not_in', 'is_empty', 'is_not_empty'] },
    value: mongoose.Schema.Types.Mixed,
    isRequired: Boolean
  }],
  
  // User-adjustable filters (shown in UI)
  userFilters: [{
    field: String,
    label: String,
    type: { type: String, enum: ['text', 'select', 'multiselect', 'date', 'daterange', 'number'] },
    options: [{ value: String, label: String }],
    defaultValue: mongoose.Schema.Types.Mixed
  }],
  
  // Grouping & Sorting
  groupBy: [String],
  sortBy: [{ field: String, direction: { type: String, enum: ['asc', 'desc'] } }],
  
  // Summary/Totals
  showSummary: { type: Boolean, default: false },
  summaryFields: [{
    field: String,
    aggregation: String,
    label: String
  }],
  
  // Scheduling
  isScheduled: { type: Boolean, default: false },
  schedule: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly'] },
    dayOfWeek: Number, // 0-6 for weekly
    dayOfMonth: Number, // 1-31 for monthly
    time: String, // HH:mm
    timezone: String,
    nextRun: Date,
    lastRun: Date
  },
  
  // Delivery
  deliveryMethod: [{ type: String, enum: ['email', 'dashboard', 'download'] }],
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  recipientEmails: [String],
  
  // Export Options
  exportFormats: [{ type: String, enum: ['pdf', 'excel', 'csv', 'html'] }],
  
  // Sharing
  isPublic: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Execution History
  lastRunAt: Date,
  lastRunBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastRunDuration: Number, // milliseconds
  runCount: { type: Number, default: 0 },
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CustomReport = mongoose.model('CustomReport', customReportSchema);

// Incident Lifecycle Transition Schema
const incidentLifecycleSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  
  // Transition
  fromStatus: String,
  toStatus: String,
  
  // Who/When
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
  
  // Details
  action: {
    type: String,
    enum: ['created', 'submitted', 'acknowledged', 'investigation_started', 'investigation_completed', 'sent_for_review', 'reviewed', 'sent_for_validation', 'validated', 'approved', 'completed', 'closed', 'reopened', 'archived', 'escalated', 'returned', 'rejected']
  },
  
  comments: String,
  attachments: [String],
  
  // If returned/rejected
  returnReason: String,
  
  // Time spent in previous status
  timeInPreviousStatus: Number, // milliseconds
  
  // Notifications sent
  notificationsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Notification' }]
});

incidentLifecycleSchema.index({ incident: 1, performedAt: -1 });
const IncidentLifecycle = mongoose.model('IncidentLifecycle', incidentLifecycleSchema);

// Document Upload Schema (for LTIs, RIs, and general documents)
const documentUploadSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  // Document Info
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: String,
  size: Number, // bytes
  
  // Classification
  documentType: {
    type: String,
    enum: [
      'incident_report', 'investigation_report', 'witness_statement', 'medical_record', 'photo', 'video',
      'osha_300', 'osha_300a', 'osha_301', 'first_report_injury', 'workers_comp_claim',
      'lti_documentation', 'ri_documentation', 'return_to_work', 'fitness_for_duty',
      'audit_report', 'audit_evidence', 'inspection_report', 'checklist',
      'training_certificate', 'training_material', 'competency_record',
      'sds', 'procedure', 'policy', 'permit', 'certification',
      'corrective_action', 'root_cause_analysis', 'risk_assessment',
      'other'
    ],
    required: true
  },
  category: String,
  
  // Linked Entity
  entityType: { type: String, enum: ['incident', 'action', 'inspection', 'training', 'audit', 'icare', 'osha', 'contractor', 'user', 'general'] },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  
  // Description
  title: String,
  description: String,
  tags: [String],
  
  // Access Control
  isConfidential: { type: Boolean, default: false },
  accessLevel: { type: String, enum: ['public', 'organization', 'department', 'restricted'], default: 'organization' },
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowedRoles: [String],
  
  // Version Control
  version: { type: Number, default: 1 },
  previousVersions: [{
    version: Number,
    filename: String,
    uploadedAt: Date,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Expiry
  expiryDate: Date,
  expiryNotificationSent: Boolean,
  
  // Approval
  requiresApproval: { type: Boolean, default: false },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  
  // Upload Info
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
  
  // Storage
  storagePath: String,
  storageType: { type: String, enum: ['local', 's3', 'azure', 'gcs'], default: 'local' },
  
  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false },
  archivedAt: Date,
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

documentUploadSchema.index({ organization: 1, entityType: 1, entityId: 1 });
documentUploadSchema.index({ organization: 1, documentType: 1 });
const DocumentUpload = mongoose.model('DocumentUpload', documentUploadSchema);

// User Preferences Schema
const userPreferencesSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Notification Preferences
  notifications: {
    email: {
      enabled: { type: Boolean, default: true },
      frequency: { type: String, enum: ['instant', 'hourly', 'daily', 'weekly'], default: 'instant' },
      types: {
        actionAssigned: { type: Boolean, default: true },
        actionDue: { type: Boolean, default: true },
        actionCompleted: { type: Boolean, default: true },
        incidentAssigned: { type: Boolean, default: true },
        incidentStatusChange: { type: Boolean, default: true },
        auditReminders: { type: Boolean, default: true },
        trainingDue: { type: Boolean, default: true },
        approvalNeeded: { type: Boolean, default: true },
        mentions: { type: Boolean, default: true },
        systemAlerts: { type: Boolean, default: true }
      }
    },
    push: {
      enabled: { type: Boolean, default: true },
      types: {
        urgent: { type: Boolean, default: true },
        actionAssigned: { type: Boolean, default: true },
        approvalNeeded: { type: Boolean, default: true }
      }
    },
    inApp: {
      enabled: { type: Boolean, default: true },
      playSound: { type: Boolean, default: true }
    }
  },
  
  // Dashboard Preferences
  dashboard: {
    defaultDashboard: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomDashboard' },
    showWelcome: { type: Boolean, default: true },
    compactMode: { type: Boolean, default: false },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' }
  },
  
  // Inbox Preferences
  inbox: {
    defaultView: { type: String, enum: ['all', 'my_tasks', 'my_approvals', 'overdue'], default: 'my_tasks' },
    sortBy: { type: String, default: 'dueDate' },
    showCompleted: { type: Boolean, default: false },
    itemsPerPage: { type: Number, default: 20 }
  },
  
  // Regional
  timezone: String,
  dateFormat: { type: String, default: 'MM/DD/YYYY' },
  timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
  language: { type: String, default: 'en' },
  
  // Accessibility
  accessibility: {
    highContrast: { type: Boolean, default: false },
    largeText: { type: Boolean, default: false },
    reduceMotion: { type: Boolean, default: false },
    screenReader: { type: Boolean, default: false }
  },
  
  updatedAt: { type: Date, default: Date.now }
});

const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);

// Archive Schema - For archived incidents
const archivedIncidentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  originalIncidentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  incidentNumber: String,
  
  // Store complete incident data
  incidentData: mongoose.Schema.Types.Mixed,
  
  // Archive Info
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  archivedAt: { type: Date, default: Date.now },
  archiveReason: String,
  
  // Retention
  retentionPeriod: Number, // days
  deleteAfter: Date,
  
  // Restore Info
  canRestore: { type: Boolean, default: true },
  restoredAt: Date,
  restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const ArchivedIncident = mongoose.model('ArchivedIncident', archivedIncidentSchema);

// -----------------------------------------------------------------------------
// NOTIFICATION HELPER FUNCTIONS
// -----------------------------------------------------------------------------

const createNotification = async (options) => {
  try {
    const notification = await Notification.create({
      organization: options.organization,
      recipient: options.recipient,
      sender: options.sender,
      type: options.type,
      priority: options.priority || 'normal',
      title: options.title,
      message: options.message,
      entityType: options.entityType,
      entityId: options.entityId,
      entityNumber: options.entityNumber,
      actionUrl: options.actionUrl,
      actionLabel: options.actionLabel,
      expiresAt: options.expiresAt
    });
    
    // TODO: Send email/push notification based on user preferences
    // This would integrate with email service
    
    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
};

const notifyActionAssigned = async (action, assignedBy) => {
  if (!action.assignedTo) return;
  
  await createNotification({
    organization: action.organization,
    recipient: action.assignedTo,
    sender: assignedBy,
    type: 'action_assigned',
    priority: action.priority === 'critical' ? 'urgent' : 'normal',
    title: 'New Action Item Assigned',
    message: `You have been assigned: ${action.title}`,
    entityType: 'action',
    entityId: action._id,
    entityNumber: action.actionNumber,
    actionUrl: `/actions/${action._id}`,
    actionLabel: 'View Action'
  });
};

const notifyActionCompleted = async (action, completedBy) => {
  // Notify the person who created/assigned the action
  const recipients = [action.createdBy];
  if (action.assignedBy && !action.assignedBy.equals(action.createdBy)) {
    recipients.push(action.assignedBy);
  }
  
  for (const recipient of recipients) {
    await createNotification({
      organization: action.organization,
      recipient: recipient,
      sender: completedBy,
      type: 'action_completed',
      title: 'Action Item Completed',
      message: `Action "${action.title}" has been completed`,
      entityType: 'action',
      entityId: action._id,
      entityNumber: action.actionNumber,
      actionUrl: `/actions/${action._id}`,
      actionLabel: 'View Action'
    });
  }
};

const notifyIncidentStatusChange = async (incident, oldStatus, newStatus, changedBy) => {
  // Notify relevant parties based on status change
  const recipients = [];
  
  if (incident.reportedBy) recipients.push(incident.reportedBy);
  if (incident.assignedTo) recipients.push(incident.assignedTo);
  if (incident.investigation?.leadInvestigator) recipients.push(incident.investigation.leadInvestigator);
  
  // Remove duplicates and the person who made the change
  const uniqueRecipients = [...new Set(recipients.filter(r => r && !r.equals(changedBy)))];
  
  for (const recipient of uniqueRecipients) {
    await createNotification({
      organization: incident.organization,
      recipient: recipient,
      sender: changedBy,
      type: 'incident_status_change',
      title: 'Incident Status Updated',
      message: `Incident ${incident.incidentNumber} moved from ${oldStatus} to ${newStatus}`,
      entityType: 'incident',
      entityId: incident._id,
      entityNumber: incident.incidentNumber,
      actionUrl: `/incidents/${incident._id}`,
      actionLabel: 'View Incident'
    });
  }
};

// -----------------------------------------------------------------------------
// NOTIFICATION ROUTES
// -----------------------------------------------------------------------------

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = 'false' } = req.query;
    const query = { recipient: req.user._id };
    if (unreadOnly === 'true') query.isRead = false;
    
    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    const total = await Notification.countDocuments(query);
    
    res.json({ 
      notifications, 
      unreadCount,
      pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

app.delete('/api/notifications/:id', authenticate, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isDismissed: true, dismissedAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// -----------------------------------------------------------------------------
// INBOX/TASK CENTER ROUTES
// -----------------------------------------------------------------------------

app.get('/api/inbox', authenticate, async (req, res) => {
  try {
    const { view = 'all', status, priority, dueFilter } = req.query;
    const userId = req.user._id;
    const orgId = req.organization._id;
    
    // Build date filters
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    let dateFilter = {};
    if (dueFilter === 'overdue') dateFilter = { $lt: today };
    else if (dueFilter === 'today') dateFilter = { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    else if (dueFilter === 'this_week') dateFilter = { $gte: today, $lte: thisWeek };
    
    // Get Action Items assigned to user
    const actionQuery = { organization: orgId, assignedTo: userId };
    if (status && status !== 'all') actionQuery.status = status;
    else actionQuery.status = { $nin: ['completed', 'cancelled'] };
    if (Object.keys(dateFilter).length > 0) actionQuery.dueDate = dateFilter;
    
    const actions = await ActionItem.find(actionQuery)
      .populate('createdBy', 'firstName lastName')
      .populate('relatedIncident', 'incidentNumber title')
      .sort({ dueDate: 1 })
      .limit(50);
    
    // Get Inspections assigned to user
    const inspectionQuery = { organization: orgId, inspector: userId, status: { $nin: ['completed', 'cancelled'] } };
    if (Object.keys(dateFilter).length > 0) inspectionQuery.scheduledDate = dateFilter;
    
    const inspections = await Inspection.find(inspectionQuery)
      .sort({ scheduledDate: 1 })
      .limit(20);
    
    // Get Audits assigned to user
    const auditQuery = { 
      organization: orgId, 
      $or: [{ leadAuditor: userId }, { auditTeam: userId }],
      status: { $nin: ['completed', 'cancelled'] }
    };
    if (Object.keys(dateFilter).length > 0) auditQuery.scheduledDate = dateFilter;
    
    const audits = await ScheduledAudit.find(auditQuery)
      .populate('leadAuditor', 'firstName lastName')
      .sort({ scheduledDate: 1 })
      .limit(20);
    
    // Get Training assigned to user
    const trainingQuery = { organization: orgId, assignedTo: userId, status: { $nin: ['completed', 'expired'] } };
    if (Object.keys(dateFilter).length > 0) trainingQuery.dueDate = dateFilter;
    
    const training = await TrainingRecord.find(trainingQuery)
      .populate('course', 'title')
      .sort({ dueDate: 1 })
      .limit(20);
    
    // Get Incidents needing action (assigned to user or needs their approval)
    const incidentQuery = { 
      organization: orgId,
      $or: [
        { assignedTo: userId },
        { 'investigation.leadInvestigator': userId },
        { reviewedBy: userId, status: 'pending_review' }
      ],
      status: { $nin: ['closed', 'approved'] }
    };
    
    const incidents = await Incident.find(incidentQuery)
      .populate('reportedBy', 'firstName lastName')
      .sort({ dateOccurred: -1 })
      .limit(20);
    
    // Get I-CARE follow-ups
    const icareQuery = { 
      organization: orgId, 
      followUpAssignedTo: userId,
      followUpStatus: { $nin: ['completed', 'cancelled'] }
    };
    
    const icareFollowups = await ICareNote.find(icareQuery)
      .populate('observer', 'firstName lastName')
      .sort({ followUpDueDate: 1 })
      .limit(20);
    
    // Get pending approvals
    const approvalActions = await ActionItem.find({
      organization: orgId,
      status: 'pending_approval',
      // Would check if user is approver based on hierarchy
    }).limit(10);
    
    // Combine and format for inbox
    const inboxItems = [];
    
    actions.forEach(a => inboxItems.push({
      id: a._id,
      type: 'action',
      typeLabel: 'Action Item',
      number: a.actionNumber,
      title: a.title,
      description: a.description,
      status: a.status,
      priority: a.priority,
      dueDate: a.dueDate,
      isOverdue: a.dueDate && new Date(a.dueDate) < today,
      createdBy: a.createdBy,
      relatedTo: a.relatedIncident?.incidentNumber,
      url: '/actions/' + a._id
    }));
    
    inspections.forEach(i => inboxItems.push({
      id: i._id,
      type: 'inspection',
      typeLabel: 'Inspection',
      number: i.inspectionNumber,
      title: i.title,
      status: i.status,
      priority: 'normal',
      dueDate: i.scheduledDate,
      isOverdue: i.scheduledDate && new Date(i.scheduledDate) < today,
      url: '/inspections/' + i._id
    }));
    
    audits.forEach(a => inboxItems.push({
      id: a._id,
      type: 'audit',
      typeLabel: 'Audit',
      number: a.auditNumber,
      title: a.title,
      status: a.status,
      priority: 'normal',
      dueDate: a.scheduledDate,
      isOverdue: a.scheduledDate && new Date(a.scheduledDate) < today,
      url: '/audits/' + a._id
    }));
    
    training.forEach(t => inboxItems.push({
      id: t._id,
      type: 'training',
      typeLabel: 'Training',
      title: t.course?.title || 'Training',
      status: t.status,
      priority: 'normal',
      dueDate: t.dueDate,
      isOverdue: t.dueDate && new Date(t.dueDate) < today,
      url: '/training/' + t._id
    }));
    
    incidents.forEach(i => inboxItems.push({
      id: i._id,
      type: 'incident',
      typeLabel: 'Incident',
      number: i.incidentNumber,
      title: i.title,
      status: i.status,
      priority: i.severity === 'catastrophic' || i.severity === 'severe' ? 'critical' : i.severity === 'major' ? 'high' : 'normal',
      dueDate: null,
      isOverdue: false,
      url: '/incidents/' + i._id
    }));
    
    icareFollowups.forEach(i => inboxItems.push({
      id: i._id,
      type: 'icare',
      typeLabel: 'I-CARE Follow-up',
      number: i.noteNumber,
      title: i.observation?.substring(0, 100),
      status: i.followUpStatus,
      priority: 'normal',
      dueDate: i.followUpDueDate,
      isOverdue: i.followUpDueDate && new Date(i.followUpDueDate) < today,
      url: '/icare/' + i._id
    }));
    
    // Sort by due date and priority
    inboxItems.sort((a, b) => {
      // Overdue first
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // Then by priority
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by due date
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
    
    // Summary counts
    const summary = {
      total: inboxItems.length,
      overdue: inboxItems.filter(i => i.isOverdue).length,
      dueToday: inboxItems.filter(i => {
        if (!i.dueDate) return false;
        const d = new Date(i.dueDate);
        return d >= today && d < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      }).length,
      dueThisWeek: inboxItems.filter(i => {
        if (!i.dueDate) return false;
        const d = new Date(i.dueDate);
        return d >= today && d <= thisWeek;
      }).length,
      byType: {
        actions: actions.length,
        inspections: inspections.length,
        audits: audits.length,
        training: training.length,
        incidents: incidents.length,
        icare: icareFollowups.length
      }
    };
    
    res.json({ items: inboxItems, summary });
  } catch (error) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Failed to get inbox' });
  }
});

// -----------------------------------------------------------------------------
// USER HIERARCHY ROUTES
// -----------------------------------------------------------------------------

app.get('/api/hierarchy', authenticate, async (req, res) => {
  try {
    const hierarchy = await UserHierarchy.findOne({ user: req.user._id })
      .populate('reportsTo', 'firstName lastName email jobTitle')
      .populate('directReports', 'firstName lastName email jobTitle');
    
    res.json({ hierarchy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get hierarchy' });
  }
});

app.get('/api/hierarchy/org-chart', authenticate, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    // Get all users with hierarchy
    const users = await User.find({ organization: req.organization._id, isActive: true })
      .select('firstName lastName email jobTitle department role');
    
    const hierarchies = await UserHierarchy.find({ organization: req.organization._id })
      .populate('reportsTo', 'firstName lastName');
    
    // Build org chart structure
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        ...u.toObject(),
        children: []
      };
    });
    
    hierarchies.forEach(h => {
      if (h.reportsTo && userMap[h.user.toString()]) {
        const parent = userMap[h.reportsTo.toString()];
        if (parent) {
          parent.children.push(userMap[h.user.toString()]);
        }
      }
    });
    
    // Find root nodes (no reportsTo)
    const roots = [];
    hierarchies.forEach(h => {
      if (!h.reportsTo && userMap[h.user.toString()]) {
        roots.push(userMap[h.user.toString()]);
      }
    });
    
    // If no hierarchy defined, return flat list
    if (roots.length === 0) {
      res.json({ orgChart: users.map(u => ({ ...u.toObject(), children: [] })) });
    } else {
      res.json({ orgChart: roots });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get org chart' });
  }
});

app.put('/api/hierarchy/:userId', authenticate, requireRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { reportsTo, canApproveFor, canAssignTo } = req.body;
    
    let hierarchy = await UserHierarchy.findOne({ user: req.params.userId });
    
    if (!hierarchy) {
      hierarchy = new UserHierarchy({
        organization: req.organization._id,
        user: req.params.userId
      });
    }
    
    if (reportsTo !== undefined) hierarchy.reportsTo = reportsTo || null;
    if (canApproveFor) hierarchy.canApproveFor = canApproveFor;
    if (canAssignTo) hierarchy.canAssignTo = canAssignTo;
    
    // Rebuild supervisor chain
    if (hierarchy.reportsTo) {
      const chain = [];
      let current = await UserHierarchy.findOne({ user: hierarchy.reportsTo });
      while (current) {
        chain.push(current.user);
        if (current.reportsTo) {
          current = await UserHierarchy.findOne({ user: current.reportsTo });
        } else {
          current = null;
        }
      }
      hierarchy.supervisorChain = chain;
      hierarchy.hierarchyLevel = chain.length + 1;
    } else {
      hierarchy.supervisorChain = [];
      hierarchy.hierarchyLevel = 0;
    }
    
    hierarchy.updatedAt = new Date();
    await hierarchy.save();
    
    // Update supervisor's directReports
    if (hierarchy.reportsTo) {
      await UserHierarchy.findOneAndUpdate(
        { user: hierarchy.reportsTo },
        { $addToSet: { directReports: req.params.userId } }
      );
    }
    
    res.json({ hierarchy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update hierarchy' });
  }
});

app.get('/api/hierarchy/subordinates', authenticate, async (req, res) => {
  try {
    const hierarchy = await UserHierarchy.findOne({ user: req.user._id });
    
    if (!hierarchy || hierarchy.directReports.length === 0) {
      return res.json({ subordinates: [] });
    }
    
    const subordinates = await User.find({ _id: { $in: hierarchy.directReports }, isActive: true })
      .select('firstName lastName email jobTitle department');
    
    res.json({ subordinates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get subordinates' });
  }
});

// Get users that can be assigned tasks by current user
app.get('/api/hierarchy/assignable-users', authenticate, async (req, res) => {
  try {
    const hierarchy = await UserHierarchy.findOne({ user: req.user._id });
    
    let assignableIds = [];
    
    // User can always self-assign
    assignableIds.push(req.user._id);
    
    if (hierarchy) {
      // Can assign to direct reports
      if (hierarchy.directReports?.length > 0) {
        assignableIds = assignableIds.concat(hierarchy.directReports);
      }
      // Can assign to specific users
      if (hierarchy.canAssignTo?.length > 0) {
        assignableIds = assignableIds.concat(hierarchy.canAssignTo);
      }
    }
    
    // Admin/Manager can assign to anyone in org
    if (['admin', 'manager', 'safety_officer'].includes(req.user.role)) {
      const allUsers = await User.find({ organization: req.organization._id, isActive: true })
        .select('firstName lastName email jobTitle department');
      return res.json({ users: allUsers });
    }
    
    const users = await User.find({ _id: { $in: assignableIds }, isActive: true })
      .select('firstName lastName email jobTitle department');
    
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get assignable users' });
  }
});

// -----------------------------------------------------------------------------
// I-CARE NOTES ROUTES
// -----------------------------------------------------------------------------

app.get('/api/icare', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 15, type, status, observer, search } = req.query;
    const query = { organization: req.organization._id };
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (observer) query.observer = observer;
    if (search) {
      query.$or = [
        { observation: { $regex: search, $options: 'i' } },
        { noteNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const notes = await ICareNote.find(query)
      .populate('observer', 'firstName lastName')
      .populate('observedPerson', 'firstName lastName')
      .populate('followUpAssignedTo', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ICareNote.countDocuments(query);
    
    // Summary stats
    const stats = await ICareNote.aggregate([
      { $match: { organization: req.organization._id } },
      { $group: {
        _id: '$type',
        count: { $sum: 1 }
      }}
    ]);
    
    res.json({ 
      notes, 
      stats,
      pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get I-CARE notes' });
  }
});

app.post('/api/icare', authenticate, async (req, res) => {
  try {
    const noteNumber = await generateNumber(ICareNote, 'ICARE', req.organization._id);
    const note = await ICareNote.create({
      ...req.body,
      organization: req.organization._id,
      noteNumber,
      observer: req.user._id,
      observerName: req.user.firstName + ' ' + req.user.lastName
    });
    
    // Notify follow-up assignee if applicable
    if (note.followUpRequired && note.followUpAssignedTo) {
      await createNotification({
        organization: req.organization._id,
        recipient: note.followUpAssignedTo,
        sender: req.user._id,
        type: 'icare_received',
        title: 'I-CARE Follow-up Assigned',
        message: `You have been assigned follow-up for I-CARE note ${noteNumber}`,
        entityType: 'icare',
        entityId: note._id,
        entityNumber: noteNumber,
        actionUrl: '/icare/' + note._id
      });
    }
    
    res.status(201).json({ note });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create I-CARE note' });
  }
});

app.put('/api/icare/:id', authenticate, async (req, res) => {
  try {
    const note = await ICareNote.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!note) return res.status(404).json({ error: 'I-CARE note not found' });
    res.json({ note });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update I-CARE note' });
  }
});

app.delete('/api/icare/:id', authenticate, requireRole(['admin', 'manager', 'safety_officer']), async (req, res) => {
  try {
    await ICareNote.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete I-CARE note' });
  }
});

// -----------------------------------------------------------------------------
// SCHEDULED AUDIT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/scheduled-audits', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 15, status, type } = req.query;
    const query = { organization: req.organization._id };
    if (status) query.status = status;
    if (type) query.auditType = type;
    
    const audits = await ScheduledAudit.find(query)
      .populate('leadAuditor', 'firstName lastName')
      .populate('auditTeam', 'firstName lastName')
      .sort({ scheduledDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ScheduledAudit.countDocuments(query);
    res.json({ audits, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audits' });
  }
});

app.post('/api/scheduled-audits', authenticate, requireRole(['admin', 'manager', 'safety_officer']), async (req, res) => {
  try {
    const auditNumber = await generateNumber(ScheduledAudit, 'AUD', req.organization._id);
    const audit = await ScheduledAudit.create({
      ...req.body,
      organization: req.organization._id,
      auditNumber,
      createdBy: req.user._id
    });
    
    // Notify lead auditor
    if (audit.leadAuditor && !audit.leadAuditor.equals(req.user._id)) {
      await createNotification({
        organization: req.organization._id,
        recipient: audit.leadAuditor,
        sender: req.user._id,
        type: 'audit_assigned',
        title: 'Audit Assigned',
        message: `You have been assigned as lead auditor for: ${audit.title}`,
        entityType: 'audit',
        entityId: audit._id,
        entityNumber: auditNumber
      });
    }
    
    // Notify team members
    for (const member of (audit.auditTeam || [])) {
      if (!member.equals(req.user._id) && !member.equals(audit.leadAuditor)) {
        await createNotification({
          organization: req.organization._id,
          recipient: member,
          sender: req.user._id,
          type: 'audit_assigned',
          title: 'Added to Audit Team',
          message: `You have been added to the audit team for: ${audit.title}`,
          entityType: 'audit',
          entityId: audit._id,
          entityNumber: auditNumber
        });
      }
    }
    
    res.status(201).json({ audit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create audit' });
  }
});

app.put('/api/scheduled-audits/:id', authenticate, async (req, res) => {
  try {
    const audit = await ScheduledAudit.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    res.json({ audit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update audit' });
  }
});

app.delete('/api/scheduled-audits/:id', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    await ScheduledAudit.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete audit' });
  }
});

// -----------------------------------------------------------------------------
// CUSTOM DASHBOARD & WIDGET ROUTES
// -----------------------------------------------------------------------------

app.get('/api/dashboards', authenticate, async (req, res) => {
  try {
    const dashboards = await CustomDashboard.find({
      $or: [
        { organization: req.organization._id, createdBy: req.user._id },
        { organization: req.organization._id, isPublic: true },
        { organization: req.organization._id, sharedWith: req.user._id },
        { organization: req.organization._id, sharedWithRoles: req.user.role },
        { organization: req.organization._id, isOrgDefault: true }
      ],
      isActive: true
    }).populate('createdBy', 'firstName lastName');
    
    res.json({ dashboards });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get dashboards' });
  }
});

app.post('/api/dashboards', authenticate, async (req, res) => {
  try {
    const dashboard = await CustomDashboard.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ dashboard });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

app.put('/api/dashboards/:id', authenticate, async (req, res) => {
  try {
    const dashboard = await CustomDashboard.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id, createdBy: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });
    res.json({ dashboard });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

app.delete('/api/dashboards/:id', authenticate, async (req, res) => {
  try {
    await CustomDashboard.findOneAndDelete({ _id: req.params.id, organization: req.organization._id, createdBy: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// Widgets
app.get('/api/widgets', authenticate, async (req, res) => {
  try {
    const widgets = await DashboardWidget.find({
      $or: [
        { organization: req.organization._id, createdBy: req.user._id },
        { organization: req.organization._id, isPublic: true },
        { organization: req.organization._id, sharedWith: req.user._id }
      ],
      isActive: true
    }).populate('createdBy', 'firstName lastName');
    
    res.json({ widgets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get widgets' });
  }
});

app.post('/api/widgets', authenticate, async (req, res) => {
  try {
    const widget = await DashboardWidget.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ widget });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create widget' });
  }
});

app.put('/api/widgets/:id', authenticate, async (req, res) => {
  try {
    const widget = await DashboardWidget.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id, createdBy: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!widget) return res.status(404).json({ error: 'Widget not found' });
    res.json({ widget });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update widget' });
  }
});

app.delete('/api/widgets/:id', authenticate, async (req, res) => {
  try {
    await DashboardWidget.findOneAndDelete({ _id: req.params.id, organization: req.organization._id, createdBy: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete widget' });
  }
});

// Widget data endpoint
app.get('/api/widgets/:id/data', authenticate, async (req, res) => {
  try {
    const widget = await DashboardWidget.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!widget) return res.status(404).json({ error: 'Widget not found' });
    
    // Calculate date range
    let startDate, endDate = new Date();
    const now = new Date();
    
    switch (widget.filters?.dateRange) {
      case 'today': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
      case 'this_week': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case 'this_month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'this_quarter': startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case 'this_year': startDate = new Date(now.getFullYear(), 0, 1); break;
      case 'custom': startDate = widget.filters.startDate; endDate = widget.filters.endDate; break;
      default: startDate = new Date(now.getFullYear(), 0, 1);
    }
    
    // Build query based on data source
    let data;
    const baseQuery = { organization: req.organization._id };
    if (startDate) baseQuery.createdAt = { $gte: startDate, $lte: endDate };
    
    switch (widget.dataSource) {
      case 'incidents':
        if (widget.widgetType === 'stat_card') {
          data = await Incident.countDocuments(baseQuery);
        } else {
          data = await Incident.aggregate([
            { $match: baseQuery },
            { $group: { _id: '$' + (widget.aggregation?.groupBy || 'type'), count: { $sum: 1 } } }
          ]);
        }
        break;
      case 'actions':
        if (widget.widgetType === 'stat_card') {
          data = await ActionItem.countDocuments(baseQuery);
        } else {
          data = await ActionItem.aggregate([
            { $match: baseQuery },
            { $group: { _id: '$' + (widget.aggregation?.groupBy || 'status'), count: { $sum: 1 } } }
          ]);
        }
        break;
      case 'inspections':
        data = await Inspection.countDocuments(baseQuery);
        break;
      case 'training':
        data = await TrainingRecord.countDocuments(baseQuery);
        break;
      case 'icare':
        if (widget.widgetType === 'stat_card') {
          data = await ICareNote.countDocuments(baseQuery);
        } else {
          data = await ICareNote.aggregate([
            { $match: baseQuery },
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ]);
        }
        break;
      default:
        data = 0;
    }
    
    res.json({ data, lastUpdated: new Date() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get widget data' });
  }
});

// -----------------------------------------------------------------------------
// CUSTOM REPORT ROUTES
// -----------------------------------------------------------------------------

app.get('/api/custom-reports', authenticate, async (req, res) => {
  try {
    const reports = await CustomReport.find({
      $or: [
        { organization: req.organization._id, createdBy: req.user._id },
        { organization: req.organization._id, isPublic: true },
        { organization: req.organization._id, sharedWith: req.user._id }
      ],
      isActive: true
    }).populate('createdBy', 'firstName lastName');
    
    res.json({ reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

app.post('/api/custom-reports', authenticate, async (req, res) => {
  try {
    const report = await CustomReport.create({
      ...req.body,
      organization: req.organization._id,
      createdBy: req.user._id
    });
    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create report' });
  }
});

app.put('/api/custom-reports/:id', authenticate, async (req, res) => {
  try {
    const report = await CustomReport.findOneAndUpdate(
      { _id: req.params.id, organization: req.organization._id, createdBy: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update report' });
  }
});

app.delete('/api/custom-reports/:id', authenticate, async (req, res) => {
  try {
    await CustomReport.findOneAndDelete({ _id: req.params.id, organization: req.organization._id, createdBy: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Run report
app.post('/api/custom-reports/:id/run', authenticate, async (req, res) => {
  try {
    const report = await CustomReport.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    const { userFilters } = req.body;
    const startTime = Date.now();
    
    // Build query based on report config
    const query = { organization: req.organization._id };
    
    // Apply fixed filters
    report.filters.forEach(f => {
      if (f.operator === 'equals') query[f.field] = f.value;
      else if (f.operator === 'in') query[f.field] = { $in: f.value };
      else if (f.operator === 'greater_than') query[f.field] = { $gt: f.value };
      else if (f.operator === 'less_than') query[f.field] = { $lt: f.value };
    });
    
    // Apply user filters from request
    if (userFilters) {
      Object.entries(userFilters).forEach(([field, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          query[field] = value;
        }
      });
    }
    
    // Get model based on primary source
    const models = {
      incidents: Incident, actions: ActionItem, inspections: Inspection,
      training: TrainingRecord, audits: ScheduledAudit, observations: SafetyObservation,
      icare: ICareNote, users: User
    };
    
    const Model = models[report.primarySource];
    if (!Model) return res.status(400).json({ error: 'Invalid data source' });
    
    // Build projection
    const projection = {};
    report.columns.filter(c => c.visible).forEach(c => {
      projection[c.field] = 1;
    });
    
    // Execute query
    let dataQuery = Model.find(query, projection);
    
    // Apply sorting
    if (report.sortBy?.length > 0) {
      const sort = {};
      report.sortBy.forEach(s => { sort[s.field] = s.direction === 'desc' ? -1 : 1; });
      dataQuery = dataQuery.sort(sort);
    }
    
    const data = await dataQuery.limit(1000);
    
    // Calculate summaries
    let summaries = {};
    if (report.showSummary && report.summaryFields?.length > 0) {
      const aggregation = [{ $match: query }];
      const groupFields = { _id: null };
      
      report.summaryFields.forEach(sf => {
        if (sf.aggregation === 'count') groupFields[sf.field] = { $sum: 1 };
        else if (sf.aggregation === 'sum') groupFields[sf.field] = { $sum: '$' + sf.field };
        else if (sf.aggregation === 'avg') groupFields[sf.field] = { $avg: '$' + sf.field };
      });
      
      aggregation.push({ $group: groupFields });
      const summaryResult = await Model.aggregate(aggregation);
      if (summaryResult.length > 0) summaries = summaryResult[0];
    }
    
    // Update report stats
    await CustomReport.findByIdAndUpdate(report._id, {
      lastRunAt: new Date(),
      lastRunBy: req.user._id,
      lastRunDuration: Date.now() - startTime,
      $inc: { runCount: 1 }
    });
    
    res.json({ 
      data, 
      summaries,
      rowCount: data.length,
      executionTime: Date.now() - startTime
    });
  } catch (error) {
    console.error('Report execution error:', error);
    res.status(500).json({ error: 'Failed to run report' });
  }
});

// -----------------------------------------------------------------------------
// INCIDENT LIFECYCLE ROUTES
// -----------------------------------------------------------------------------

app.post('/api/incidents/:id/transition', authenticate, async (req, res) => {
  try {
    const { action, comments, returnReason } = req.body;
    const incident = await Incident.findOne({ _id: req.params.id, organization: req.organization._id });
    
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    
    const oldStatus = incident.status;
    let newStatus = oldStatus;
    
    // Define allowed transitions
    const transitions = {
      draft: { submit: 'submitted' },
      submitted: { acknowledge: 'acknowledged', return: 'draft' },
      acknowledged: { start_investigation: 'investigating', return: 'submitted' },
      investigating: { complete_investigation: 'pending_review', return: 'acknowledged' },
      pending_review: { approve_review: 'pending_approval', return: 'investigating', reject: 'investigating' },
      pending_approval: { approve: 'approved', reject: 'pending_review', return: 'pending_review' },
      approved: { complete: 'closed', reopen: 'reopened' },
      closed: { reopen: 'reopened', archive: 'archived' },
      reopened: { close: 'closed', investigate: 'investigating' }
    };
    
    if (!transitions[oldStatus] || !transitions[oldStatus][action]) {
      return res.status(400).json({ error: 'Invalid transition' });
    }
    
    newStatus = transitions[oldStatus][action];
    
    // Update incident status
    incident.status = newStatus;
    
    // Update dates based on transition
    if (action === 'start_investigation') {
      incident.dateInvestigationStarted = new Date();
    } else if (action === 'complete_investigation') {
      incident.dateInvestigationCompleted = new Date();
    } else if (action === 'approve') {
      incident.approvedBy = req.user._id;
      incident.approvedAt = new Date();
    } else if (action === 'complete') {
      incident.closedBy = req.user._id;
      incident.closedAt = new Date();
    }
    
    incident.updatedAt = new Date();
    await incident.save();
    
    // Create lifecycle record
    const lifecycle = await IncidentLifecycle.create({
      organization: req.organization._id,
      incident: incident._id,
      fromStatus: oldStatus,
      toStatus: newStatus,
      performedBy: req.user._id,
      action,
      comments,
      returnReason
    });
    
    // Send notifications
    await notifyIncidentStatusChange(incident, oldStatus, newStatus, req.user._id);
    
    res.json({ incident, lifecycle });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transition incident' });
  }
});

app.get('/api/incidents/:id/lifecycle', authenticate, async (req, res) => {
  try {
    const lifecycle = await IncidentLifecycle.find({ incident: req.params.id })
      .populate('performedBy', 'firstName lastName')
      .sort({ performedAt: -1 });
    
    res.json({ lifecycle });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lifecycle' });
  }
});

// -----------------------------------------------------------------------------
// INCIDENT ARCHIVE ROUTES
// -----------------------------------------------------------------------------

app.post('/api/incidents/:id/archive', authenticate, requireRole(['admin', 'manager', 'moderator']), async (req, res) => {
  try {
    const { reason } = req.body;
    const incident = await Incident.findOne({ _id: req.params.id, organization: req.organization._id });
    
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (incident.status !== 'closed') return res.status(400).json({ error: 'Only closed incidents can be archived' });
    
    // Create archive record
    const archived = await ArchivedIncident.create({
      organization: req.organization._id,
      originalIncidentId: incident._id,
      incidentNumber: incident.incidentNumber,
      incidentData: incident.toObject(),
      archivedBy: req.user._id,
      archiveReason: reason,
      retentionPeriod: 365 * 7, // 7 years for OSHA
      deleteAfter: new Date(Date.now() + 365 * 7 * 24 * 60 * 60 * 1000)
    });
    
    // Create lifecycle record
    await IncidentLifecycle.create({
      organization: req.organization._id,
      incident: incident._id,
      fromStatus: 'closed',
      toStatus: 'archived',
      performedBy: req.user._id,
      action: 'archived',
      comments: reason
    });
    
    // Delete original (or mark as archived)
    await Incident.findByIdAndDelete(incident._id);
    
    res.json({ archived, message: 'Incident archived successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive incident' });
  }
});

app.get('/api/archived-incidents', authenticate, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const archived = await ArchivedIncident.find({ organization: req.organization._id })
      .populate('archivedBy', 'firstName lastName')
      .sort({ archivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ArchivedIncident.countDocuments({ organization: req.organization._id });
    res.json({ archived, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get archived incidents' });
  }
});

app.post('/api/archived-incidents/:id/restore', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const archived = await ArchivedIncident.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!archived) return res.status(404).json({ error: 'Archived incident not found' });
    if (!archived.canRestore) return res.status(400).json({ error: 'This incident cannot be restored' });
    
    // Restore incident
    const incidentData = archived.incidentData;
    delete incidentData._id;
    incidentData.status = 'closed';
    
    const incident = await Incident.create(incidentData);
    
    // Update archive record
    archived.restoredAt = new Date();
    archived.restoredBy = req.user._id;
    archived.canRestore = false;
    await archived.save();
    
    res.json({ incident, message: 'Incident restored successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore incident' });
  }
});

// -----------------------------------------------------------------------------
// DOCUMENT UPLOAD ROUTES
// -----------------------------------------------------------------------------

app.post('/api/documents/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const doc = await DocumentUpload.create({
      organization: req.organization._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      documentType: req.body.documentType || 'other',
      category: req.body.category,
      entityType: req.body.entityType,
      entityId: req.body.entityId,
      title: req.body.title || req.file.originalname,
      description: req.body.description,
      tags: req.body.tags ? req.body.tags.split(',') : [],
      isConfidential: req.body.isConfidential === 'true',
      uploadedBy: req.user._id,
      storagePath: req.file.path
    });
    
    res.status(201).json({ document: doc });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.get('/api/documents', authenticate, async (req, res) => {
  try {
    const { entityType, entityId, documentType, page = 1, limit = 20 } = req.query;
    const query = { organization: req.organization._id, isActive: true };
    
    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (documentType) query.documentType = documentType;
    
    const documents = await DocumentUpload.find(query)
      .populate('uploadedBy', 'firstName lastName')
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await DocumentUpload.countDocuments(query);
    res.json({ documents, pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

app.get('/api/documents/:id/download', authenticate, async (req, res) => {
  try {
    const doc = await DocumentUpload.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    // Check access
    if (doc.isConfidential && doc.accessLevel === 'restricted') {
      if (!doc.allowedUsers.includes(req.user._id) && !doc.allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const filePath = path.join(__dirname, doc.storagePath || 'uploads', doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    
    res.download(filePath, doc.originalName);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download document' });
  }
});

app.delete('/api/documents/:id', authenticate, async (req, res) => {
  try {
    const doc = await DocumentUpload.findOne({ _id: req.params.id, organization: req.organization._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    // Only uploader or admin can delete
    if (!doc.uploadedBy.equals(req.user._id) && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Soft delete
    doc.isActive = false;
    doc.isArchived = true;
    doc.archivedAt = new Date();
    doc.archivedBy = req.user._id;
    await doc.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get documents for LTI/RI incidents
app.get('/api/incidents/:id/documents', authenticate, async (req, res) => {
  try {
    const documents = await DocumentUpload.find({
      organization: req.organization._id,
      entityType: 'incident',
      entityId: req.params.id,
      isActive: true
    }).populate('uploadedBy', 'firstName lastName').sort({ uploadedAt: -1 });
    
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get incident documents' });
  }
});

// -----------------------------------------------------------------------------
// USER PREFERENCES ROUTES
// -----------------------------------------------------------------------------

app.get('/api/preferences', authenticate, async (req, res) => {
  try {
    let prefs = await UserPreferences.findOne({ user: req.user._id });
    if (!prefs) {
      prefs = await UserPreferences.create({ user: req.user._id });
    }
    res.json({ preferences: prefs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

app.put('/api/preferences', authenticate, async (req, res) => {
  try {
    const prefs = await UserPreferences.findOneAndUpdate(
      { user: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ preferences: prefs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// =============================================================================
// DATABASE CONNECTION & SERVER START
// =============================================================================

const startServer = () => {
  // Create directories
  if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads', { recursive: true });
  }
  if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public', { recursive: true });
  }

  app.listen(CONFIG.PORT, () => {
    console.log(`EHS Management Server running on port ${CONFIG.PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️  Running in DEMO MODE - MongoDB not connected');
      console.log('   Demo login: demo@safetyfirst.com / demo123');
      console.log('   Super Admin: admin@safetyfirst.com / SuperAdmin123!');
    }
  });
};

mongoose.connect(CONFIG.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    startServer();
  })
  .catch(err => {
    console.error('⚠️  MongoDB connection failed:', err.message);
    console.log('Starting server anyway - demo mode available via login...');
    DEMO_MODE = true;
    startServer();
  });

module.exports = app;
