// src/services/olxSyncService.js - sincroniza OS fechada -> OLX vendido
const prisma = require('../lib/prisma');
const olx = require('./olxService');

const STATUS_FECHA_OLX = ['DELIVERED', 'DONE'];

/**
 * Quando OS muda pra DELIVERED/DONE: identifica produtos consumidos
 * e marca anúncios OLX correspondentes como SOLD + remove da OLX.
 */
async function onOsStatusChanged(serviceOrder, newStatus) {
  if (!STATUS_FECHA_OLX.includes(newStatus)) return { skipped: true, reason: 'status_nao_aplicavel' };

  const items = await prisma.soItem.findMany({
    where: { soId: serviceOrder.id, productId: { not: null } },
    include: { product: { include: { olxAd: true } } },
  });

  const sales = [];
  for (const item of items) {
    const ad = item.product?.olxAd;
    if (!ad || ['SOLD', 'DELETED'].includes(ad.status)) continue;
    try {
      // Marca como SOLD no banco JR
      await prisma.olxAd.update({
        where: { id: ad.id },
        data: { status: 'SOLD', deletedAt: new Date() },
      });
      // Tenta deletar na OLX se configurada
      if (olx.isConfigured() && ad.olxAdId) {
        await olx.deleteAd(ad.olxAdId).catch(e => {
          console.log('[olxSync] erro delete OLX:', e?.response?.data || e.message);
        });
      }
      sales.push({ productId: item.productId, productName: item.product.name, olxAdId: ad.olxAdId });
    } catch (err) {
      console.log('[olxSync] erro item:', err.message);
    }
  }
  return { skipped: false, sold: sales };
}

module.exports = { onOsStatusChanged };
