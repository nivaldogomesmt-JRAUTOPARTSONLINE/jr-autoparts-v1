const prisma = require('../lib/prisma');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const { computeMaintenanceForecast, getVehicleMaintenanceSummary, toIntOrNull } = require('../utils/maintenance');
const { lookupVehicleByPlate } = require('../services/plateLookupService');
const { normalizeSearchToken, normalizedSqlExpr } = require('../utils/search');
const XLSX = require('xlsx');
const { appendIntegrationLog } = require('../services/integrationLogService');

const MAINTENANCE_DEFAULTS = [
  { type: 'oil', label: 'Troca de Oleo', intervalKm: 10000, intervalMonths: 6 },
  { type: 'belt', label: 'Correia Dentada', intervalKm: 60000, intervalMonths: 48 },
  { type: 'air_filter', label: 'Filtro de Ar', intervalKm: 15000, intervalMonths: 12 },
  { type: 'fuel_filter', label: 'Filtro de Combustivel', intervalKm: 15000, intervalMonths: 12 },
  { type: 'brake', label: 'Pastilhas de Freio', intervalKm: 30000, intervalMonths: null },
  { type: 'battery', label: 'Bateria', intervalKm: null, intervalMonths: 36 },
  { type: 'coolant', label: 'Fluido de Arrefecimento', intervalKm: null, intervalMonths: 24 },
  { type: 'brake_fluid', label: 'Fluido de Freio', intervalKm: null, intervalMonths: 24 },
  { type: 'tires', label: 'Pneus', intervalKm: 40000, intervalMonths: null },
];

function intOrNull(value) {
  return toIntOrNull(value);
}

function parseMaintenanceConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildVehicleSearchWhere(search) {
  const tokens = parseSearchTokens(search);
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => {
      const upperToken = String(token).toUpperCase();
      return {
        OR: [
          { plate: { contains: upperToken, mode: 'insensitive' } },
          { brand: { contains: token, mode: 'insensitive' } },
          { model: { contains: token, mode: 'insensitive' } },
          { color: { contains: token, mode: 'insensitive' } },
          { fuel: { contains: token, mode: 'insensitive' } },
          { client: { name: { contains: token, mode: 'insensitive' } } },
        ],
      };
    }),
  };
}

