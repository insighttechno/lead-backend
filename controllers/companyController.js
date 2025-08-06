const asyncHandler = require('express-async-handler');
const Company = require('../models/Company');

// @desc    Get company settings
// @route   GET /api/settings
// @access  Private (Admin/Lead Generation Specialist)
const getCompanySettings = asyncHandler(async (req, res) => {
  
  // req.companyId is attached by authMiddleware
  const company = await Company.findById(req.companyId);

  if (company) {
    // Sensitive data (like SMTP password, API key) will be decrypted by post-find hook
    res.json(company);
  } else {
    res.status(404);
    throw new Error('Company settings not found');
  }
});

// @desc    Update company settings
// @route   PUT /api/settings
// @access  Private (Admin)
const updateCompanySettings = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId);

  if (company) {
    // Update fields from req.body.
    // Ensure you only allow updating of relevant fields to prevent injection.
    // For nested objects like smtpConfig, you might need to merge or set properties individually.
    company.applicationName = req.body.applicationName || company.applicationName;
    company.timezone = req.body.timezone || company.timezone;
    company.darkThemeEnabled = req.body.darkThemeEnabled !== undefined ? req.body.darkThemeEnabled : company.darkThemeEnabled;

     if (req.body.smtpConfig) {
      company.smtpConfig.tenantId = req.body.smtpConfig.tenantId || company.smtpConfig.tenantId;
      company.smtpConfig.clientId = req.body.smtpConfig.clientId || company.smtpConfig.clientId;
      // Client Secret will be encrypted by the pre-save hook if changed
      if (req.body.smtpConfig.clientSecret) {
        company.smtpConfig.clientSecret = req.body.smtpConfig.clientSecret;
      }
    }

    if (req.body.apiSettings) {
      // API Key handling: if a new key is provided, it will be encrypted by pre-save
      if (req.body.apiSettings.apiKey) {
        company.apiSettings.apiKey = req.body.apiSettings.apiKey;
      }
      company.apiSettings.webhookUrl = req.body.apiSettings.webhookUrl || company.apiSettings.webhookUrl;
      // Removed rateLimitPerHour and apiAccessLoggingEnabled from here
    }

    if (req.body.notificationSettings) {
      Object.assign(company.notificationSettings, req.body.notificationSettings);
    }

    if (req.body.securityPrivacySettings) {
      Object.assign(company.securityPrivacySettings, req.body.securityPrivacySettings);
    }

    const updatedCompany = await company.save();
    // Sensitive data will be decrypted by post-find hook before sending response
    res.json({
      message: 'Company settings updated successfully',
      settings: updatedCompany,
    });
  } else {
    res.status(404);
    throw new Error('Company settings not found');
  }
});

module.exports = {
  getCompanySettings,
  updateCompanySettings,
};