const { runTrackingDailyJobs, getReferenceMonth } = require('../src/services/trackingBillingService');

async function main() {
  const referenceMonth = process.argv[2] || getReferenceMonth(new Date());
  const result = await runTrackingDailyJobs(referenceMonth);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
