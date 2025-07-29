const asyncHandler = require('express-async-handler');
const RecipientList = require('../models/RecipientList');
const Lead = require('../models/Lead');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { emailRegex } = require('../utils/validationUtils');

// @desc    Get all recipient lists for the company
// @route   GET /api/recipient-lists
// @access  Private
const getRecipientLists = asyncHandler(async (req, res) => {
  const { search, source, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { listName: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  if (source) {
    query.source = source;
  }

  const lists = await RecipientList.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await RecipientList.countDocuments(query);

  res.json({
    lists,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalLists: count,
  });
});

// @desc    Get single recipient list with populated contacts
// @route   GET /api/recipient-lists/:id
// @access  Private
const getRecipientList = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const list = req.resource;

  // Populate contacts. For very large lists, consider pagination here too.
  const populatedList = await list.populate({
    path: 'contacts',
    select: 'email firstName lastName companyName status', // Select relevant lead fields
  });

  res.json(populatedList);
});

// @desc    Create new recipient list (manual input of contacts)
// @route   POST /api/recipient-lists
// @access  Private (Admin, Team Lead, Developer)
const createRecipientList = asyncHandler(async (req, res) => {
  const { listName, description, contacts } = req.body; // contacts as [{ email, firstName, lastName }]

  if (!listName) {
    res.status(400);
    throw new Error('Please provide a list name.');
  }

  const listExists = await RecipientList.findOne({ listName, companyId: req.companyId });
  if (listExists) {
    res.status(400);
    throw new Error('A list with this name already exists for your company.');
  }

  let leadIds = [];
  let totalAdded = 0;

  if (contacts && Array.isArray(contacts) && contacts.length > 0) {
    const bulkOps = [];
    for (const contact of contacts) {
      if (contact.email && emailRegex.test(contact.email)) {
        bulkOps.push({
          updateOne: {
            filter: { companyId: req.companyId, email: contact.email },
            update: {
              $setOnInsert: { // Only set if inserting new document
                companyId: req.companyId,
                email: contact.email.toLowerCase(),
                firstName: contact.firstName,
                lastName: contact.lastName,
                source: 'Manual',
                createdBy: req.user._id,
                status: 'New',
              },
              $addToSet: { // Add tags if relevant for manual leads
                // tags: 'manual_import'
              }
            },
            upsert: true, // Insert if not found, update if found
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      // Execute bulk upsert to get or create lead IDs
      const result = await Lead.bulkWrite(bulkOps, { ordered: false });
      // Get the IDs of the leads that were either inserted or found
      const insertedAndMatchedLeads = await Lead.find({
        companyId: req.companyId,
        email: { $in: contacts.filter(c => c.email && emailRegex.test(c.email)).map(c => c.email.toLowerCase()) }
      }).select('_id');
      leadIds = insertedAndMatchedLeads.map(lead => lead._id);
      totalAdded = leadIds.length;
    }
  }

  const newList = await RecipientList.create({
    companyId: req.companyId,
    listName,
    description,
    source: 'Manual',
    contacts: leadIds,
    totalContacts: totalAdded,
    createdBy: req.user._id,
  });

  res.status(201).json({ message: 'Recipient list created successfully', list: newList });
});

// @desc    Update recipient list details
// @route   PUT /api/recipient-lists/:id
// @access  Private (Admin, Team Lead, Developer)
const updateRecipientList = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const list = req.resource;
  const { listName, description, contacts } = req.body; // Contacts here would be Lead IDs to add/remove

  if (listName) list.listName = listName;
  if (description) list.description = description;

  // Logic to add/remove contacts to the list
  if (contacts && Array.isArray(contacts)) {
    // Assuming 'contacts' in body are _ids of Leads to be added/removed from the list
    // This is a simple overwrite. For add/remove specific, use $addToSet and $pull
    list.contacts = contacts; // Replace existing contacts (careful with large lists)
    list.totalContacts = contacts.length;
  }

  const updatedList = await list.save();
  res.json({ message: 'Recipient list updated successfully', list: updatedList });
});

// @desc    Delete recipient list
// @route   DELETE /api/recipient-lists/:id
// @access  Private (Admin, Team Lead)
const deleteRecipientList = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const list = req.resource;

  // Optional: Check if list is used in any active/scheduled campaigns
  // const campaignsUsingList = await Campaign.countDocuments({ recipientListIds: list._id, status: { $in: ['Active', 'Scheduled'] } });
  // if (campaignsUsingList > 0) {
  //   res.status(400);
  //   throw new Error('Cannot delete recipient list as it is used in active/scheduled campaigns.');
  // }

  await list.deleteOne();
  res.json({ message: 'Recipient list removed successfully' });
});

