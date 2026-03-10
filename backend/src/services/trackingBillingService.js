const prisma = require('../lib/prisma');
const { sendWhatsAppMessage } = require('./whatsappService');

function pad2(v) {
  return String(v).padStart(2, '0');
}

function getReferenceMonth(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function buildDueDate(year, month, dueDay) {
  const day = Math.max(1, Math.min(28, Number(dueDay) || 10));
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function generateInvoicesForReference(referenceMonth) {
  const [yearStr, monthStr] = String(referenceMonth).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error('Competencia invalida. Use YYYY-MM.');
  }

  const contracts = await prisma.trackingContract.findMany({
    where: { status: 'ACTIVE' },
    include: {
      client: { select: { id: true, name: true, whatsapp: true, phone: true } },
      vehicle: { select: { plate: true, brand: true, model: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const contract of contracts) {
    const dueDate = buildDueDate(year, month, contract.dueDay);

    try {
      await prisma.trackingInvoice.create({
        data: {
          contractId: contract.id,
          referenceMonth,
          dueDate,
          amount: contract.monthlyAmount,
          status: 'PENDING',
        },
      });
      created += 1;
    } catch (err) {
      if (err.code === 'P2002') {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return { referenceMonth, contracts: contracts.length, created, skipped };
}

function daysOverdueFromDueDate(dueDate) {
  const now = new Date();
  const due = new Date(dueDate);
  const diff = now.getTime() - due.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function shouldSendCollection(daysOverdue) {
  return [1, 3, 7, 15, 30, 45, 60, 90].includes(daysOverdue);
}

function buildCollectionMessage({ clientName, plate, amount, referenceMonth, dueDate, daysOverdue }) {
  const due = new Date(dueDate).toLocaleDateString('pt-BR');
  const val = Number(amount).toFixed(2).replace('.', ',');

  if (daysOverdue <= 0) {
    return `Olá, ${clientName}. Mensalidade de rastreamento ${referenceMonth} no valor de R$ ${val} vence em ${due}. Qualquer dúvida, fale com a JR Auto Parts.`;
  }

  return `Olá, ${clientName}. Identificamos a mensalidade de rastreamento ${referenceMonth} do veículo ${plate} em aberto (${daysOverdue} dia(s) de atraso). Valor: R$ ${val}. Vencimento: ${due}. Entre em contato para regularização.`;
}

async function sendCollectionNotices() {
  const invoices = await prisma.trackingInvoice.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
    },
    include: {
      contract: {
        include: {
          client: { select: { id: true, name: true, whatsapp: true, phone: true } },
          vehicle: { select: { plate: true } },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  let sent = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const daysOverdue = daysOverdueFromDueDate(invoice.dueDate);
    if (!shouldSendCollection(daysOverdue)) {
      skipped += 1;
      continue;
    }

    const phone = invoice.contract.client.whatsapp || invoice.contract.client.phone;
    if (!phone) {
      skipped += 1;
      continue;
    }

    const content = buildCollectionMessage({
      clientName: invoice.contract.client.name,
      plate: invoice.contract.vehicle.plate,
      amount: invoice.amount,
      referenceMonth: invoice.referenceMonth,
      dueDate: invoice.dueDate,
      daysOverdue,
    });

    await sendWhatsAppMessage({
      clientId: invoice.contract.client.id,
      soId: null,
      phone,
      content,
    });

    sent += 1;

    if (daysOverdue > 0 && invoice.status !== 'OVERDUE') {
      await prisma.trackingInvoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      });
    }
  }

  return { evaluated: invoices.length, sent, skipped };
}

async function runTrackingDailyJobs(referenceMonth = getReferenceMonth(new Date())) {
  const invoiceResult = await generateInvoicesForReference(referenceMonth);
  const collectionResult = await sendCollectionNotices();

  return { invoiceResult, collectionResult };
}

module.exports = {
  getReferenceMonth,
  generateInvoicesForReference,
  sendCollectionNotices,
  runTrackingDailyJobs,
};
