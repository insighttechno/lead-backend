// utils/encryptDecrypt.js
const crypto = require('crypto');
const algorithm = 'aes-256-cbc'; // 256-bit key (32 bytes), 128-bit IV (16 bytes)

// Ensure your ENCRYPTION_KEY is a sufficiently long random string in .env
// e.g., generated with `node -e "console.log(crypto.randomBytes(64).toString('hex'))"`
const rawEncryptionKey = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // Bytes for AES-CBC IV

// Derive a 32-byte key from your rawEncryptionKey
// This ensures the key is always the correct length for aes-256-cbc
const key = crypto.createHash('sha256').update(String(rawEncryptionKey)).digest(); // This produces a 32-byte buffer

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH); // Generate a random IV for each encryption
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(String(text)); // Ensure text is string
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return text;
  const textParts = text.split(':');
  if (textParts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(textParts[0], 'hex');
  const encryptedText = Buffer.from(textParts[1], 'hex');
  
  if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length'); // Added check
  }

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };