const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../src/lib/prisma');

function parseArgs(argv) {
  const args = { files: [], dir: null, glob: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file' && argv[i + 1]) { args.files.push(argv[i + 1]); i += 1; continue; }
    if (token === '--files' && argv[i + 1]) { args.files.push(...argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean)); i += 1; continue; }
    if (token === '--dir' && argv[i + 1]) { args.dir = argv[i + 1]; i += 1; continue; }
    if (token === '--glob' && argv[i + 1]) { args.glob = argv[i + 1]; i += 1; continue; }
    if (token === '--apply') args.apply = true;
  }
  return args;
}

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function normKey(v) { return norm(v).toUpperCase(); }

function parseMoneyBR(v) {
  if (v === null || v === undefined || v === '') return 0;
  const str = String(v).trim();
  const normalized = str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseStock(v) { return Math.round(parseMoneyBR(v)); }

function normalizeCategoryName(value) {
  const raw = norm(value);
  if (!raw) return '';
  const key = normKey(raw);

  const map = {
    FILTROS: 'Filtros',
    ELETRICA: 'Eletrica',
    FREIOS: 'Freios',
    SUSPENSAO: 'Suspensao',
    'LATARIA E ACESSORIOS': 'Lataria e Acessorios',
    'MOTOR E CORREIAS': 'Motor e Correias',
    BATERIAS: 'Baterias',
    LUBRIFICANTES: 'Lubrificantes',
    'SERVICOS INTERNOS': 'Servicos Internos',
    OUTROS: 'Outros',
  };

  return map[key] || raw;
}

function inferCategory(name, originalCategory) {
  const cat = normalizeCategoryName(originalCategory);
  if (cat) return cat;
  const n = normKey(name);
  if (n.includes('FILTRO')) return 'Filtros';
  if (n.includes('OLEO') || n.includes('LUBRIFIC')) return 'Lubrificantes';
  if (n.includes('BATERIA')) return 'Baterias';
  if (n.includes('FREIO') || n.includes('PASTILHA') || n.includes('DISCO')) return 'Freios';
  if (n.includes('AMORTECEDOR') || n.includes('SUSPENSAO') || n.includes('COXIM')) return 'Suspensao';
  if (n.includes('FAROL') || n.includes('LANTERNA') || n.includes('RELE')) return 'Eletrica';
  if (n.includes('CORREIA') || n.includes('TENSOR')) return 'Motor e Correias';
  if (n.includes('PARACHOQUE') || n.includes('RETROVISOR') || n.includes('CAPA')) return 'Lataria e Acessorios';
  if (n.includes('MAO DE OBRA') || n.includes('REMOCAO VEICULAR')) return 'Servicos Internos';
  return 'Outros';
}

function buildImportRecord(cells, sourceFile) {
  // Colunas fixas do CSV Tiny ERP
  const sku = norm(cells[1]);
  const name = norm(cells[2]);
  const unit = norm(cells[3] || 'un').toLowerCase() || 'un';
  const ncm = norm(cells[4]);
  const price = parseMoneyBR(cells[6]);
  const active = normKey(cells[9]) === 'ATIVO';
  const stock = parseStock(cells[10]);
  const cost = parseMoneyBR(cells[11]);
  const supplier = norm(cells[13]);
  const ean = norm(cells[19]);
  const location = String(cells[21] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const photoUrl = norm(cells[30] || cells[43] || '');
  const category = inferCategory(name, cells[36]);

  const metaParts = [];
  if (sku) metaParts.push(`SKU: ${sku}`);
  if (supplier) metaParts.push(`Fornecedor: ${supplier}`);
  if (ncm) metaParts.push(`NCM: ${ncm}`);
  if (ean) metaParts.push(`EAN: ${ean}`);
  if (location) metaParts.push(`Localizacao: ${location}`);
  if (cost > 0) metaParts.push(`Custo ref.: R$ ${cost.toFixed(2).replace('.', ',')}`);
  metaParts.push(`Origem arquivo: ${path.basename(sourceFile)}`);

  return {
    sku,
    name,
    unit,
    price,
    stock,
    active,
    category,
    photoUrl,
    description: metaParts.join(' | '),
  };
}

function readCsvRows(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: false, cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '' });
  return matrix.slice(1).filter((row) => Array.isArray(row) && row.some((v) => norm(v)));
}

