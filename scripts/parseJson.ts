import path from 'path';
import fs from 'fs';
import { readJsonFile, writeJsonFile, log, logError } from '../src/utils/jsonHelpers';

// Typing our card format for our used data
type ParsedCard = {
  uuid: string;
  scryfallId?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  prices: {
    tcgplayer?: number;
    cardmarket?: number;
    cardkingdom?: number;
  };
  purchaseUrls?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardkingdom?: string;
  };
};
// File paths
const printingsPath = path.join(__dirname, '../temp/AllPrintings.json');
const pricesPath = path.join(__dirname, '../temp/AllPrices.json');
const outputPath = path.join(__dirname, '../data/parsedCards.json');

async function parseAndCleanJson() {
  try {
    log('Reading MTGJSON files...');

    const allPrintings = await readJsonFile(printingsPath, { streamKey: 'data' });
    const allPrices = await readJsonFile(pricesPath, { streamKey: 'data' });

    const parsedCards: ParsedCard[] = [];

    let setCount = 0;
    const totalSets = Object.keys(allPrintings.data).length;
    let cardCount = 0;

    for (const setCode in allPrintings.data) {
      setCount++;
      if (setCount % 10 === 0) {
        const percent = ((setCount / totalSets) * 100).toFixed(1);
        log(`Parsed ${setCount}/${totalSets} sets (${percent}%) — ${cardCount} cards so far`);
      }
      const set = allPrintings.data[setCode];
      if (!Array.isArray(set.cards)) continue;
      for (const card of set.cards) {
        // Filter for only English cards
        if (card.languages && !card.languages.includes('English')) continue;

        const uuid = card.uuid;
        const priceEntry = allPrices.data?.[uuid].paper;
        if (!priceEntry) continue;

        const getLatest = (vendor: any): number | undefined =>
          vendor?.retail?.normal
            ? (Object.values(vendor.retail.normal).pop() as number)
            : undefined;

        const parsed: ParsedCard = {
          uuid,
          scryfallId: card.scryfallId,
          name: card.name,
          setCode: set.code,
          collectorNumber: card.number,
          prices: {
            tcgplayer: getLatest(priceEntry.tcgplayer),
            cardkingdom: getLatest(priceEntry.cardkingdom),
            cardmarket: getLatest(priceEntry.cardmarket),
          },
          purchaseUrls: {
            tcgplayer: card.purchaseUrls?.tcgplayer,
            cardmarket: card.purchaseUrls?.cardmarket,
            cardkingdom: card.purchaseUrls?.cardKingdom,
          },
        };

        parsedCards.push(parsed);
        cardCount++;
      }
    }
    log(`Parsed ${parsedCards.length} cards. Writing to Output...`);
    await writeJsonFile(outputPath, parsedCards);

    fs.unlinkSync(printingsPath);
    fs.unlinkSync(pricesPath);
    log(`Deleted raw JSON  files from /temp`);
    log(`Output saved to: ${outputPath}`);
  } catch (err) {
    logError(`Failed to parse MTGJSON files:`, err);
  }
}
parseAndCleanJson();
