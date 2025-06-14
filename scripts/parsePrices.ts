/**
 * Parse Price Data (AllPrices.json)
 *
 * Purpose:
 * This script processes the MTGJSON AllPrices.json file and extracts the most recent
 * price for each card UUID, vendor, type, and finish, but only for cards that were already
 * filtered and kept via `parseCards`. The result is a line-by-line NDJSON file of just the
 * most up-to-date relevant prices.
 *
 * Why this script exists:
 * - MTGJSON's AllPrices.json contains full 90+ day historical data, but for the upload pipeline,
 *   we only need the latest price for each finish/type/vendor.
 * - By extracting only the most recent prices and only for known card UUIDs, we minimize
 *   MongoDB upload size while keeping current pricing info.
 * - Reduces memory and processing requirements for downstream scripts.
 *
 * Implementation details:
 * - Loads UUIDs from `parsedCards.ndjson` into a Set to restrict processing to only relevant cards.
 * - Streams AllPrices.json using the stream-json library to prevent memory overload.
 * - For each vendor/type/finish, extracts only the newest date (latest price) and skips all others.
 * - Writes results as NDJSON (one object per line) to `parsedPrices.ndjson`.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const knownUUIDs = new Set<string>();

/**
 * Loads all UUIDs from the parsedCards.ndjson file into a Set.
 * This ensures we only keep prices for cards that survived earlier filters.
 */
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

/**
 * Given a price object mapping date strings to prices (e.g., {"2024-06-01": 2.50, ...}),
 * returns the most recent date key (as a string), or null if no valid date found.
 */
function getMostRecentDate(obj: Record<string, number>): string | null {
  const dates = Object.keys(obj).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.sort().reverse()[0] ?? null;
}

type PriceDateEntry = { [date: string]: number };
type FinishPrices = { [finish: string]: PriceDateEntry };
type PriceType = { [type: string]: FinishPrices };
type VendorPrices = { [vendor: string]: PriceType };

/**
 * Streams AllPrices.json, extracting only the latest price per vendor/type/finish
 * for each card UUID present in knownUUIDs. Writes results to output NDJSON file.
 */
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

    // Only process prices for known card UUIDs
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

          // Only keep the most recent price date for this vendor/type/finish
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

    // Only write out cards with at least one valid price
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

// Kick off the price parsing process
parsePricesNDJSON().catch((err) => {
  logError(`parsePrices failed: ${err}`);
});
