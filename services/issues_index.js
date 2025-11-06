/**
 * Issues Database Index
 * 
 * Provides lookup of issues from the database by canonical_bill_id
 * Used as an alternative to BILLSTATUS file indexing for vote resolution
 */

const { pool } = require('../db/pool');

class IssuesIndex {
  constructor() {
    this.issuesByCanonical = new Map(); // canonical_bill_id/canonical_normalized -> issue record
    this.issuesByBillKey = new Map();   // bill_key (119:hr:15) -> issue record
    this.issuesById = new Map();        // issue id -> issue record
  }

  /**
   * Load all issues from database into memory
   * Uses both canonical_bill_id (new) and canonical_normalized (legacy) fields
   * Also loads issue_identifiers table for additional lookups
   */
  async indexFromDatabase() {
    // Load all issues with either canonical field populated
    const result = await pool.query(
      `SELECT id, title, bill_id, canonical_bill_id, canonical_normalized, 
              vote_date, external_ids, description
       FROM issues 
       WHERE canonical_bill_id IS NOT NULL 
          OR canonical_normalized IS NOT NULL`
    );

    // Load identifier mappings
    const identifiers = await pool.query(
      `SELECT normalized_id, issue_id 
       FROM issue_identifiers`
    );

    console.log(`Indexing ${result.rows.length} issues from database...`);
    console.log(`Loading ${identifiers.rows.length} identifier mappings...`);

    // First pass: index all issues by ID
    for (const issue of result.rows) {
      this.issuesById.set(issue.id, issue);
    }

    // Second pass: index by canonical fields
    for (const issue of result.rows) {
      // Index by canonical_bill_id (newer field)
      if (issue.canonical_bill_id) {
        const canonical = issue.canonical_bill_id.toUpperCase();
        this.issuesByCanonical.set(canonical, issue);
        
        const billKey = this.canonicalToBillKey(issue.canonical_bill_id);
        if (billKey) {
          this.issuesByBillKey.set(billKey, issue);
        }
      }

      // Also index by canonical_normalized (legacy field)
      if (issue.canonical_normalized) {
        const normalized = issue.canonical_normalized.toUpperCase();
        // Only add if not already indexed (canonical_bill_id takes precedence)
        if (!this.issuesByCanonical.has(normalized)) {
          this.issuesByCanonical.set(normalized, issue);
        }
        
        const billKey = this.canonicalToBillKey(issue.canonical_normalized);
        if (billKey && !this.issuesByBillKey.has(billKey)) {
          this.issuesByBillKey.set(billKey, issue);
        }
      }
    }

    // Third pass: add identifier lookups
    let identifierMatches = 0;
    for (const { normalized_id, issue_id } of identifiers.rows) {
      if (!normalized_id) continue;
      
      const issue = this.issuesById.get(issue_id);
      if (!issue) continue;

      const normalizedUpper = normalized_id.toUpperCase();
      
      // Only index compact bill forms like "HR5143", "HB5143"
      // Skip URLs and other non-standard formats
      if (normalizedUpper.match(/^[A-Z]+\d+$/)) {
        // Add to canonical index if not already present
        if (!this.issuesByCanonical.has(normalizedUpper)) {
          this.issuesByCanonical.set(normalizedUpper, issue);
        }
        
        // Try to convert to bill_key and index
        const billKey = this.canonicalToBillKey(normalizedUpper);
        if (billKey && !this.issuesByBillKey.has(billKey)) {
          this.issuesByBillKey.set(billKey, issue);
          identifierMatches++;
        }
      }
    }

    console.log(`Indexed ${this.issuesByCanonical.size} issues by canonical forms`);
    console.log(`Indexed ${this.issuesByBillKey.size} issues by bill_key`);
    console.log(`Added ${identifierMatches} identifier-based bill_key mappings`);

    return {
      total_issues: result.rows.length,
      indexed_by_canonical: this.issuesByCanonical.size,
      indexed_by_bill_key: this.issuesByBillKey.size,
      identifier_mappings: identifierMatches
    };
  }