// @desc    Import contacts into a recipient list from CSV
// @route   POST /api/recipient-lists/:id/import-contacts
// @access  Private (Admin, Team Lead, Developer)
const importContactsToList = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a CSV file.');
  }

  const list = req.resource; // The recipient list to import into

  const results = [];
  const errors = [];
  const incomingLeads = [];

  const bufferStream = new Readable();
  bufferStream.push(req.file.buffer);
  bufferStream.push(null);

  bufferStream
    .pipe(csv())
    .on('data', (data) => {
        // Assume CSV columns like 'email', 'first_name', 'last_name', 'company'
        const email = data.email?.toLowerCase();
        if (email && emailRegex.test(email)) {
            incomingLeads.push({
                email,
                firstName: data.first_name || '',
                lastName: data.last_name || '',
                companyName: data.company || '',
            });
        } else {
            errors.push(`Invalid or missing email: ${JSON.stringify(data)}`);
        }
    })
    .on('end', async () => {
      try {
        const leadIdsToAdd = [];
        const bulkOps = [];

        for (const leadData of incomingLeads) {
          bulkOps.push({
            updateOne: {
              filter: { companyId: req.companyId, email: leadData.email },
              update: {
                $setOnInsert: { // Only set if inserting new document
                  companyId: req.companyId,
                  email: leadData.email,
                  firstName: leadData.firstName,
                  lastName: leadData.lastName,
                  companyName: leadData.companyName,
                  source: 'CSV Upload',
                  sourceDetails: {
                      fileName: req.file.originalname
                  },
                  createdBy: req.user._id,
                  status: 'New',
                },
                $addToSet: { // Ensure tags are added if exists
                    tags: 'csv_import' // Example tag
                }
              },
              upsert: true, // Insert if not found, update if found
            },
          });
        }

        if (bulkOps.length > 0) {
            const bulkWriteResult = await Lead.bulkWrite(bulkOps, { ordered: false });
            // Get the _ids of all leads (newly inserted or existing) from the incoming list
            const insertedAndMatchedLeads = await Lead.find({
              companyId: req.companyId,
              email: { $in: incomingLeads.map(l => l.email) }
            }).select('_id');
            leadIdsToAdd.push(...insertedAndMatchedLeads.map(l => l._id));
        }

        // Add unique new lead IDs to the recipient list
        const currentContactIds = new Set(list.contacts.map(id => id.toString()));
        const newUniqueLeadIds = leadIdsToAdd.filter(id => !currentContactIds.has(id.toString()));

        list.contacts.push(...newUniqueLeadIds);
        list.totalContacts = list.contacts.length; // Recalculate total contacts

        const updatedList = await list.save();

        res.json({
          message: 'Contacts imported successfully',
          importedCount: newUniqueLeadIds.length,
          totalContactsInList: updatedList.totalContacts,
          errors: errors.length > 0 ? errors : undefined,
          list: updatedList,
        });

      } catch (error) {
        console.error('Error during CSV import:', error);
        res.status(500);
        throw new Error(`Failed to import contacts: ${error.message}`);
      }
    })
    .on('error', (error) => {
      res.status(500);
      throw new Error(`Error processing CSV file: ${error.message}`);
    });
});


module.exports = {
  getRecipientLists,
  getRecipientList,
  createRecipientList,
  updateRecipientList,
  deleteRecipientList,
  importContactsToList,
};