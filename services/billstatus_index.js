/**
 * BILLSTATUS Index Resolver
 * 
 * Indexes BILLSTATUS XML files by date and scans for roll call references
 * Supports D±1 day window for matching votes to bills
 */

const fs = require('fs').promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const glob = require('glob');
const util = require('util');
const { makeBillKey, extractRollNumber } = require('../lib/vote_keys');

const globAsync = util.promisify(glob);

/**
 * Action indexed by date
 * @typedef {Object} IndexedAction
 * @property {string} bill_key - congress:bill_type:bill_number
 * @property {string} action_date - ISO date
 * @property {string} action_text - Full action text
 * @property {number|null} roll_number - Extracted roll number if present
 * @property {string} action_code - Action code if available
 * @property {string} chamber - 'house' or 'senate'
 */

class BillStatusIndex {
  constructor() {
    this.actionsByDate = new Map(); // date -> Array<IndexedAction>
    this.actionsByBillKey = new Map(); // bill_key -> Array<IndexedAction>
    this.actionsByRoll = new Map(); // chamber:date:roll -> IndexedAction
    this.billTextUrls = new Map(); // bill_key -> Array<{url, format}>
  }

  /**
   * Index a BILLSTATUS XML file
   * @param {string} xmlPath - Path to BILLSTATUS XML file
   */
  async indexBillStatusFile(xmlPath) {
    const content = await fs.readFile(xmlPath, 'utf8');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true
    });
    
    const result = parser.parse(content);

    const bill = result.billStatus?.bill || result.bill;
    if (!bill) {
      throw new Error('Invalid BILLSTATUS XML: missing bill element');
    }

    // Extract bill metadata
    const congress = parseInt(bill.congress, 10);
    const billType = (bill.billType || bill.type).toLowerCase().replace(/\./g, '');
    const billNumber = parseInt(bill.billNumber || bill.number, 10);
    const billKey = makeBillKey(congress, billType, billNumber);

    // Index bill text URLs
    this.indexBillTextUrls(billKey, bill);

    // Index actions
    const actions = bill.actions?.item || [];
    const actionArray = Array.isArray(actions) ? actions : [actions];

    for (const action of actionArray) {
      if (!action || !action.actionDate) continue;

      const actionDate = action.actionDate.split('T')[0]; // Normalize to YYYY-MM-DD
      const actionText = action.text || '';
      const actionCode = action.actionCode || action.type || '';

      // Determine chamber from action
      const chamber = this.determineChamber(action, billType);

      // Extract roll number if present
      const rollNumber = extractRollNumber(actionText);

      const indexedAction = {
        bill_key: billKey,
        action_date: actionDate,
        action_text: actionText,
        roll_number: rollNumber,
        action_code: actionCode,
        chamber
      };

      // Index by date
      if (!this.actionsByDate.has(actionDate)) {
        this.actionsByDate.set(actionDate, []);
      }
      this.actionsByDate.get(actionDate).push(indexedAction);

      // Index by bill_key
      if (!this.actionsByBillKey.has(billKey)) {
        this.actionsByBillKey.set(billKey, []);
      }
      this.actionsByBillKey.get(billKey).push(indexedAction);

      // Index by roll if present
      if (rollNumber && chamber) {
        const rollKey = `${chamber}:${actionDate}:${rollNumber}`;
        this.actionsByRoll.set(rollKey, indexedAction);
      }
    }
  }

  /**
   * Index bill text URLs
   * @param {string} billKey - Bill key
   * @param {Object} bill - Parsed bill object
   */
  indexBillTextUrls(billKey, bill) {
    const formats = bill.textVersions?.item || [];
    const formatArray = Array.isArray(formats) ? formats : [formats];

    const urls = [];
    for (const format of formatArray) {
      if (format && format.formats) {
        const formatItems = Array.isArray(format.formats.item) 
          ? format.formats.item 
          : [format.formats.item];

        for (const item of formatItems) {
          if (item && item.url) {
            urls.push({
              url: item.url,
              format: item.type || format.type || 'unknown'
            });
          }
        }
      }
    }

    if (urls.length > 0) {
      this.billTextUrls.set(billKey, urls);
    }
  }

  /**
   * Determine chamber from action
   * @param {Object} action - Action object
   * @param {string} billType - Bill type
   * @returns {string|null} 'house' or 'senate'
   */
  determineChamber(action, billType) {
    // Check action source committee
    if (action.sourceSystem) {
      const source = action.sourceSystem.name || '';
      if (source.toLowerCase().includes('house')) return 'house';
      if (source.toLowerCase().includes('senate')) return 'senate';
    }

    // Check action text
    const text = (action.text || '').toLowerCase();
    if (text.includes('house floor') || text.includes('house of representatives')) {
      return 'house';
    }
    if (text.includes('senate floor') || text.includes('senate')) {
      return 'senate';
    }

    // Fallback: determine from bill type
    if (billType.startsWith('h')) return 'house';
    if (billType.startsWith('s')) return 'senate';

    return null;
  }

  /**
   * Find action by exact roll match
   * @param {string} chamber - 'house' or 'senate'
   * @param {string} date - ISO date (YYYY-MM-DD)
   * @param {number} rollNumber - Roll number
   * @param {number} windowDays - Days before/after to search (default: 1)
   * @returns {IndexedAction|null}
   */
  findByExactRoll(chamber, date, rollNumber, windowDays = 1) {
    // Try exact date first
    const exactKey = `${chamber}:${date}:${rollNumber}`;
    if (this.actionsByRoll.has(exactKey)) {
      return this.actionsByRoll.get(exactKey);
    }

    // Try D±windowDays
    const dateObj = new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      console.warn(`Invalid date for roll lookup: ${date}`);
      return null;
    }
    
    for (let offset = -windowDays; offset <= windowDays; offset++) {
      if (offset === 0) continue; // Already tried exact
      
      const testDate = new Date(dateObj);
      testDate.setDate(testDate.getDate() + offset);
      const testDateStr = testDate.toISOString().split('T')[0];
      
      const testKey = `${chamber}:${testDateStr}:${rollNumber}`;
      if (this.actionsByRoll.has(testKey)) {
        return this.actionsByRoll.get(testKey);
      }
    }

    return null;
  }

  /**
   * Find actions by bill_key on a specific date
   * @param {string} billKey - Bill key
   * @param {string} date - ISO date (YYYY-MM-DD)
   * @returns {Array<IndexedAction>}
   */
  findByBillAndDate(billKey, date) {
    const billActions = this.actionsByBillKey.get(billKey) || [];
    return billActions.filter(action => action.action_date === date);
  }

  /**
   * Find all actions on a specific date
   * @param {string} date - ISO date (YYYY-MM-DD)
   * @returns {Array<IndexedAction>}
   */
  findByDate(date) {
    return this.actionsByDate.get(date) || [];
  }

  /**
   * Get bill text URLs
   * @param {string} billKey - Bill key
   * @returns {Array<{url: string, format: string}>}
   */
  getBillTextUrls(billKey) {
    return this.billTextUrls.get(billKey) || [];
  }

  /**
   * Index multiple BILLSTATUS files from a directory
   * @param {string} dirPath - Directory containing BILLSTATUS XML files
   * @param {string} pattern - Glob pattern for matching files
   */
  async indexDirectory(dirPath, pattern = '**/*BILLSTATUS*.xml') {
    const glob = require('glob');
    
    const files = await new Promise((resolve, reject) => {
      glob(path.join(dirPath, pattern), (err, matches) => {
        if (err) reject(err);
        else resolve(matches);
      });
    });

    console.log(`Indexing ${files.length} BILLSTATUS files from ${dirPath}...`);
    
    let indexed = 0;
    let errors = 0;

    for (const file of files) {
      try {
        await this.indexBillStatusFile(file);
        indexed++;
        
        if (indexed % 100 === 0) {
          console.log(`Indexed ${indexed}/${files.length} files...`);
        }
      } catch (error) {
        console.error(`Error indexing ${file}:`, error.message);
        errors++;
      }
    }

    console.log(`Indexing complete: ${indexed} files indexed, ${errors} errors`);
    console.log(`Total actions indexed: ${this.actionsByRoll.size} with roll numbers`);
    console.log(`Total bills indexed: ${this.billTextUrls.size} with text URLs`);
  }

  /**
   * Get statistics about the index
   * @returns {Object}
   */
  getStats() {
    return {
      actions_with_rolls: this.actionsByRoll.size,
      unique_dates: this.actionsByDate.size,
      unique_bills: this.actionsByBillKey.size,
      bills_with_text_urls: this.billTextUrls.size,
      total_actions: Array.from(this.actionsByDate.values())
        .reduce((sum, actions) => sum + actions.length, 0)
    };
  }
}

module.exports = BillStatusIndex;