async function findVehicleIdsByAccentSearch(search) {
  const tokens = parseSearchTokens(search)
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  if (!tokens.length) return null;

  const fields = [
    normalizedSqlExpr('v.plate'),
    normalizedSqlExpr('v.brand'),
    normalizedSqlExpr('v.model'),
    normalizedSqlExpr('v.color'),
    normalizedSqlExpr('v.fuel'),
    normalizedSqlExpr('c.name'),
  ];

  const params = tokens.map((token) => `%${token}%`);
  const conditions = tokens
    .map((_, idx) => `(${fields.map((field) => `${field} LIKE $${idx + 1}`).join(' OR ')})`)
    .join(' AND ');

  const sql = `
    SELECT v.id
    FROM vehicles v
    LEFT JOIN clients c ON c.id = v.client_id
    WHERE v.active = true
      AND ${conditions}
    LIMIT 12000
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  const uploadMarker = '/upload/';
  const markerIndex = url.indexOf(uploadMarker);
  if (markerIndex === -1) return null;

  const pathAfterUpload = url.slice(markerIndex + uploadMarker.length);
  const parts = pathAfterUpload.split('/');
  if (parts[0] && /^v\d+$/.test(parts[0])) parts.shift();

  const joined = parts.join('/');
  const dotIndex = joined.lastIndexOf('.');
  return dotIndex > -1 ? joined.slice(0, dotIndex) : joined;
}

function buildMaintenanceDefaults(config = {}) {
  const oilKm = intOrNull(config.oilIntervalKm);
  const oilMonths = intOrNull(config.oilIntervalMonths);
  const beltKm = intOrNull(config.beltIntervalKm);
  const beltMonths = intOrNull(config.beltIntervalMonths);

  return MAINTENANCE_DEFAULTS.map((m) => {
    if (m.type === 'oil') {
      return {
        ...m,
        intervalKm: oilKm ?? m.intervalKm,
        intervalMonths: oilMonths ?? m.intervalMonths,
      };
    }
    if (m.type === 'belt') {
      return {
        ...m,
        intervalKm: beltKm ?? m.intervalKm,
        intervalMonths: beltMonths ?? m.intervalMonths,
      };
    }
    return m;
  });
}

async function applyMaintenanceConfig(tx, vehicleId, config = {}, currentKm = null) {
  const oilKm = intOrNull(config.oilIntervalKm);
  const oilMonths = intOrNull(config.oilIntervalMonths);
  const beltKm = intOrNull(config.beltIntervalKm);
  const beltMonths = intOrNull(config.beltIntervalMonths);

  const updates = [];

  if (oilKm !== null || oilMonths !== null) {
    updates.push(
      tx.preventiveMaintenance.findFirst({ where: { vehicleId, type: 'oil' } }).then(async (row) => {
        if (!row) return;

        const forecast = computeMaintenanceForecast(
          {
            ...row,
            intervalKm: oilKm !== null ? oilKm : row.intervalKm,
            intervalMonths: oilMonths !== null ? oilMonths : row.intervalMonths,
          },
          { baselineDate: row.createdAt, baselineKm: currentKm }
        );

        await tx.preventiveMaintenance.update({
          where: { id: row.id },
          data: {
            intervalKm: oilKm !== null ? oilKm : row.intervalKm,
            intervalMonths: oilMonths !== null ? oilMonths : row.intervalMonths,
            nextKm: forecast.nextKm,
            nextDate: forecast.nextDate,
          },
        });
      })
    );
  }

  if (beltKm !== null || beltMonths !== null) {
    updates.push(
      tx.preventiveMaintenance.findFirst({ where: { vehicleId, type: 'belt' } }).then(async (row) => {
        if (!row) return;

        const forecast = computeMaintenanceForecast(
          {
            ...row,
            intervalKm: beltKm !== null ? beltKm : row.intervalKm,
            intervalMonths: beltMonths !== null ? beltMonths : row.intervalMonths,
          },
          { baselineDate: row.createdAt, baselineKm: currentKm }
        );

        await tx.preventiveMaintenance.update({
          where: { id: row.id },
          data: {
            intervalKm: beltKm !== null ? beltKm : row.intervalKm,
            intervalMonths: beltMonths !== null ? beltMonths : row.intervalMonths,
            nextKm: forecast.nextKm,
            nextDate: forecast.nextDate,
          },
        });
      })
    );
  }

  await Promise.all(updates);
}

async function safeLogIntegration(entry, actor = 'Sistema') {
  try {
    await appendIntegrationLog(entry, actor);
  } catch {
    // nao bloqueia o fluxo principal
  }
}

const list = async (req, res) => {
  try {
    const { search, clientId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const accentIds = await findVehicleIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      return res.json({ data: [], total: 0, page: parseInt(page, 10), pages: 0 });
    }

    const where = {
      active: true,
      ...(clientId && { clientId }),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildVehicleSearchWhere(search)),
    };

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, phone: true } },
          _count: { select: { serviceOrders: true } },
          maintenances: {
            select: {
              intervalKm: true,
              intervalMonths: true,
              lastDate: true,
              lastKm: true,
              nextDate: true,
              nextKm: true,
              createdAt: true,
            },
          },
        },
        orderBy: { plate: 'asc' },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.vehicle.count({ where }),
    ]);

    const data = vehicles.map((vehicle) => {
      const summary = getVehicleMaintenanceSummary(vehicle.maintenances, vehicle.currentKm, {
        baselineDate: vehicle.createdAt,
        baselineKm: vehicle.currentKm,
      });

      const { maintenances, ...rest } = vehicle;

      return {
        ...rest,
        maintenanceStatus: summary.status,
        maintenanceOverdue: summary.overdueCount,
        maintenanceDueSoon: summary.dueSoonCount,
      };
    });

    res.json({ data, total, page: parseInt(page, 10), pages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar veiculos.' });
  }
};

const exportVehicles = async (req, res) => {
  try {
    const { search, clientId, includeInactive } = req.query;
    const includeAll = String(includeInactive || '').toLowerCase() === 'true';

    const accentIds = await findVehicleIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([], {
        header: ['plate', 'brand', 'model', 'year', 'color', 'fuel', 'currentKm', 'clientName', 'clientPhone', 'maintenanceStatus', 'maintenanceOverdue', 'maintenanceDueSoon', 'active'],
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Veiculos');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const now = new Date().toISOString().slice(0, 10);
      const filename = `veiculos_export_${now}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    const where = {
      ...(includeAll ? {} : { active: true }),
      ...(clientId && { clientId }),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildVehicleSearchWhere(search)),
    };

    const vehicles = await prisma.vehicle.findMany({
      where,
      include: {
        client: { select: { name: true, phone: true, whatsapp: true } },
        maintenances: {
          select: {
            intervalKm: true,
            intervalMonths: true,
            lastDate: true,
            lastKm: true,
            nextDate: true,
            nextKm: true,
            createdAt: true,
          },
        },
      },
      orderBy: { plate: 'asc' },
    });

    const rows = vehicles.map((vehicle) => {
      const summary = getVehicleMaintenanceSummary(vehicle.maintenances, vehicle.currentKm, {
        baselineDate: vehicle.createdAt,
        baselineKm: vehicle.currentKm,
      });

      return {
        plate: vehicle.plate || '',
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        year: vehicle.year || '',
        color: vehicle.color || '',
        fuel: vehicle.fuel || '',
        currentKm: Number(vehicle.currentKm || 0),
        clientName: vehicle.client?.name || '',
        clientPhone: vehicle.client?.whatsapp || vehicle.client?.phone || '',
        maintenanceStatus: summary.status || '-',
        maintenanceOverdue: Number(summary.overdueCount || 0),
        maintenanceDueSoon: Number(summary.dueSoonCount || 0),
        active: vehicle.active !== false,
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['plate', 'brand', 'model', 'year', 'color', 'fuel', 'currentKm', 'clientName', 'clientPhone', 'maintenanceStatus', 'maintenanceOverdue', 'maintenanceDueSoon', 'active'],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Veiculos');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date().toISOString().slice(0, 10);
    const filename = `veiculos_export_${now}.xlsx`;

    await safeLogIntegration({
      area: 'Exportacao Veiculos',
      user: req.user?.name || 'Operacao Manual',
      quantity: rows.length,
      failures: 0,
      reason: '-',
      meta: {
        search: search || '',
        clientId: clientId || '',
        includeInactive: includeAll,
        filename,
      },
    }, req.user?.name || req.user?.email || 'Sistema');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    await safeLogIntegration({
      area: 'Exportacao Veiculos',
      user: req.user?.name || 'Operacao Manual',
      quantity: 0,
      failures: 1,
      reason: err?.message || 'Falha ao exportar veiculos.',
    }, req.user?.name || req.user?.email || 'Sistema');
    return res.status(500).json({ error: 'Erro ao exportar veiculos.' });
  }
};
const get = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        maintenances: { orderBy: { type: 'asc' } },
        serviceOrders: {
          where: { status: { not: 'QUOTE' } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            items: true,
            statusLogs: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar veiculo.' });
  }
};

const create = async (req, res) => {
  try {
    const { clientId, plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    const maintenanceConfig = parseMaintenanceConfig(req.body.maintenanceConfig);

    if (!clientId || !plate || !brand || !model) {
      return res.status(400).json({ error: 'Cliente, placa, marca e modelo sao obrigatorios.' });
    }

    const parsedCurrentKm = intOrNull(currentKm);
    const parsedYear = intOrNull(year);

    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          clientId,
          plate: plate.toUpperCase().trim(),
          brand,
          model,
          year: parsedYear,
          color,
          fuel,
          currentKm: parsedCurrentKm,
          notes,
        },
      });

      const defaults = buildMaintenanceDefaults(maintenanceConfig || {});
      const baselineDate = new Date();

      await tx.preventiveMaintenance.createMany({
        data: defaults.map((m) => {
          const forecast = computeMaintenanceForecast(m, {
            baselineDate,
            baselineKm: parsedCurrentKm,
          });

          return {
            vehicleId: created.id,
            ...m,
            nextDate: forecast.nextDate,
            nextKm: forecast.nextKm,
          };
        }),
        skipDuplicates: true,
      });

      return created;
    });

    res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Placa ja cadastrada.' });
    res.status(500).json({ error: 'Erro ao cadastrar veiculo.' });
  }
};