function resolveFiles({ files, dir, glob }) {
  const absolute = files.map((f) => path.resolve(f));
  if (absolute.length) return absolute;

  const baseDir = dir ? path.resolve(dir) : process.cwd();
  const mask = glob || 'produtos_*.csv';
  const regex = new RegExp(`^${mask.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i');

  return fs.readdirSync(baseDir)
    .filter((n) => regex.test(n))
    .map((n) => path.join(baseDir, n))
    .sort((a, b) => a.localeCompare(b));
}

async function applyToDatabase(records) {
  const existing = await prisma.product.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((p) => [normKey(p.name), p.id]));
  const result = { created: 0, updated: 0, skipped: 0 };

  for (const rec of records) {
    if (!rec.name) { result.skipped += 1; continue; }

    const payload = {
      name: rec.name,
      description: rec.description || null,
      category: rec.category || null,
      price: rec.price || 0,
      unit: rec.unit || 'un',
      stock: Number.isFinite(rec.stock) ? rec.stock : 0,
      active: rec.active,
      photoUrl: rec.photoUrl || null,
    };

    const key = normKey(rec.name);
    const existingId = byName.get(key);
    if (existingId) {
      await prisma.product.update({ where: { id: existingId }, data: payload });
      result.updated += 1;
      continue;
    }

    const created = await prisma.product.create({ data: payload });
    byName.set(key, created.id);
    result.created += 1;
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = resolveFiles(args);
  if (!files.length) throw new Error('Nenhum CSV encontrado. Use --files, --file, --dir ou --glob.');

  const allRows = [];
  files.forEach((file) => {
    if (!fs.existsSync(file)) throw new Error(`Arquivo nao encontrado: ${file}`);
    readCsvRows(file).forEach((row) => allRows.push({ row, file }));
  });

  const dedupe = new Map();
  const stats = { files: files.length, rowsRead: allRows.length, rowsValid: 0, noName: 0, noSku: 0, noPrice: 0, duplicates: 0, categories: new Map() };

  for (const item of allRows) {
    const rec = buildImportRecord(item.row, item.file);
    if (!rec.name) { stats.noName += 1; continue; }
    if (!rec.sku) stats.noSku += 1;
    if (!rec.price || rec.price <= 0) stats.noPrice += 1;

    const key = rec.sku ? `SKU:${normKey(rec.sku)}` : `NAME:${normKey(rec.name)}`;
    if (dedupe.has(key)) stats.duplicates += 1;
    dedupe.set(key, rec);
  }

  const records = Array.from(dedupe.values());
  records.forEach((r) => {
    stats.rowsValid += 1;
    const cat = r.category || 'Outros';
    stats.categories.set(cat, (stats.categories.get(cat) || 0) + 1);
  });

  console.log('=== ANALISE CSV PRODUTOS ===');
  console.log(`Arquivos: ${stats.files}`);
  console.log(`Linhas lidas: ${stats.rowsRead}`);
  console.log(`Linhas validas: ${stats.rowsValid}`);
  console.log(`Sem nome: ${stats.noName}`);
  console.log(`Sem SKU: ${stats.noSku}`);
  console.log(`Sem preco (<=0): ${stats.noPrice}`);
  console.log(`Duplicadas (SKU/nome): ${stats.duplicates}`);
  console.log('Categorias (top 15):');
  Array.from(stats.categories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([cat, count]) => console.log(` - ${cat}: ${count}`));

  if (!args.apply) {
    console.log('\nDry-run finalizado. Use --apply para importar no banco.');
    return;
  }

  console.log('\nAplicando no banco...');
  const db = await applyToDatabase(records);
  console.log(`Criados: ${db.created}`);
  console.log(`Atualizados: ${db.updated}`);
  console.log(`Ignorados: ${db.skipped}`);
}

main()
  .catch((err) => {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
