// services/extractionService.js

const Lead = require('../models/Lead');
const ExtractionJob = require('../models/ExtractionJob');
const { emailRegex } = require('../utils/validationUtils'); // A utility for basic email validation
const { getEmailsFromSerpAPI } = require('../services/serpApiService');

// This function simulates email extraction
// In a real application, this would involve web scraping libraries (e.g., Puppeteer, Cheerio)
// and potentially external APIs. This would also likely be run in a background worker.
const performEmailExtraction = async (jobId, companyId, keywords, extractedByUserId) => {
    console.log(`[Extraction Service] Starting extraction job ${jobId} for company ${companyId} with keywords: ${keywords.join(', ')}`);

    const job = await ExtractionJob.findById(jobId);
    if (!job) {
        console.error(`Extraction job ${jobId} not found.`);
        return;
    }

    job.status = 'Running';
    job.startTime = new Date();
    await job.save();

    let extractedCount = 0;
    const emailsToSave = [];

    try {

        for (const keyword of keywords) {
            const serpApiResult = await getEmailsFromSerpAPI(keyword, companyId);
            const emails = serpApiResult.emails;
            emails.forEach(emailObject => {
                const uniqueEmail = emailObject.email;
                if (emailRegex.test(uniqueEmail)) {
                    emailsToSave.push({
                        companyId,
                        email: uniqueEmail,
                        source: 'Extraction',
                        sourceDetails: {
                            extractionJobId: jobId,
                            keyword: keyword,
                            country: 'Determined by SerpAPI search' // Can be determined by scraper
                        },
                        createdBy: extractedByUserId,
                        rawJson: emailObject.rawSource // Add the raw data here
                    });
                    extractedCount++;
                }
            });
        }
        // --- END SIMULATED EXTRACTION LOGIC ---

        // Bulk insert leads, ignoring duplicates (due to unique index)
        const bulkOps = emailsToSave.map(lead => ({
            insertOne: {
                document: lead
            }
        }));

        if (bulkOps.length > 0) {
            const bulkWriteResult = await Lead.bulkWrite(bulkOps, { ordered: false });
            job.emailsVerified = bulkWriteResult.insertedCount; // Count successfully inserted
        } else {
            job.emailsVerified = 0;
        }

        job.totalEmailsExtracted = extractedCount;
        job.status = 'Completed';
        job.endTime = new Date();
        // In a real app, you might generate a CSV file here and set job.downloadUrl
        // job.downloadUrl = `/downloads/extraction-job-${jobId}.csv`;
        await job.save();
        let emailsVerified = job.emailsVerified;
        console.log(`[Extraction Service] Job ${jobId} completed. Extracted: ${extractedCount}, Verified: ${job.emailsVerified}`);
        return { totalExtracted: extractedCount, totalVerified: emailsVerified };

    } catch (error) {
        console.error(`[Extraction Service] Job ${jobId} failed:`, error);
        job.status = 'Failed';
        job.errorMessage = error.message;
        job.endTime = new Date();
        await job.save();
    }
};

module.exports = { performEmailExtraction };