const update = async (req, res) => {
  try {
    const { plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    const maintenanceConfig = parseMaintenanceConfig(req.body.maintenanceConfig);

    const hasCurrentKm = currentKm !== undefined;
    const parsedCurrentKm = hasCurrentKm ? intOrNull(currentKm) : undefined;

    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: req.params.id },
        data: {
          plate: plate?.toUpperCase().trim(),
          brand,
          model,
          year: year !== undefined ? intOrNull(year) : undefined,
          color,
          fuel,
          currentKm: hasCurrentKm ? parsedCurrentKm : undefined,
          notes,
        },
      });

      if (maintenanceConfig && Object.keys(maintenanceConfig).length) {
        await applyMaintenanceConfig(tx, req.params.id, maintenanceConfig, updated.currentKm);
      }

      return updated;
    });

    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar veiculo.' });
  }
};

const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem do veiculo.' });

    const current = await prisma.vehicle.findUnique({ where: { id: req.params.id }, select: { id: true, photoUrl: true } });
    if (!current) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const photoUrl = await uploadToCloudinary(req.file, 'jr-autoparts/vehicles');

    if (current.photoUrl) {
      const publicId = extractCloudinaryPublicId(current.photoUrl);
      if (publicId) await deleteFromCloudinary(publicId).catch(() => {});
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { photoUrl },
      select: { id: true, photoUrl: true },
    });

    return res.json(vehicle);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enviar foto do veiculo.' });
  }
};

