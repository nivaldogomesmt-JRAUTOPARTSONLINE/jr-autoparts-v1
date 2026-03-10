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

function normalizeText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
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

function normalizePlate(v) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function firstPhone(raw) {
  const parts = clean(raw)
    .split(/\n|,|;|\//)
    .map((p) => onlyDigits(p))
    .filter(Boolean);
  if (!parts.length) return null;

  let phone = parts[0];
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone;
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
  for (const key of Object.keys(row)) normalizedMap[normalizeKey(key)] = row[key];

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (Object.prototype.hasOwnProperty.call(normalizedMap, normalizedAlias)) {
      return normalizedMap[normalizedAlias];
    }
  }

  return '';
}

function parseActive(situacao) {
  const normalized = normalizeText(situacao);
  if (!normalized) return true;
  return !normalized.includes('INATIVO');
}

function safeEmail(value) {
  const v = clean(value).toLowerCase();
  if (!v || !v.includes('@')) return null;
  return v;
}

function readRowsFromBuffer(buffer, preferredSheetName) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const fallbackSheet = workbook.SheetNames[1] || workbook.SheetNames[0];
  const sheetName = preferredSheetName && workbook.SheetNames.includes(preferredSheetName)
    ? preferredSheetName
    : (workbook.SheetNames.includes('Sheet2') ? 'Sheet2' : fallbackSheet);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return { rows, sheetName };
}

function isUniqueViolation(error, fieldName) {
  if (!error || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(fieldName);
  return String(target || '').includes(fieldName);
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
    const { rows, sheetName } = readRowsFromBuffer(req.file.buffer, 'Clientes_Importar');

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
        errors.push({ line: lineNumber, error: `Cliente já existe (${existing.name}).` });
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
        errors.push({ line: lineNumber, error: err.message || 'Erro ao salvar cliente.' });
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
    return res.status(500).json({ error: 'Erro ao importar clientes.', details: err.message });
  }
}

