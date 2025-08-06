const { getJson } = require("serpapi");
require('dotenv').config(); // Load environment variables from .env file
const Company = require('../models/Company'); // 1. Import the Company model

const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

async function getEmailsFromSerpAPI(keyword, companyId) {
  
  const company = await Company.findById(companyId); 
  
  if (!company || !company.apiSettings || !company.apiSettings.apiKey) {
    throw new Error('Company not found or API key is missing.');
  }

  const serpApiKey = company.apiSettings.apiKey;

  const baseParams = {
    q: `${keyword}`,
    hl: "en",
    gl: "us",
    google_domain: "google.com",
    num: 100,
    api_key: serpApiKey,
  };

  const emailObjects = new Map();

  for (let start = 0; start < 1000; start += 100) {
    try {
      const data = await new Promise((resolve, reject) =>
        getJson({ ...baseParams, start }, (json) =>
          json.error ? reject(json.error) : resolve(json)
        )
      );

      if (!data.organic_results?.length) break;
      
      data.organic_results.forEach((result) => {
        const snippet = result.snippet || "";
        const foundEmails = snippet.match(emailRegex) || [];
        foundEmails.forEach((email) => {
          if (!emailObjects.has(email)) {
            emailObjects.set(email, {
              email,
              rawSource: result, // Only the specific block where email was found
            });
          }
        });
      });

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.log("SerpAPI error:", err);
      break;
    }
  }

  return {
    emails: Array.from(emailObjects.values()), // [{ email, rawSource }, ...]
  };
};

module.exports = { getEmailsFromSerpAPI };