const remove = async (req, res) => {
  try {
    const hardDelete = String(req.query.hard || '').toLowerCase() === 'true';

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            serviceOrders: true,
            trackingContracts: true,
          },
        },
      },
    });

    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    if (!hardDelete) {
      await prisma.vehicle.update({ where: { id: req.params.id }, data: { active: false } });
      return res.json({ message: 'Veiculo desativado.' });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Exclusao definitiva permitida apenas para ADMIN.' });
    }

    if (vehicle._count.serviceOrders > 0 || vehicle._count.trackingContracts > 0) {
      return res.status(409).json({
        error: 'Veiculo possui vinculos (OS/contratos). Remova os vinculos antes da exclusao definitiva.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.preventiveMaintenance.deleteMany({ where: { vehicleId: vehicle.id } });
      await tx.trackingDevice.updateMany({ where: { vehicleId: vehicle.id }, data: { vehicleId: null } });
      await tx.vehicle.delete({ where: { id: vehicle.id } });
    });

    return res.json({ message: 'Veiculo excluido definitivamente.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir veiculo.' });
  }
};

const history = async (req, res) => {
  try {
    const orders = await prisma.serviceOrder.findMany({
      where: { vehicleId: req.params.id, status: { in: ['DONE', 'DELIVERED'] } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar historico.' });
  }
};

function isPlaceholderValue(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return ['-', 'nao informado', 'nao informada', 'n/a', 'na', 'null', 'indefinido', 'desconhecido'].includes(normalized);
}

function hasMeaningfulValue(value) {
  return !isPlaceholderValue(value);
}

function buildVehicleEnrichmentData(current, lookup, overwrite = false) {
  const data = {};

  const applyField = (field, value) => {
    if (isPlaceholderValue(value)) return;
    if (!overwrite && hasMeaningfulValue(current[field])) return;

    if (field === 'year') {
      const n = Number.parseInt(String(value).replace(/\D/g, ''), 10);
      if (!Number.isFinite(n)) return;
      if (current.year === n) return;
      data.year = n;
      return;
    }

    const text = String(value).trim();
    if (String(current[field] || '').trim() === text) return;
    data[field] = text;
  };

  applyField('brand', lookup.brand);
  applyField('model', lookup.model);
  applyField('year', lookup.year);
  applyField('color', lookup.color);
  applyField('fuel', lookup.fuel);
  return data;
}
function allVehicleFieldsFilled(vehicle) {
  return hasMeaningfulValue(vehicle.brand)
    && hasMeaningfulValue(vehicle.model)
    && Number.isFinite(vehicle.year)
    && hasMeaningfulValue(vehicle.color)
    && hasMeaningfulValue(vehicle.fuel);
}
function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y', 's'].includes(normalized);
}
function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
const lookupByPlate = async (req, res) => {
  try {
    const plate = req.params.plate || req.query.plate;
    if (!plate) return res.status(400).json({ error: 'Informe a placa para consulta.' });

    const lookup = await lookupVehicleByPlate(plate, { provider: req.query.provider });
    return res.json(lookup);
  } catch (err) {
    const message = err?.message || 'Falha ao consultar dados da placa.';
    const status = /nao configurado|invalida|suportado/i.test(message) ? 400 : 502;
    return res.status(status).json({ error: message });
  }
};

const enrichByPlate = async (req, res) => {
  try {
    const overwrite = req.body?.overwrite === true || String(req.body?.overwrite || '').toLowerCase() === 'true';
    const provider = req.body?.provider || req.query?.provider;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        color: true,
        fuel: true,
      },
    });

    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const lookup = await lookupVehicleByPlate(vehicle.plate, { provider });
    const data = buildVehicleEnrichmentData(vehicle, lookup, overwrite);

    if (!Object.keys(data).length) {
      return res.json({
        updated: false,
        reason: 'Nenhum campo elegivel para atualizar.',
        source: lookup.source,
        vehicle,
      });
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data,
    });

    return res.json({
      updated: true,
      source: lookup.source,
      fields: Object.keys(data),
      vehicle: updated,
    });
  } catch (err) {
    const message = err?.message || 'Falha ao enriquecer veiculo por placa.';
    const status = /nao configurado|invalida|suportado/i.test(message) ? 400 : 502;
    return res.status(status).json({ error: message });
  }
};