async function importRastrek(req, res) {
  try {
    const clientsFile = req.files?.clients?.[0];
    const vehiclesFile = req.files?.vehicles?.[0];

    if (!clientsFile || !vehiclesFile) {
      return res.status(400).json({
        error: 'Envie os dois arquivos: clients (Relação de Clientes) e vehicles (Relação de Veículos).',
      });
    }

    const dryRun = isTruthy(req.query.dryRun) || isTruthy(req.body?.dryRun);

    const clientsSheet = readRowsFromBuffer(clientsFile.buffer, 'Sheet2');
    const vehiclesSheet = readRowsFromBuffer(vehiclesFile.buffer, 'Sheet2');

    const clientRows = clientsSheet.rows;
    const vehicleRows = vehiclesSheet.rows;

    if (!clientRows.length) {
      return res.status(400).json({ error: 'Planilha de clientes vazia.' });
    }
    if (!vehicleRows.length) {
      return res.status(400).json({ error: 'Planilha de veículos vazia.' });
    }

    const existingClients = await prisma.client.findMany({
      select: { id: true, name: true, email: true, phone: true, whatsapp: true, active: true },
    });
    const existingVehicles = await prisma.vehicle.findMany({
      select: { id: true, plate: true, clientId: true, brand: true, model: true },
    });
    const existingDevices = await prisma.trackingDevice.findMany({
      select: { id: true, imei: true, vehicleId: true, clientId: true },
    });

    const clientByEmail = new Map();
    const clientByName = new Map();
    for (const c of existingClients) {
      if (c.email) clientByEmail.set(c.email.toLowerCase(), c);
      clientByName.set(normalizeText(c.name), c);
    }

    const vehicleByPlate = new Map();
    for (const v of existingVehicles) vehicleByPlate.set(normalizePlate(v.plate), v);

    const deviceByImei = new Map();
    for (const d of existingDevices) deviceByImei.set(String(d.imei), d);

    const stats = {
      clientsCreated: 0,
      clientsUpdated: 0,
      vehiclesCreated: 0,
      vehiclesUpdated: 0,
      devicesCreated: 0,
      devicesUpdated: 0,
      skippedVehicles: 0,
    };

    const nameToClient = new Map();

    for (const row of clientRows) {
      const name = clean(row['Nome']);
      if (!name) continue;

      const email = safeEmail(row['E-mail']);
      const phone = firstPhone(row['Telefones']);
      const active = parseActive(row['Situação']);

      let match = null;
      if (email && clientByEmail.has(email)) match = clientByEmail.get(email);
      if (!match) match = clientByName.get(normalizeText(name));

      if (!dryRun && match) {
        const data = {};
        if (!match.email && email) data.email = email;
        if (!match.phone && phone) data.phone = phone;
        if (!match.whatsapp && phone) data.whatsapp = phone;
        if (match.active !== active) data.active = active;

        if (Object.keys(data).length) {
          const updated = await prisma.client.update({ where: { id: match.id }, data });
          match = { ...match, ...updated };
        }
      }

      if (match) {
        stats.clientsUpdated += 1;
        nameToClient.set(normalizeText(name), match);
        clientByName.set(normalizeText(name), match);
        if (email) clientByEmail.set(email, match);
        continue;
      }

      if (dryRun) {
        stats.clientsCreated += 1;
        nameToClient.set(normalizeText(name), { id: `dry-${normalizeText(name)}`, name });
        continue;
      }

      let created;
      try {
        created = await prisma.client.create({
          data: {
            name,
            email,
            phone,
            whatsapp: phone,
            active,
            type: 'PERSONAL',
          },
        });
        stats.clientsCreated += 1;
      } catch (error) {
        if (!isUniqueViolation(error, 'email') || !email) throw error;
        const existingByEmail = await prisma.client.findUnique({ where: { email } });
        if (!existingByEmail) throw error;
        created = existingByEmail;
        stats.clientsUpdated += 1;
      }

      nameToClient.set(normalizeText(name), created);
      clientByName.set(normalizeText(name), created);
      if (email) clientByEmail.set(email, created);
    }

    for (const row of vehicleRows) {
      const clientName = clean(row['Cliente']);
      const normalizedClientName = normalizeText(clientName);
      const plate = normalizePlate(row['Placa']);
      const imei = onlyDigits(row['IMEI']);
      const trackerModel = clean(row['Rastreador']);
      const chip = firstPhone(row['Chip']);

      if (!plate) {
        stats.skippedVehicles += 1;
        continue;
      }

      let client = nameToClient.get(normalizedClientName) || clientByName.get(normalizedClientName);
      if (!client) {
        if (dryRun) {
          stats.clientsCreated += 1;
          client = { id: `dry-${normalizedClientName}`, name: clientName || 'Cliente sem nome' };
        } else {
          client = await prisma.client.create({
            data: {
              name: clientName || `Cliente ${plate}`,
              type: 'PERSONAL',
              active: true,
            },
          });
          stats.clientsCreated += 1;
          clientByName.set(normalizedClientName, client);
        }
        nameToClient.set(normalizedClientName, client);
      }

      const currentVehicle = vehicleByPlate.get(plate);
      let vehicle;

      if (currentVehicle) {
        if (!dryRun) {
          vehicle = await prisma.vehicle.update({
            where: { id: currentVehicle.id },
            data: {
              clientId: client.id,
              active: true,
              brand: currentVehicle.brand || 'Nao informado',
              model: currentVehicle.model || 'Nao informado',
            },
          });
          vehicleByPlate.set(plate, vehicle);
        } else {
          vehicle = currentVehicle;
        }
        stats.vehiclesUpdated += 1;
      } else if (dryRun) {
        vehicle = { id: `dry-veh-${plate}`, plate, clientId: client.id };
        stats.vehiclesCreated += 1;
      } else {
        try {
          vehicle = await prisma.vehicle.create({
            data: {
              clientId: client.id,
              plate,
              brand: 'Nao informado',
              model: 'Nao informado',
              active: true,
            },
          });
          stats.vehiclesCreated += 1;
        } catch (error) {
          if (!isUniqueViolation(error, 'plate')) throw error;
          const existingByPlate = await prisma.vehicle.findFirst({ where: { plate } });
          if (!existingByPlate) throw error;
          vehicle = await prisma.vehicle.update({
            where: { id: existingByPlate.id },
            data: {
              clientId: client.id,
              active: true,
              brand: existingByPlate.brand || 'Nao informado',
              model: existingByPlate.model || 'Nao informado',
            },
          });
          stats.vehiclesUpdated += 1;
        }
        vehicleByPlate.set(plate, vehicle);
      }

      if (!imei) continue;

      const existingDevice = deviceByImei.get(imei);
      if (existingDevice) {
        if (!dryRun) {
          const updatedDevice = await prisma.trackingDevice.update({
            where: { id: existingDevice.id },
            data: {
              clientId: client.id,
              vehicleId: vehicle.id,
              model: trackerModel || 'Rastreador',
              chipNumber: chip,
              status: 'ACTIVE',
            },
          });
          deviceByImei.set(imei, updatedDevice);
        }
        stats.devicesUpdated += 1;
        continue;
      }

      if (dryRun) {
        stats.devicesCreated += 1;
        continue;
      }

      try {
        const createdDevice = await prisma.trackingDevice.create({
          data: {
            clientId: client.id,
            vehicleId: vehicle.id,
            model: trackerModel || 'Rastreador',
            imei,
            chipNumber: chip,
            status: 'ACTIVE',
            installedAt: new Date(),
          },
        });
        deviceByImei.set(imei, createdDevice);
        stats.devicesCreated += 1;
      } catch (error) {
        if (!isUniqueViolation(error, 'imei')) throw error;
        const existingByImei = await prisma.trackingDevice.findFirst({ where: { imei } });
        if (!existingByImei) throw error;

        const updatedByImei = await prisma.trackingDevice.update({
          where: { id: existingByImei.id },
          data: {
            clientId: client.id,
            vehicleId: vehicle.id,
            model: trackerModel || 'Rastreador',
            chipNumber: chip,
            status: 'ACTIVE',
          },
        });
        deviceByImei.set(imei, updatedByImei);
        stats.devicesUpdated += 1;
      }
    }

    return res.json({
      message: dryRun ? 'Simulação Rastrek concluída.' : 'Importação Rastrek concluída.',
      mode: dryRun ? 'DRY_RUN' : 'IMPORT',
      sheets: {
        clients: clientsSheet.sheetName,
        vehicles: vehiclesSheet.sheetName,
      },
      totalRows: {
        clients: clientRows.length,
        vehicles: vehicleRows.length,
      },
      summary: stats,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao importar arquivos da Rastrek.', details: err.message });
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
        city: 'Cuiaba',
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

module.exports = { importClients, importRastrek, downloadImportTemplate };
