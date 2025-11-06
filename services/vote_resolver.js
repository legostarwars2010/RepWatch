/**
 * Vote Resolver
 * 
 * 4-step resolution logic to match votes to bills:
 * 1. Exact roll match (BILLSTATUS contains "Roll no. {roll}" on date ±1)
 * 2. Bill same-day (EVS provides bill_number, BILLSTATUS has action on same date)
 * 3. Motion guardrail (Canonical motion family must match)
 * 4. Amendments (Link to parent bill if amendment referenced)
 */

const { compareMotions, extractAmendment } = require('../lib/motion_normalizer');
const { makeBillKey } = require('../lib/vote_keys');

/**
 * Resolution result
 * @typedef {Object} ResolutionResult
 * @property {string} vote_key - Vote key
 * @property {string|null} bill_key - Resolved bill key (null if unresolved)
 * @property {string} match_step - 'exact_roll' | 'bill_same_day' | 'motion' | 'amendment' | 'none'
 * @property {number} confidence - 0.0 to 1.0
 * @property {string|null} reason_if_none - Explanation if unresolved
 * @property {Array<string>} bill_text_urls - URLs to bill text
 * @property {Object} metadata - Additional resolution details
 */

class VoteResolver {
  constructor(billStatusIndex) {
    this.index = billStatusIndex;
    this.resolutionLog = [];
  }

  /**
   * Resolve a vote to a bill using 4-step logic
   * @param {Object} vote - NormalizedVote object
   * @returns {ResolutionResult}
   */
  resolve(vote) {
    const result = {
      vote_key: vote.vote_key,
      bill_key: null,
      match_step: 'none',
      confidence: 0.0,
      reason_if_none: null,
      bill_text_urls: [],
      metadata: {}
    };

    // Step 0: Direct bill_key match (for issues-based indexing)
    if (vote.bill_key) {
      const directMatch = this.resolveByDirectBillKey(vote);
      if (directMatch) {
        result.bill_key = directMatch.bill_key;
        result.match_step = 'direct_bill_key';
        result.confidence = 1.0;
        result.bill_text_urls = directMatch.bill_text_urls;
        result.metadata = {
          issue_id: directMatch.issue_id,
          issue_title: directMatch.issue_title
        };
        
        this.logResolution(result);
        return result;
      }
    }

    // Step 1: Exact roll match
    const exactRoll = this.resolveByExactRoll(vote);
    if (exactRoll) {
      result.bill_key = exactRoll.bill_key;
      result.match_step = 'exact_roll';
      result.confidence = 1.0;
      result.bill_text_urls = this.index.getBillTextUrls(exactRoll.bill_key).map(u => u.url);
      result.metadata = {
        action_text: exactRoll.action_text,
        action_date: exactRoll.action_date,
        date_offset: this.getDateOffset(vote.vote_date, exactRoll.action_date)
      };
      
      this.logResolution(result);
      return result;
    }

    // Step 2: Bill same-day
    if (vote.bill_key) {
      const sameDay = this.resolveByBillSameDay(vote);
      if (sameDay) {
        result.bill_key = sameDay.bill_key;
        result.match_step = 'bill_same_day';
        result.confidence = 0.9;
        result.bill_text_urls = this.index.getBillTextUrls(sameDay.bill_key).map(u => u.url);
        result.metadata = {
          action_text: sameDay.action_text,
          action_date: sameDay.action_date
        };
        
        this.logResolution(result);
        return result;
      }
    }

    // Step 3: Motion guardrail
    const motion = this.resolveByMotion(vote);
    if (motion) {
      result.bill_key = motion.bill_key;
      result.match_step = 'motion';
      result.confidence = motion.confidence;
      result.bill_text_urls = this.index.getBillTextUrls(motion.bill_key).map(u => u.url);
      result.metadata = {
        action_text: motion.action_text,
        action_date: motion.action_date,
        motion_score: motion.motion_score
      };
      
      this.logResolution(result);
      return result;
    }

    // Step 4: Amendments
    const amendment = this.resolveByAmendment(vote);
    if (amendment) {
      result.bill_key = amendment.bill_key;
      result.match_step = 'amendment';
      result.confidence = 0.7;
      result.bill_text_urls = this.index.getBillTextUrls(amendment.bill_key).map(u => u.url);
      result.metadata = {
        action_text: amendment.action_text,
        action_date: amendment.action_date,
        amendment_number: amendment.amendment_number,
        parent_bill: amendment.bill_key
      };
      
      this.logResolution(result);
      return result;
    }

    // Failed to resolve
    result.reason_if_none = this.determineFailureReason(vote);
    this.logResolution(result);
    return result;
  }

  /**
   * Step 0: Resolve by direct bill_key match (for issues-based indexing)
   * @param {Object} vote - NormalizedVote
   * @returns {Object|null} Issue if found
   */
  resolveByDirectBillKey(vote) {
    if (!vote.bill_key) return null;

    // Check if index has findByBillKey method (IssuesIndex)
    if (typeof this.index.findByBillKey === 'function') {
      const issue = this.index.findByBillKey(vote.bill_key);
      if (issue) {
        return {
          bill_key: vote.bill_key,
          issue_id: issue.id,
          issue_title: issue.title,
          bill_text_urls: this.index.getBillTextUrls(vote.bill_key).map(u => u.url)
        };
      }
    }

    return null;
  }

  /**
   * Step 1: Resolve by exact roll match
   * @param {Object} vote - NormalizedVote
   * @returns {Object|null} IndexedAction if found
   */
  resolveByExactRoll(vote) {
    return this.index.findByExactRoll(
      vote.chamber,
      vote.vote_date,
      vote.roll_number,
      1 // ±1 day window
    );
  }