const enrichBatchByPlate = async (req, res) => {
  try {
    const apply = toBool(req.body?.apply ?? req.query?.apply, false);
    const overwrite = toBool(req.body?.overwrite ?? req.query?.overwrite, false);
    const includeInactive = toBool(req.body?.includeInactive ?? req.query?.includeInactive, false);
    const provider = req.body?.provider || req.query?.provider;
    const limit = clampInt(req.body?.limit ?? req.query?.limit, 40, 1, 200);
    const vehicles = await prisma.vehicle.findMany({
      where: includeInactive ? {} : { active: true },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        color: true,
        fuel: true,
        active: true,
      },
      orderBy: { plate: 'asc' },
      take: limit,
    });
    const summary = {
      scanned: vehicles.length,
      candidates: 0,
      updated: 0,
      previewUpdates: 0,
      skippedComplete: 0,
      skippedNoData: 0,
      errors: 0,
      mode: apply ? 'APPLY' : 'DRY_RUN',
    };
    const rows = [];
    for (const vehicle of vehicles) {
      if (!overwrite && allVehicleFieldsFilled(vehicle)) {
        summary.skippedComplete += 1;
        rows.push({
          id: vehicle.id,
          plate: vehicle.plate,
          status: 'SKIPPED_COMPLETE',
          reason: 'Veiculo ja possui dados completos.',
        });
        continue;
      }
      summary.candidates += 1;
      try {
        const lookup = await lookupVehicleByPlate(vehicle.plate, { provider });
        const data = buildVehicleEnrichmentData(vehicle, lookup, overwrite);
        if (!Object.keys(data).length) {
          summary.skippedNoData += 1;
          rows.push({
            id: vehicle.id,
            plate: vehicle.plate,
            status: 'NO_DATA',
            source: lookup.source,
            reason: 'Consulta sem novos campos para atualizar.',
          });
          continue;
        }
        if (apply) {
          await prisma.vehicle.update({ where: { id: vehicle.id }, data });
          summary.updated += 1;
          rows.push({
            id: vehicle.id,
            plate: vehicle.plate,
            status: 'UPDATED',
            source: lookup.source,
            fields: Object.keys(data),
          });
        } else {
          summary.previewUpdates += 1;
          rows.push({
            id: vehicle.id,
            plate: vehicle.plate,
            status: 'PREVIEW',
            source: lookup.source,
            fields: Object.keys(data),
            preview: data,
          });
        }
      } catch (err) {
        summary.errors += 1;
        rows.push({
          id: vehicle.id,
          plate: vehicle.plate,
          status: 'ERROR',
          reason: err?.message || 'Erro ao consultar a placa.',
        });
      }
    }
    return res.json({
      summary,
      rows,
      settings: {
        limit,
        overwrite,
        includeInactive,
        provider: provider || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao executar enriquecimento em lote por placa.' });
  }
};

module.exports = { list, exportVehicles, get, create, update, uploadPhoto, remove, history, lookupByPlate, enrichByPlate, enrichBatchByPlate };









