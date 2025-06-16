/**
 * Goblin Bookie – Cards API Routes
 *
 * This file defines the main Express API endpoints for Magic: The Gathering card search and detail
 * for the Goblin Bookie app.
 *
 * - `/api/cards`        : Search for cards by name, paginated, plus simple price stats
 * - `/api/cards/random` : Return a random card's UUID from the DB (frontend follows up for full details)
 * - `/api/cards/:uuid`  : Get full detail (including all vendor/finish price aggregates + history) for one card
 *
 *
 * **Key Details:**
 * - Handles partial-name search using Mongo regex, paginated for performance.
 * - Summarizes price info across multiple vendors and finishes.
 * - Always returns a placeholder image for now, for future Scryfall integration.
 * - Always memory-safe: No route loads the entire card DB into RAM.
 *
 */

import express from 'express';
import Card from '../models/Card';

const router = express.Router();

// Currently, all cards use a static placeholder image.
// Replace with Scryfall logic if you wire up image lookups later.
const PLACEHOLDER_IMG = '/images/PlaceHolder.png';

/** Helper: round a nullable number to two decimals, or return null. */
function round2(num: number | null): number | null {
  return typeof num === 'number' ? Number(num.toFixed(2)) : null;
}

/**
 * GET /api/cards
 *
 * Paginated search for cards by (partial) name.
 * Returns a summary for each card: uuid, name, set, average retail/buylist prices (all vendors), and weekly % change.
 *
 * Query params:
 * - name (string, optional)   : substring search (case-insensitive)
 * - page (int, optional)      : which result page (default 1)
 * - limit (int, optional)     : cards per page (default 20)
 */
router.get('/cards', async (req, res) => {
  try {
    const name = req.query.name as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;

    // Mongo filter: case-insensitive substring search for card name
    const filter: any = {};
    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }

    // Select key fields only for perf
    const cards = await Card.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('uuid name setCode scryfallId prices')
      .exec();

    /**
     * Helper: Get the latest price for a type ('retail' or 'buylist') from the prices object.
     * Handles missing fields and different MongoDB number encodings.
     */
    function getLatestPrice(priceObj: any, type: 'retail' | 'buylist') {
      if (!priceObj || !priceObj[type] || !priceObj[type].normal) return null;
      const dates = Object.keys(priceObj[type].normal);
      if (dates.length === 0) return null;
      dates.sort(); // Dates as strings, lexically sorted (ISO 8601 format)
      const latest = dates[dates.length - 1];
      const value = priceObj[type].normal[latest];
      if (value && typeof value === 'object' && '$numberInt' in value)
        return Number(value['$numberInt']);
      if (value && typeof value === 'object' && '$numberDouble' in value)
        return Number(value['$numberDouble']);
      return typeof value === 'number' ? value : null;
    }

    /** Helper: Get the price from exactly one week ago (7 entries back) */
    function getWeekAgoPrice(priceObj: any, type: 'retail' | 'buylist') {
      if (!priceObj || !priceObj[type] || !priceObj[type].normal) return null;
      const dates = Object.keys(priceObj[type].normal).sort();
      if (dates.length < 7) return null;
      const weekAgo = dates[dates.length - 7];
      const value = priceObj[type].normal[weekAgo];
      if (value && typeof value === 'object' && '$numberInt' in value)
        return Number(value['$numberInt']);
      if (value && typeof value === 'object' && '$numberDouble' in value)
        return Number(value['$numberDouble']);
      return typeof value === 'number' ? value : null;
    }

    // List of price vendors to check
    const vendorNames = ['tcgplayer', 'cardkingdom', 'cardmarket'];

    // Build the response summary for each card found
    const response = cards.map((card) => {
      // Always use placeholder image for now
      const imageUrl = PLACEHOLDER_IMG;

      // Compute average latest retail price across vendors
      const vendorRetailPrices = vendorNames
        .map((vendor) => getLatestPrice((card.prices as any)?.[vendor], 'retail'))
        .filter((p) => typeof p === 'number');
      const avgRetail = vendorRetailPrices.length
        ? vendorRetailPrices.reduce((a, b) => a + b, 0) / vendorRetailPrices.length
        : null;

      // Compute average latest buylist price across vendors
      const vendorBuylistPrices = vendorNames
        .map((vendor) => getLatestPrice((card.prices as any)?.[vendor], 'buylist'))
        .filter((p) => typeof p === 'number');
      const avgBuylist = vendorBuylistPrices.length
        ? vendorBuylistPrices.reduce((a, b) => a + b, 0) / vendorBuylistPrices.length
        : null;

      // Compute weekly % change in retail price, averaged across vendors
      const retailChanges = vendorNames
        .map((vendor) => {
          const latest = getLatestPrice((card.prices as any)?.[vendor], 'retail');
          const weekAgo = getWeekAgoPrice((card.prices as any)?.[vendor], 'retail');
          if (typeof latest === 'number' && typeof weekAgo === 'number' && weekAgo !== 0) {
            return ((latest - weekAgo) / weekAgo) * 100;
          }
          return null;
        })
        .filter((c) => typeof c === 'number');
      const weeklyChangePct = retailChanges.length
        ? retailChanges.reduce((a, b) => a + b, 0) / retailChanges.length
        : null;

      // Same for buylist prices
      const buylistChanges = vendorNames
        .map((vendor) => {
          const latest = getLatestPrice((card.prices as any)?.[vendor], 'buylist');
          const weekAgo = getWeekAgoPrice((card.prices as any)?.[vendor], 'buylist');
          if (typeof latest === 'number' && typeof weekAgo === 'number' && weekAgo !== 0) {
            return ((latest - weekAgo) / weekAgo) * 100;
          }
          return null;
        })
        .filter((c) => typeof c === 'number');
      const weeklyChangeBuylistPct = buylistChanges.length
        ? buylistChanges.reduce((a, b) => a + b, 0) / buylistChanges.length
        : null;

      return {
        uuid: card.uuid,
        name: card.name,
        set: card.setCode,
        imageUrl,
        avgRetail: round2(avgRetail),
        avgBuylist: round2(avgBuylist),
        weeklyChangePct: round2(weeklyChangePct),
        weeklyChangeBuylistPct: round2(weeklyChangeBuylistPct),
      };
    });

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while searching cards.' });
  }
});

