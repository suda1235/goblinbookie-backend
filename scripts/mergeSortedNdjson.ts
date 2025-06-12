import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

async function mergeSortedNdjson(cardFile: string, priceFile: string, outputFile: string) {
  const cardRL = readline.createInterface({ input: fs.createReadStream(cardFile) });
  const priceRL = readline.createInterface({ input: fs.createReadStream(priceFile) });
  const output = fs.createWriteStream(outputFile, 'utf-8');

  const cardIter = cardRL[Symbol.asyncIterator]();
  const priceIter = priceRL[Symbol.asyncIterator]();

  let card = await cardIter.next();
  let price = await priceIter.next();

  while (!card.done && !price.done) {
    const cardObj = JSON.parse(card.value);
    const priceObj = JSON.parse(price.value);

    if (cardObj.uuid < priceObj.uuid) card = await cardIter.next();
    else if (priceObj.uuid < cardObj.uuid) price = await priceIter.next();
    else {
      output.write(JSON.stringify({ ...cardObj, prices: priceObj.prices }) + '\n');
      card = await cardIter.next();
      price = await priceIter.next();
    }
  }

  output.end();
  await waitForStreamFinish(output);
  log(' mergedCards.ndjson created');
}

mergeSortedNdjson(
  path.join(__dirname, '../temp/cardsSorted.ndjson'),
  path.join(__dirname, '../temp/pricesSorted.ndjson'),
  path.join(__dirname, '../temp/mergedCards.ndjson')
).catch((err) => logError(`Merge failed: ${err}`));
