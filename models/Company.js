const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryptDecrypt'); // Import encryption utilities

const CompanySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a company name'],
      unique: true,
    },
    applicationName: {
      type: String,
      default: 'LeadIgniter',
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    darkThemeEnabled: {
      type: Boolean,
      default: false,
    },
    smtpConfig: {
      host: String,
      port: Number,
      security: {
        type: String,
        enum: ['SSL/TLS', 'STARTTLS', 'None'],
      },
      username: String,
      password: String, // Stored encrypted
    },
    apiSettings: {
      apiKey: String, // Stored encrypted
      webhookUrl: String,
      rateLimitPerHour: {
        type: Number,
        default: 1000,
      },
      apiAccessLoggingEnabled: {
        type: Boolean,
        default: false,
      },
    },
    notificationSettings: {
      campaignCompletion: { type: Boolean, default: true },
      dailyReports: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true },
      newTeamMembers: { type: Boolean, default: true },
      notificationEmail: String,
    },
    securityPrivacySettings: {
      autoLogoutEnabled: { type: Boolean, default: true },
      sessionTimeoutMinutes: { type: Number, default: 60 },
      dataEncryptionEnabled: { type: Boolean, default: true },
      auditLoggingEnabled: { type: Boolean, default: true },
      dataRetentionDays: { type: Number, default: 365 },
      privacyPolicyUrl: String,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to encrypt sensitive data
CompanySchema.pre('save', function (next) {
  if (this.isModified('smtpConfig.password') && this.smtpConfig.password) {
    this.smtpConfig.password = encrypt(this.smtpConfig.password);
  }
  if (this.isModified('apiSettings.apiKey') && this.apiSettings.apiKey) {
    this.apiSettings.apiKey = encrypt(this.apiSettings.apiKey);
  }
  next();
});

// Post-find hook to decrypt sensitive data when retrieved
CompanySchema.post('find', function (docs) {
  docs.forEach(doc => {
    if (doc.smtpConfig && doc.smtpConfig.password) {
      doc.smtpConfig.password = decrypt(doc.smtpConfig.password);
    }
    if (doc.apiSettings && doc.apiSettings.apiKey) {
      doc.apiSettings.apiKey = decrypt(doc.apiSettings.apiKey);
    }
  });
});

CompanySchema.post('findOne', function (doc) {
  if (doc) {
    if (doc.smtpConfig && doc.smtpConfig.password) {
      doc.smtpConfig.password = decrypt(doc.smtpConfig.password);
    }
    if (doc.apiSettings && doc.apiSettings.apiKey) {
      doc.apiSettings.apiKey = decrypt(doc.apiSettings.apiKey);
    }
  }
});


module.exports = mongoose.model('Company', CompanySchema);