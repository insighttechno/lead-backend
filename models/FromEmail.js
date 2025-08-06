const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/encryptDecrypt");

const FromEmailSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    emailAddress: {
      type: String,
      required: [true, "Please add an email address"],
      unique: true, // Unique per company
      lowercase: true,
    },
    label: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Verified", "Unverified", "Active", "Inactive"],
      default: "Unverified",
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure email address is unique per company
FromEmailSchema.index({ companyId: 1, emailAddress: 1 }, { unique: true });

module.exports = mongoose.model("FromEmail", FromEmailSchema);
