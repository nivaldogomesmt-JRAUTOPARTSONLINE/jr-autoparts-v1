const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeKey(key) {
  return clean(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function onlyDigits(v) {
  return clean(v).replace(/\D/g, '');
}

function normalizeCpfCnpj(v) {
  const digits = onlyDigits(v);
  return digits || '';
}

function normalizePhone(v) {
  const digits = onlyDigits(v);
  return digits || '';
}

function normalizeType(v) {
  const value = clean(v).toUpperCase();
  const normalized = normalizeKey(v);
  if (normalized.includes('juridica') || normalized === 'business') return 'BUSINESS';
  if (value === 'BUSINESS') return 'BUSINESS';
  return 'PERSONAL';
}

function normalizeBoolean(v) {
  const value = clean(v).toUpperCase();
  const normalized = normalizeKey(v);
  if (normalized === 'inativo') return false;
  if (normalized === 'ativo') return true;
  if (value === 'FALSE' || value === '0' || value === 'NAO' || value === 'NÃO') return false;
  return true;
}

function isTruthy(v) {
  const value = clean(v).toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(value);
}

function pickValue(row, aliases) {
  const normalizedMap = {};
  for (const key of Object.keys(row)) {
    normalizedMap[normalizeKey(key)] = row[key];
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (Object.prototype.hasOwnProperty.call(normalizedMap, normalizedAlias)) {
      return normalizedMap[normalizedAlias];
    }
  }

  return '';
}

async function findExistingClient({ cpfCnpj, email, phone, whatsapp }) {
  if (cpfCnpj) {
    const byCpf = await prisma.client.findUnique({ where: { cpfCnpj } });
    if (byCpf) return byCpf;
  }

  if (email) {
    const byEmail = await prisma.client.findUnique({ where: { email } });
    if (byEmail) return byEmail;
  }

  if (phone) {
    const byPhone = await prisma.client.findFirst({ where: { phone } });
    if (byPhone) return byPhone;
  }

  if (whatsapp) {
    const byWhatsapp = await prisma.client.findFirst({ where: { whatsapp } });
    if (byWhatsapp) return byWhatsapp;
  }

  return null;
}

async function importClients(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado.' });
    }

    const dryRun = isTruthy(req.query.dryRun) || isTruthy(req.body?.dryRun);

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.includes('Clientes_Importar')
      ? 'Clientes_Importar'
      : workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      return res.status(400).json({ error: 'A planilha está vazia.' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const lineNumber = i + 2;
      const row = rows[i];

      const name = clean(pickValue(row, ['name', 'Name', 'nome', 'Nome']));
      const cpfCnpj = normalizeCpfCnpj(pickValue(row, ['cpfCnpj', 'cpf_cnpj', 'cpfcnpj', 'CNPJ / CPF', 'CNPJ/CPF', 'CPF/CNPJ']));
      const phone = normalizePhone(pickValue(row, ['phone', 'telefone', 'fone', 'Fone']));
      const whatsapp = normalizePhone(pickValue(row, ['whatsapp', 'celular', 'cellphone', 'Celular']));
      const email = clean(pickValue(row, ['email', 'e-mail', 'E-mail'])).toLowerCase();
      const address = clean(pickValue(row, ['address', 'endereco', 'Endereço']));
      const city = clean(pickValue(row, ['city', 'cidade', 'Cidade']));
      const type = normalizeType(pickValue(row, ['type', 'tipo pessoa', 'Tipo pessoa']));
      const active = normalizeBoolean(pickValue(row, ['active', 'situacao', 'Situação']));

      if (!name) {
        skipped++;
        errors.push({ line: lineNumber, error: 'Nome vazio.' });
        continue;
      }

      const hasIdentifier = cpfCnpj || email || phone || whatsapp;
      if (!hasIdentifier) {
        skipped++;
        errors.push({
          line: lineNumber,
          error: 'Linha sem identificador. Informe ao menos cpfCnpj, email, phone ou whatsapp.',
        });
        continue;
      }

      const existing = await findExistingClient({ cpfCnpj, email, phone, whatsapp });
      if (existing) {
        skipped++;
        errors.push({
          line: lineNumber,
          error: `Cliente já existe (${existing.name}).`,
        });
        continue;
      }

      if (dryRun) {
        imported++;
        continue;
      }

      try {
        await prisma.client.create({
          data: {
            name,
            cpfCnpj: cpfCnpj || null,
            phone: phone || null,
            whatsapp: whatsapp || null,
            email: email || null,
            address: address || null,
            city: city || null,
            type,
            active,
          },
        });
        imported++;
      } catch (err) {
        skipped++;
        errors.push({
          line: lineNumber,
          error: err.message || 'Erro ao salvar cliente.',
        });
      }
    }

    return res.json({
      message: dryRun ? 'Simulação concluída.' : 'Importação concluída.',
      mode: dryRun ? 'DRY_RUN' : 'IMPORT',
      sheetName,
      totalRows: rows.length,
      imported,
      skipped,
      errors,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Erro ao importar clientes.',
      details: err.message,
    });
  }
}

function downloadImportTemplate(req, res) {
  try {
    const sampleRows = [
      {
        name: 'Cliente Exemplo',
        cpfCnpj: '000.000.000-00',
        phone: '65999990000',
        whatsapp: '65999990000',
        email: 'cliente@exemplo.com',
        address: 'Rua Exemplo, 123',
        city: 'Cuiabá',
        type: 'PERSONAL',
        active: true,
      },
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
      header: ['name', 'cpfCnpj', 'phone', 'whatsapp', 'email', 'address', 'city', 'type', 'active'],
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes_Importar');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_template_importacao.xlsx"');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar template de importação.' });
  }
}

module.exports = { importClients, downloadImportTemplate };
