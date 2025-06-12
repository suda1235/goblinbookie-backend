import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const knownUUIDs = new Set<string>();

async function loadUUIDs(cardsPath: string) {
  log('Loading UUIDs from parsedCards.ndjson...');
  let count = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(cardsPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      const card = JSON.parse(line);
      if (card.uuid) {
        knownUUIDs.add(card.uuid);
        count++;
      }
    } catch (err) {
      logError(`Failed to parse line in parsedCards.ndjson: ${err}`);
    }
  }

  log(`Loaded ${count} card UUIDs`);
}

function getMostRecentDate(obj: Record<string, number>): string | null {
  const dates = Object.keys(obj).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.sort().reverse()[0] ?? null;
}

type PriceDateEntry = { [date: string]: number };
type FinishPrices = { [finish: string]: PriceDateEntry };
type PriceType = { [type: string]: FinishPrices };
type VendorPrices = { [vendor: string]: PriceType };

async function parsePricesNDJSON() {
  const cardsPath = path.join(__dirname, '../temp/parsedCards.ndjson');
  const pricesPath = path.join(__dirname, '../temp/AllPrices.json');
  const outputPath = path.join(__dirname, '../temp/parsedPrices.ndjson');

  await loadUUIDs(cardsPath);

  const writer = fs.createWriteStream(outputPath, 'utf-8');
  const pipeline = chain([
    fs.createReadStream(pricesPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  let processed = 0;
  let kept = 0;

  pipeline.on('data', ({ key, value }) => {
    processed++;

    if (!knownUUIDs.has(key)) return;

    const pricesToday: VendorPrices = {};

    for (const vendor of ['tcgplayer', 'cardkingdom', 'cardmarket']) {
      const vendorData = value.paper?.[vendor];
      if (!vendorData) continue;

      for (const type of ['retail', 'buylist']) {
        const typeData = vendorData[type];
        if (!typeData) continue;

        for (const finish of ['normal', 'foil', 'etched']) {
          const finishData = typeData[finish];
          if (!finishData || typeof finishData !== 'object') continue;

          const mostRecentDate = getMostRecentDate(finishData);
          if (!mostRecentDate) continue;

          const price = finishData[mostRecentDate];
          if (price !== undefined) {
            if (!pricesToday[vendor]) pricesToday[vendor] = {};
            if (!pricesToday[vendor][type]) pricesToday[vendor][type] = {};
            if (!pricesToday[vendor][type][finish]) pricesToday[vendor][type][finish] = {};

            pricesToday[vendor][type][finish][mostRecentDate] = price;
          }
        }
      }
    }

    if (Object.keys(pricesToday).length > 0) {
      writer.write(JSON.stringify({ uuid: key, prices: pricesToday }) + '\n');
      kept++;
    }
  });

  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    log(`parsePrices complete: ${processed} total prices checked, ${kept} matched and written`);
  });

  pipeline.on('error', (err) => logError(`parsePrices stream failed: ${err}`));
}

parsePricesNDJSON().catch((err) => {
  logError(`parsePrices failed: ${err}`);
});