  /**
   * Convert canonical bill ID (e.g., "HR15") to bill_key format (e.g., "119:hr:15")
   * @param {string} canonical - Canonical bill ID like "HR15", "S23", "HJRES7", "HB15" (legacy)
   * @returns {string|null} Bill key in format congress:billType:billNumber
   */
  canonicalToBillKey(canonical) {
    if (!canonical) return null;

    const congress = 119; // Current congress
    const normalized = canonical.toUpperCase().trim();

    // Parse patterns including legacy "HB" and "SB" forms
    // Order matters: check longer patterns first to avoid false matches
    const patterns = [
      { regex: /^HCONRES(\d+)$/i, type: 'hconres' },
      { regex: /^SCONRES(\d+)$/i, type: 'sconres' },
      { regex: /^HJRES(\d+)$/i, type: 'hjres' },
      { regex: /^SJRES(\d+)$/i, type: 'sjres' },
      { regex: /^HRES(\d+)$/i, type: 'hres' },
      { regex: /^SRES(\d+)$/i, type: 'sres' },
      { regex: /^HR(\d+)$/i, type: 'hr' },
      { regex: /^HB(\d+)$/i, type: 'hr' },  // Legacy: HB -> hr
      { regex: /^S(\d+)$/i, type: 's' },
      { regex: /^SB(\d+)$/i, type: 's' }    // Legacy: SB -> s
    ];

    for (const { regex, type } of patterns) {
      const match = normalized.match(regex);
      if (match) {
        const billNumber = parseInt(match[1], 10);
        return `${congress}:${type}:${billNumber}`;
      }
    }

    return null;
  }

  /**
   * Find issue by canonical bill ID
   * @param {string} canonicalBillId - Canonical bill ID like "HR15"
   * @returns {Object|null} Issue record or null
   */
  findByCanonical(canonicalBillId) {
    if (!canonicalBillId) return null;
    return this.issuesByCanonical.get(canonicalBillId.toUpperCase()) || null;
  }

  /**
   * Find issue by bill_key
   * @param {string} billKey - Bill key like "119:hr:15"
   * @returns {Object|null} Issue record or null
   */
  findByBillKey(billKey) {
    if (!billKey) return null;
    return this.issuesByBillKey.get(billKey) || null;
  }

  /**
   * Get statistics about indexed issues
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      total_issues: this.issuesByCanonical.size,
      indexed_by_canonical: this.issuesByCanonical.size,
      indexed_by_bill_key: this.issuesByBillKey.size
    };
  }

  /**
   * Get bill text URLs for an issue
   * Issues table doesn't store multiple URLs, but we can construct congress.gov URL
   * @param {string} billKey - Bill key like "119:hr:15"
   * @returns {Array<{url: string, format: string}>}
   */
  getBillTextUrls(billKey) {
    const issue = this.findByBillKey(billKey);
    if (!issue) return [];

    const urls = [];
    
    // Add congress.gov URL if available in external_ids
    if (issue.external_ids && issue.external_ids.congressgov_url) {
      urls.push({
        url: issue.external_ids.congressgov_url,
        format: 'html'
      });
    }
    
    // Add legiscan URL if available
    if (issue.external_ids && issue.external_ids.legiscan_url) {
      urls.push({
        url: issue.external_ids.legiscan_url,
        format: 'html'
      });
    }

    return urls;
  }

  /**
   * Compatibility methods for VoteResolver
   * These return null since issues table doesn't track action history
   */
  findByExactRoll(chamber, date, rollNumber, windowDays = 1) {
    // Issues table doesn't have roll number tracking
    return null;
  }

  findByBillAndDate(billKey, date) {
    // Return empty array - issues don't track action dates
    return [];
  }

  findByDate(date) {
    // Return empty array - issues don't track action dates
    return [];
  }
}

module.exports = IssuesIndex;
