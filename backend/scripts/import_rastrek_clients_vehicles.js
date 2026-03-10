const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../src/lib/prisma');

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function firstPhone(raw) {
  const parts = String(raw || '')
    .split(/\n|,|;|\//)
    .map((p) => digits(p))
    .filter(Boolean);
  if (!parts.length) return null;
  let p = parts[0];
  if (p.length === 10 || p.length === 11) p = `55${p}`;
  return p;
}

function parseActive(situacao) {
  const normalized = normalizeText(situacao);
  if (!normalized) return true;
  return !normalized.includes('INATIVO');
}

function safeEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || !v.includes('@')) return null;
  return v;
}

function readSheetRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const chosen = sheetName && wb.SheetNames.includes(sheetName)
    ? sheetName
    : wb.SheetNames.includes('Sheet2')
      ? 'Sheet2'
      : wb.SheetNames[1] || wb.SheetNames[0];
  const ws = wb.Sheets[chosen];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function findFileInDownloads(kindLabel) {
  const downloadsDir = path.join(process.env.USERPROFILE || 'C:/Users/nival', 'Downloads');
  const files = fs.readdirSync(downloadsDir).filter((f) => /\.xls(x)?$/i.test(f));
  const normalizedFiles = files.map((f) => ({ raw: f, n: normalizeText(f) }));

  const wanted =
    kindLabel === 'clients'
      ? ['RELACAO DE CLIENTES', '05-03-2026']
      : ['RELACAO DE VEICULOS', '05-03-2026'];

  const hit = normalizedFiles.find((f) => wanted.every((w) => f.n.includes(normalizeText(w))));
  if (!hit) {
    throw new Error(`Could not auto-find ${kindLabel} file in Downloads.`);
  }

  return path.join(downloadsDir, hit.raw);
}

async function main() {
  const clientsFile = arg('--clients', findFileInDownloads('clients'));
  const vehiclesFile = arg('--vehicles', findFileInDownloads('vehicles'));
  const apply = hasFlag('--apply');

  console.log(`Clients file: ${clientsFile}`);
  console.log(`Vehicles file: ${vehiclesFile}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const clientRows = readSheetRows(clientsFile, 'Sheet2');
  const vehicleRows = readSheetRows(vehiclesFile, 'Sheet2');

  console.log(`Rows loaded -> clients: ${clientRows.length}, vehicles: ${vehicleRows.length}`);

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
    const name = String(row['Nome'] || '').trim();
    if (!name) continue;

    const email = safeEmail(row['E-mail']);
    const phone = firstPhone(row['Telefones']);
    const active = parseActive(row['Situação']);

    let match = null;
    if (email && clientByEmail.has(email)) match = clientByEmail.get(email);
    if (!match) match = clientByName.get(normalizeText(name));

    if (!apply) {
      if (match) stats.clientsUpdated += 1;
      else stats.clientsCreated += 1;
      nameToClient.set(normalizeText(name), { id: match?.id || `dry-${normalizeText(name)}`, name });
      continue;
    }

    if (match) {
      const data = {};
      if (!match.email && email) data.email = email;
      if (!match.phone && phone) data.phone = phone;
      if (!match.whatsapp && phone) data.whatsapp = phone;
      if (match.active !== active) data.active = active;

      if (Object.keys(data).length) {
        const updated = await prisma.client.update({ where: { id: match.id }, data });
        match = { ...match, ...updated };
      }

      stats.clientsUpdated += 1;
      nameToClient.set(normalizeText(name), match);
      clientByName.set(normalizeText(name), match);
      if (email) clientByEmail.set(email, match);
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
    } catch (error) {
      const duplicateEmail = error?.code === 'P2002' && String(error?.meta?.target || '').includes('email');
      if (!duplicateEmail || !email) throw error;

      const existingByEmail = await prisma.client.findFirst({
        where: { email },
        select: { id: true, name: true, email: true, phone: true, whatsapp: true, active: true },
      });
      if (!existingByEmail) throw error;
      created = existingByEmail;
    }

    stats.clientsCreated += 1;
    nameToClient.set(normalizeText(name), created);
    clientByName.set(normalizeText(name), created);
    if (email) clientByEmail.set(email, created);
  }

  for (const row of vehicleRows) {
    const clientName = String(row['Cliente'] || '').trim();
    const normalizedClientName = normalizeText(clientName);
    const plate = normalizePlate(row['Placa']);
    const imei = digits(row['IMEI']);
    const trackerModel = String(row['Rastreador'] || '').trim();
    const chip = firstPhone(row['Chip']);

    if (!plate) {
      stats.skippedVehicles += 1;
      continue;
    }

    let client = nameToClient.get(normalizedClientName) || clientByName.get(normalizedClientName);
    if (!client) {
      if (!apply) {
        stats.clientsCreated += 1;
        client = { id: `dry-${normalizedClientName}`, name: clientName || 'Cliente sem nome' };
        nameToClient.set(normalizedClientName, client);
      } else {
        client = await prisma.client.create({
          data: {
            name: clientName || `Cliente ${plate}`,
            type: 'PERSONAL',
            active: true,
          },
        });
        stats.clientsCreated += 1;
        nameToClient.set(normalizedClientName, client);
        clientByName.set(normalizedClientName, client);
      }
    }

    const currentVehicle = vehicleByPlate.get(plate);

    let vehicle;
    if (!apply) {
      if (currentVehicle) stats.vehiclesUpdated += 1;
      else stats.vehiclesCreated += 1;
      vehicle = currentVehicle || { id: `dry-veh-${plate}`, plate, clientId: client.id };
    } else if (currentVehicle) {
      vehicle = await prisma.vehicle.update({
        where: { id: currentVehicle.id },
        data: {
          clientId: client.id,
          active: true,
          brand: currentVehicle.brand || 'Nao informado',
          model: currentVehicle.model || 'Nao informado',
        },
      });
      stats.vehiclesUpdated += 1;
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
        const duplicatePlate = error?.code === 'P2002' && String(error?.meta?.target || '').includes('plate');
        if (!duplicatePlate) throw error;

        const existingByPlate = await prisma.vehicle.findFirst({
          where: { plate },
          select: { id: true, plate: true, clientId: true, brand: true, model: true },
        });
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
    }

    if (apply) vehicleByPlate.set(plate, vehicle);

    if (imei) {
      const existingDevice = deviceByImei.get(imei);
      if (!apply) {
        if (existingDevice) stats.devicesUpdated += 1;
        else stats.devicesCreated += 1;
      } else if (existingDevice) {
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
        stats.devicesUpdated += 1;
      } else {
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
          const duplicateImei = error?.code === 'P2002' && String(error?.meta?.target || '').includes('imei');
          if (!duplicateImei) throw error;

          const existingByImei = await prisma.trackingDevice.findFirst({
            where: { imei },
            select: { id: true, imei: true, vehicleId: true, clientId: true },
          });
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
    }
  }

  console.log('\nImport summary:');
  console.log(JSON.stringify(stats, null, 2));
  console.log(apply ? 'Apply done.' : 'Dry-run done. Use --apply to persist.');
}

main()
  .catch((err) => {
    console.error('Import failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


