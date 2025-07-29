// utils/validationUtils.js

// Basic email regex for front-end and simple back-end validation.
// For robust email validation, consider using a dedicated library like 'validator'
// (npm install validator) and calling validator.isEmail(email).
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = {
  emailRegex,
};