  /**
   * Step 2: Resolve by bill same-day
   * @param {Object} vote - NormalizedVote
   * @returns {Object|null} IndexedAction if found
   */
  resolveByBillSameDay(vote) {
    if (!vote.bill_key) return null;

    const actions = this.index.findByBillAndDate(vote.bill_key, vote.vote_date);
    
    // Return first action (could be refined with additional criteria)
    return actions.length > 0 ? actions[0] : null;
  }

  /**
   * Step 3: Resolve by motion guardrail
   * @param {Object} vote - NormalizedVote
   * @returns {Object|null} Matched action with confidence score
   */
  resolveByMotion(vote) {
    // Get all actions on this date
    const actions = this.index.findByDate(vote.vote_date);
    
    let bestMatch = null;
    let bestScore = 0.0;

    for (const action of actions) {
      // Skip if wrong chamber
      if (action.chamber && action.chamber !== vote.chamber) {
        continue;
      }

      // Compare motions
      const comparison = compareMotions(vote.question, action.action_text);
      
      // Require minimum score of 0.7
      if (comparison.match && comparison.score >= 0.7 && comparison.score > bestScore) {
        bestMatch = action;
        bestScore = comparison.score;
      }
    }

    if (bestMatch) {
      return {
        ...bestMatch,
        confidence: bestScore,
        motion_score: bestScore
      };
    }

    return null;
  }

  /**
   * Step 4: Resolve by amendment
   * @param {Object} vote - NormalizedVote
   * @returns {Object|null} Parent bill action if found
   */
  resolveByAmendment(vote) {
    const amendment = extractAmendment(vote.question);
    if (!amendment) return null;

    // Try to find parent bill from vote.bill_key or question text
    if (vote.bill_key) {
      const actions = this.index.findByBillAndDate(vote.bill_key, vote.vote_date);
      if (actions.length > 0) {
        return {
          ...actions[0],
          amendment_number: amendment.number
        };
      }
    }

    // Try to extract bill from question text
    const { extractBillReference } = require('../lib/vote_keys');
    const billRef = extractBillReference(vote.question);
    
    if (billRef) {
      const billKey = makeBillKey(vote.congress, billRef.billType, billRef.billNumber);
      const actions = this.index.findByBillAndDate(billKey, vote.vote_date);
      if (actions.length > 0) {
        return {
          ...actions[0],
          amendment_number: amendment.number
        };
      }
    }

    return null;
  }

  /**
   * Calculate date offset between two dates
   * @param {string} date1 - ISO date
   * @param {string} date2 - ISO date
   * @returns {number} Days difference
   */
  getDateOffset(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  /**
   * Determine reason for failure to resolve
   * @param {Object} vote - NormalizedVote
   * @returns {string} Reason description
   */
  determineFailureReason(vote) {
    const reasons = [];

    // Check if vote has bill reference
    if (!vote.bill_key && !vote.bill_number) {
      reasons.push('no_bill_reference_in_vote');
    }

    // Check if there are any actions on this date
    const actionsOnDate = this.index.findByDate(vote.vote_date);
    if (actionsOnDate.length === 0) {
      reasons.push('no_actions_indexed_for_date');
    }

    // Check if there are actions for this chamber
    const chamberActions = actionsOnDate.filter(a => !a.chamber || a.chamber === vote.chamber);
    if (chamberActions.length === 0) {
      reasons.push('no_chamber_actions_on_date');
    }

    // Check if vote has motion text
    if (!vote.question || vote.question.trim().length === 0) {
      reasons.push('no_motion_text');
    }

    if (reasons.length === 0) {
      reasons.push('no_matching_criteria');
    }

    return reasons.join('; ');
  }

  /**
   * Log resolution result
   * @param {ResolutionResult} result
   */
  logResolution(result) {
    this.resolutionLog.push({
      timestamp: new Date().toISOString(),
      ...result
    });
  }

  /**
   * Get resolution statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const total = this.resolutionLog.length;
    if (total === 0) return { total: 0 };

    const byStep = {
      direct_bill_key: 0,  // Step 0: Direct bill_key match
      exact_roll: 0,
      bill_same_day: 0,
      motion: 0,
      amendment: 0,
      none: 0
    };

    let totalResolved = 0;
    let missingTextUrls = 0;

    for (const result of this.resolutionLog) {
      byStep[result.match_step]++;
      
      if (result.match_step !== 'none') {
        totalResolved++;
        
        if (result.bill_text_urls.length === 0) {
          missingTextUrls++;
        }
      }
    }

    return {
      total,
      resolved: totalResolved,
      unresolved: byStep.none,
      resolution_rate: (totalResolved / total * 100).toFixed(2) + '%',
      exact_roll_rate: (byStep.exact_roll / total * 100).toFixed(2) + '%',
      direct_bill_key_rate: (byStep.direct_bill_key / total * 100).toFixed(2) + '%',
      by_step: byStep,
      missing_text_urls: missingTextUrls
    };
  }

  /**
   * Get unresolved votes
   * @returns {Array<ResolutionResult>}
   */
  getUnresolved() {
    return this.resolutionLog.filter(r => r.match_step === 'none');
  }

  /**
   * Export resolution log as JSONL
   * @param {string} filePath - Output file path
   */
  async exportLog(filePath) {
    const fs = require('fs').promises;
    const lines = this.resolutionLog.map(r => JSON.stringify(r)).join('\n');
    await fs.writeFile(filePath, lines, 'utf8');
  }
}

module.exports = VoteResolver;
