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
 * Key Details:
 * - Handles partial-name search using Mongo regex, paginated for performance.
 * - Summarizes price info across multiple vendors and finishes.
 * - Uses real card image URLs from the database, falling back to placeholder if missing.
 * - Always memory-safe: No route loads the entire card DB into RAM.
 */

import express from 'express';
import Card from '../models/Card';

const router = express.Router();

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
      .select('uuid name setCode scryfallId prices imageUrl')
      .exec();

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

    const vendorNames = ['tcgplayer', 'cardkingdom', 'cardmarket'];

    const response = cards.map((card) => {
      // Use imageUrl from DB, fallback to placeholder
      const imageUrl = card.imageUrl || PLACEHOLDER_IMG;

      const vendorRetailPrices = vendorNames
        .map((vendor) => getLatestPrice((card.prices as any)?.[vendor], 'retail'))
        .filter((p) => typeof p === 'number');
      const avgRetail = vendorRetailPrices.length
        ? vendorRetailPrices.reduce((a, b) => a + b, 0) / vendorRetailPrices.length
        : null;

      const vendorBuylistPrices = vendorNames
        .map((vendor) => getLatestPrice((card.prices as any)?.[vendor], 'buylist'))
        .filter((p) => typeof p === 'number');
      const avgBuylist = vendorBuylistPrices.length
        ? vendorBuylistPrices.reduce((a, b) => a + b, 0) / vendorBuylistPrices.length
        : null;

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
 */
router.get('/cards/random', async (req, res) => {
  try {
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
 */
router.get('/cards/:uuid', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    const card = await Card.findOne({ uuid }).select('-__v').lean();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Use imageUrl from DB, fallback to placeholder
    const imageUrl = card.imageUrl || PLACEHOLDER_IMG;
    const vendorNames = ['tcgplayer', 'cardkingdom', 'cardmarket'];

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

    const prices: Record<string, any> = {};
    for (const type of ['retail', 'buylist']) {
      prices[type] = {};
      for (const finish of allFinishes) {
        prices[type][finish] = getFinishAggregates(type as any, finish);
      }
    }

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
    let allDatesSet = new Set<string>();
    for (const finish of allFinishes) {
      allDatesForFinish(card.prices, finish).forEach((date) => allDatesSet.add(date));
    }
    const allDates = Array.from(allDatesSet).sort();

    const history = allDates.map((date) => {
      const retail: any = {};
      const buylist: any = {};
      for (const finish of allFinishes) {
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
