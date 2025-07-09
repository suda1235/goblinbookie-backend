/**
 * Goblin Bookie – Parse Price Data (AllPrices.json)
 *
 * PURPOSE:
 *   Streams MTGJSON's AllPrices.json and outputs the most recent price for each card UUID,
 *   for each vendor/type/finish combo, as NDJSON—one card per line. Only includes cards
 *   present in parsedCards.ndjson (already filtered for English paper cards).
 *
 * CONTEXT:
 *   - AllPrices.json contains 90+ days of data for every card/finish/vendor—much more than is needed for MVP.
 *   - This script extracts only the most recent price for each (vendor/type/finish) and only for relevant UUIDs,
 *     reducing output size, upload time, and memory usage downstream.
 *     only the most recent price is taken because ive already populated existing cards with 90 days of historical pricing,
 *     so we just add the new days to the historical data.
 *
 * IMPLEMENTATION DETAILS:
 *   - Loads all valid card UUIDs into a Set from parsedCards.ndjson before processing prices.
 *   - Uses stream-json for fully streaming, event-driven processing (no memory bloat).
 *   - For each UUID, writes the most recent price per vendor/type/finish as one NDJSON object.
 *   - Logs processed/kept counts so any pipeline breakage is immediately obvious.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { logInfo, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const knownUUIDs = new Set<string>();

/**
 * Loads all UUIDs from parsedCards.ndjson into a Set, ensuring we process
 * only relevant card prices (matching previous filters).
 */
async function loadUUIDs(cardsPath: string) {
  logInfo('[parsePrices.ts]', 'Loading UUIDs from parsedCards.ndjson...');
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
      logError('[parsePrices.ts]', `Failed to parse line in parsedCards.ndjson: ${err}`);
    }
  }

  logInfo('[parsePrices.ts]', `Loaded ${count} card UUIDs`);
}

/**
 * Returns the most recent date key from a {date: price} object, or null if none.
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
 * for each card UUID present in knownUUIDs, writing NDJSON output line by line.
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

    // Only process prices for known UUIDs (previously filtered cards)
    if (!knownUUIDs.has(key)) return;

    const pricesToday: VendorPrices = {};

    // For each supported vendor (tcgplayer, cardkingdom, cardmarket)
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

    // Only write if there is at least one price (avoid blank lines)
    if (Object.keys(pricesToday).length > 0) {
      writer.write(JSON.stringify({ uuid: key, prices: pricesToday }) + '\n');
      kept++;
    }
  });

  // Log summary when finished
  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    logInfo(
      '[parsePrices.ts]',
      `parsePrices complete: ${processed} total prices checked, ${kept} matched and written`
    );
  });

  pipeline.on('error', (err) => logError('[parsePrices.ts]', `Stream failed: ${err}`));
}

// Start the process and log if it fails catastrophically
parsePricesNDJSON().catch((err) => {
  logError('[parsePrices.ts]', `parsePrices failed: ${err}`);
});