/**
 * GET /api/cards/random
 *
 * Returns a random card's UUID from the database.
 *
 * Why $sample? Uses MongoDB's native aggregation to *randomly* pick one doc, very memory-efficient even with 90k+ cards.
 * Frontend then calls `/api/cards/:uuid` to fetch the actual details.
 */
router.get('/cards/random', async (req, res) => {
  try {
    // $sample avoids loading the whole DB or doing a full scan
    const [card] = await Card.aggregate([{ $sample: { size: 1 } }]);
    if (!card) {
      return res.status(404).json({ error: 'No cards found in database.' });
    }
    res.json({ uuid: card.uuid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching random card.' });
  }
});

/**
 * GET /api/cards/:uuid
 *
 * Returns full detail for a single card.
 * - Vendor-by-vendor and finish-by-finish breakdown
 * - Price history (daily averages, per finish)
 *
 * Example structure:
 * {
 *   uuid, name, set, imageUrl,
 *   finishes: ['normal', 'foil'],
 *   prices: { retail: {normal: {...}}, buylist: {normal: {...}} },
 *   vendors: [ {vendor, purchaseUrl, prices: {...}}, ... ],
 *   history: [{ date, retail: {normal: X, foil: Y}, buylist: {...}}, ... ]
 * }
 */
router.get('/cards/:uuid', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    const card = await Card.findOne({ uuid }).select('-__v').lean();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const imageUrl = '/images/PlaceHolder.png';
    const vendorNames = ['tcgplayer', 'cardkingdom', 'cardmarket'];

    /** Finds all finishes present for this card, across all vendors/types (e.g., "normal", "foil", "etched") */
    function findAllFinishes(prices: any) {
      const finishes = new Set<string>();
      for (const vendor of vendorNames) {
        for (const type of ['retail', 'buylist']) {
          const typeObj = prices?.[vendor]?.[type];
          if (typeObj) {
            Object.keys(typeObj)
              .filter((f) => f !== '_id')
              .forEach((finish) => finishes.add(finish));
          }
        }
      }
      return Array.from(finishes);
    }

    const allFinishes = findAllFinishes(card.prices);

    /** Get the latest price for a finish/type from a vendor's price object */
    function getLatestForFinish(priceObj: any, type: 'retail' | 'buylist', finish: string) {
      if (!priceObj || !priceObj[type] || !priceObj[type][finish]) return null;
      const dates = Object.keys(priceObj[type][finish]);
      if (!dates.length) return null;
      dates.sort();
      const latest = dates[dates.length - 1];
      const value = priceObj[type][finish][latest];
      if (value && typeof value === 'object' && '$numberInt' in value)
        return Number(value['$numberInt']);
      if (value && typeof value === 'object' && '$numberDouble' in value)
        return Number(value['$numberDouble']);
      return typeof value === 'number' ? value : null;
    }

    /**
     * Build a vendor-by-vendor table: for each, latest prices for every finish/type.
     * Also includes purchaseUrl for that vendor (if any).
     */
    const vendors = vendorNames.map((vendor) => {
      const vendorObj: any = {
        vendor,
        purchaseUrl: card.purchaseUrls?.[vendor] || null,
        prices: {},
      };
      for (const type of ['retail', 'buylist']) {
        vendorObj.prices[type] = {};
        for (const finish of allFinishes) {
          const val = getLatestForFinish((card.prices as any)?.[vendor], type as any, finish);
          vendorObj.prices[type][finish] = val !== undefined ? val : null;
        }
      }
      return vendorObj;
    });

    /**
     * For each finish/type, compute low/avg/high across all vendors (for display).
     * Each value is null if no price available.
     */
    function getFinishAggregates(type: 'retail' | 'buylist', finish: string) {
      const vals = vendors.map((v) => v.prices[type][finish]).filter((x) => typeof x === 'number');
      return {
        low: vals.length ? Number(Math.min(...vals).toFixed(2)) : null,
        avg: vals.length
          ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
          : null,
        high: vals.length ? Number(Math.max(...vals).toFixed(2)) : null,
      };
    }

    // Main price aggregates object: prices.retail.normal, prices.buylist.foil, etc.
    const prices: Record<string, any> = {};
    for (const type of ['retail', 'buylist']) {
      prices[type] = {};
      for (const finish of allFinishes) {
        prices[type][finish] = getFinishAggregates(type as any, finish);
      }
    }

    /**
     * Find all dates for which we have any price (union of all vendors/finishes)
     * Needed to build the price history chart array.
     */
    function allDatesForFinish(prices: any, finish: string) {
      const dateSet = new Set<string>();
      for (const vendor of vendorNames) {
        for (const type of ['retail', 'buylist']) {
          const obj = prices?.[vendor]?.[type]?.[finish];
          if (obj) Object.keys(obj).forEach((date) => dateSet.add(date));
        }
      }
      return Array.from(dateSet).sort();
    }
    // Union of all dates across all finishes
    let allDatesSet = new Set<string>();
    for (const finish of allFinishes) {
      allDatesForFinish(card.prices, finish).forEach((date) => allDatesSet.add(date));
    }
    const allDates = Array.from(allDatesSet).sort();

    /**
     * Build a price history array: one entry per date, with avg retail/buylist price for each finish.
     * Used for line graphs/charts in frontend.
     */
    const history = allDates.map((date) => {
      const retail: any = {};
      const buylist: any = {};
      for (const finish of allFinishes) {
        // For each finish, compute avg across all vendors for this day
        const retailVals = vendorNames
          .map((v) => (card.prices as any)?.[v]?.retail?.[finish]?.[date])
          .filter((x) =>
            typeof x === 'object'
              ? '$numberInt' in x || '$numberDouble' in x
              : typeof x === 'number'
          )
          .map((x) => {
            if (x && typeof x === 'object' && '$numberInt' in x) return Number(x['$numberInt']);
            if (x && typeof x === 'object' && '$numberDouble' in x)
              return Number(x['$numberDouble']);
            return typeof x === 'number' ? x : null;
          })
          .filter((x): x is number => typeof x === 'number');
        retail[finish] = retailVals.length
          ? Number((retailVals.reduce((a, b) => a + b, 0) / retailVals.length).toFixed(2))
          : null;
        // buylist same
        const buylistVals = vendorNames
          .map((v) => (card.prices as any)?.[v]?.buylist?.[finish]?.[date])
          .filter((x) =>
            typeof x === 'object'
              ? '$numberInt' in x || '$numberDouble' in x
              : typeof x === 'number'
          )
          .map((x) => {
            if (x && typeof x === 'object' && '$numberInt' in x) return Number(x['$numberInt']);
            if (x && typeof x === 'object' && '$numberDouble' in x)
              return Number(x['$numberDouble']);
            return typeof x === 'number' ? x : null;
          })
          .filter((x): x is number => typeof x === 'number');
        buylist[finish] = buylistVals.length
          ? Number((buylistVals.reduce((a, b) => a + b, 0) / buylistVals.length).toFixed(2))
          : null;
      }
      return { date, retail, buylist };
    });

    res.json({
      uuid: card.uuid,
      name: card.name,
      set: card.setCode,
      language: card.language,
      imageUrl,
      finishes: allFinishes,
      prices,
      vendors,
      history,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while fetching card details.' });
  }
});

export default router;
