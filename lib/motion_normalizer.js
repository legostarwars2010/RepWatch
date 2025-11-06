/**
 * Motion Text Canonicalization
 * 
 * Normalizes motion text to standard families for fuzzy matching.
 */

// Motion families with their canonical forms and patterns
const MOTION_FAMILIES = {
  'On Passage': {
    canonical: 'On Passage',
    patterns: [
      /\bOn Passage\b/i,
      /\bPassage of\b/i,
      /\bTo Pass\b/i,
      /\bFinal Passage\b/i,
    ]
  },
  'On Agreeing': {
    canonical: 'On Agreeing',
    patterns: [
      /\bOn Agreeing to\b/i,
      /\bAgreeing to\b/i,
      /\bTo Agree\b/i,
    ]
  },
  'Motion to Recommit': {
    canonical: 'Motion to Recommit',
    patterns: [
      /\bMotion to Recommit\b/i,
      /\bMTR\b/,
      /\bRecommit\b/i,
    ]
  },
  'Previous Question': {
    canonical: 'Previous Question',
    patterns: [
      /\bPrevious Question\b/i,
      /\bOrder the Previous Question\b/i,
    ]
  },
  'Suspend the Rules': {
    canonical: 'Suspend the Rules',
    patterns: [
      /\bSuspend(?:ing)? the Rules\b/i,
      /\bSuspension of the Rules\b/i,
    ]
  },
  'On the Amendment': {
    canonical: 'On the Amendment',
    patterns: [
      /\bOn the Amendment\b/i,
      /\bAmendment\b/i,
    ]
  },
  'On the Resolution': {
    canonical: 'On the Resolution',
    patterns: [
      /\bOn the Resolution\b/i,
      /\bOn Adopting the Resolution\b/i,
    ]
  },
  'On the Conference Report': {
    canonical: 'On the Conference Report',
    patterns: [
      /\bConference Report\b/i,
    ]
  },
  'On Concurring': {
    canonical: 'On Concurring',
    patterns: [
      /\bOn Concurring\b/i,
      /\bConcur\b/i,
    ]
  },
  'On Cloture': {
    canonical: 'On Cloture',
    patterns: [
      /\bCloture\b/i,
      /\bMotion to Invoke Cloture\b/i,
    ]
  },
  'On the Motion to Proceed': {
    canonical: 'On the Motion to Proceed',
    patterns: [
      /\bMotion to Proceed\b/i,
      /\bTo Proceed\b/i,
    ]
  },
  'On the Nomination': {
    canonical: 'On the Nomination',
    patterns: [
      /\bOn the Nomination\b/i,
      /\bNomination\b/i,
    ]
  },
};

/**
 * Canonicalize motion text to a standard family
 * @param {string} motionText - Raw motion text from vote record
 * @returns {{family: string|null, confidence: 'high'|'medium'|'low'}}
 */
function canonicalizeMotion(motionText) {
  if (!motionText) {
    return { family: null, confidence: 'low' };
  }
  
  const normalized = motionText.trim();
  
  // Try to match to a motion family
  for (const [family, config] of Object.entries(MOTION_FAMILIES)) {
    for (const pattern of config.patterns) {
      if (pattern.test(normalized)) {
        return {
          family: config.canonical,
          confidence: 'high'
        };
      }
    }
  }
  
  // Fallback: use simplified text
  const simplified = simplifyMotionText(normalized);
  return {
    family: simplified,
    confidence: 'medium'
  };
}

/**
 * Simplify motion text by removing bill references and noise
 * @param {string} text - Motion text
 * @returns {string} Simplified text
 */
function simplifyMotionText(text) {
  let simplified = text;
  
  // Remove bill references
  simplified = simplified.replace(/\b(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+/gi, '');
  
  // Remove "as amended"
  simplified = simplified.replace(/,?\s*as amended/gi, '');
  
  // Remove dates
  simplified = simplified.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '');
  
  // Remove extra whitespace
  simplified = simplified.replace(/\s+/g, ' ').trim();
  
  return simplified;
}

/**
 * Compare two motion texts for similarity
 * @param {string} motion1 - First motion text
 * @param {string} motion2 - Second motion text
 * @returns {{match: boolean, score: number}}
 */
function compareMotions(motion1, motion2) {
  const canon1 = canonicalizeMotion(motion1);
  const canon2 = canonicalizeMotion(motion2);
  
  // Exact family match
  if (canon1.family && canon2.family && canon1.family === canon2.family) {
    return {
      match: true,
      score: 1.0
    };
  }
  
  // Fuzzy match on simplified text
  const simple1 = simplifyMotionText(motion1 || '').toLowerCase();
  const simple2 = simplifyMotionText(motion2 || '').toLowerCase();
  
  if (simple1 === simple2) {
    return {
      match: true,
      score: 0.9
    };
  }
  
  // Substring match
  if (simple1.includes(simple2) || simple2.includes(simple1)) {
    return {
      match: true,
      score: 0.7
    };
  }
  
  return {
    match: false,
    score: 0.0
  };
}

/**
 * Extract amendment reference from motion text
 * @param {string} motionText - Motion text
 * @returns {{type: string, number: string}|null}
 */
function extractAmendment(motionText) {
  if (!motionText) return null;
  
  const patterns = [
    /\bAmendment\s+(?:No\.\s+)?(\d+)/i,
    /\bAmdt\.?\s+(?:No\.\s+)?(\d+)/i,
    /\b(SA|HA)\s+(\d+)/i, // Senate Amendment, House Amendment
  ];
  
  for (const pattern of patterns) {
    const match = motionText.match(pattern);
    if (match) {
      return {
        type: 'amendment',
        number: match[1] || match[2]
      };
    }
  }
  
  return null;
}

module.exports = {
  canonicalizeMotion,
  compareMotions,
  simplifyMotionText,
  extractAmendment,
  MOTION_FAMILIES,
};
