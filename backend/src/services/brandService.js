// src/services/brandService.js
const fs = require('node:fs');
const path = require('node:path');

const BRAND_FILE = process.env.BRAND_FILE || '/app/data/brand.json';
fs.mkdirSync(path.dirname(BRAND_FILE), { recursive: true });

const DEFAULT = {
  name: 'JR Auto Parts',
  phone: '65 99281-2000',
  logoUrl: '',
  primaryColor: '#1e3a8a',
};

function read() {
  try {
    if (!fs.existsSync(BRAND_FILE)) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(BRAND_FILE, 'utf8')) };
  } catch { return { ...DEFAULT }; }
}

function write(data) {
  const merged = { ...read(), ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(BRAND_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { read, write };
