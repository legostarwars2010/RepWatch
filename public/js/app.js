// API Base URL
const API_BASE = window.location.origin;

// DOM Elements
const addressInput = document.getElementById('addressInput');
const searchBtn = document.getElementById('searchBtn');
const loadingEl = document.getElementById('loading');
const resultsEl = document.getElementById('results');
const errorEl = document.getElementById('error');
const representativesList = document.getElementById('representativesList');

// Event Listeners
searchBtn.addEventListener('click', handleSearch);
addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

// Main search handler
async function handleSearch() {
    const query = addressInput.value.trim();
    
    if (!query) {
        showError('Please enter an address, ZIP code, or representative name');
        return;
    }

    hideError();
    hideResults();
    showLoading();
    
    try {
        // Determine if it's a name search or address search
        const isNameSearch = /^[a-zA-Z\s\.\-']+$/.test(query) && query.split(' ').length >= 2;
        
        let endpoint;
        if (isNameSearch) {
            console.log('Name search detected');
            endpoint = `${API_BASE}/api/lookup-by-name?name=${encodeURIComponent(query)}`;
        } else {
            console.log('Address search detected');
            endpoint = `${API_BASE}/api/lookup?address=${encodeURIComponent(query)}`;
        }
        
        console.log('Fetching:', endpoint);
        const response = await fetch(endpoint);
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to find representatives');
        }
        
        hideLoading();
        displayResults(data);
        
    } catch (error) {
        console.error('Fetch error:', error);
        hideLoading();
        showError(error.message || 'An error occurred. Please try again.');
    }
}

// Display results
function displayResults(data) {
    representativesList.innerHTML = '';
    
    if (!data.representatives || data.representatives.length === 0) {
        const errorMsg = data.searchType === 'name' 
            ? 'No representatives found with that name' 
            : 'No representatives found for this address';
        showError(errorMsg);
        return;
    }
    
    // Filter out senators - only show House representatives
    const houseReps = data.representatives.filter(rep => rep.chamber === 'house');
    
    if (houseReps.length === 0) {
        showError('No House representatives found for this address');
        return;
    }
    
    houseReps.forEach(rep => {
        const repCard = createRepresentativeCard(rep);
        representativesList.appendChild(repCard);
    });
    
    showResults();
}

// Create representative card
function createRepresentativeCard(rep) {
    const card = document.createElement('div');
    card.className = 'rep-card';
    
    const partyClass = rep.party.toLowerCase();
    const districtDisplay = rep.district === null ? 'At-Large' : 
                           rep.district === 0 ? 'At-Large' : 
                           `District ${rep.district}`;
    
    const repId = `rep-${Math.random().toString(36).substr(2, 9)}`;
    const initialVotes = rep.votes && rep.votes.length > 0 ? rep.votes.slice(0, 5) : [];
    const hasMore = rep.votes && rep.votes.length > 5;
    
    card.innerHTML = `
        <div class="rep-header">
            <div class="rep-info">
                <h2>${rep.name}</h2>
                <div class="rep-details">
                    <span class="badge badge-party-${partyClass}">${rep.party}</span>
                    <span class="badge badge-district">${rep.state} ${districtDisplay}</span>
                </div>
            </div>
        </div>
        <div class="votes-section">
            <h3>Recent Votes</h3>
            <div class="votes-list-container">
                <div class="votes-list" id="${repId}">
                    ${initialVotes.length > 0 ? 
                        initialVotes.map(vote => createVoteItem(vote)).join('') :
                        '<p style="color: var(--text-secondary); font-size: 0.85rem;">No recent votes available</p>'}
                </div>
                ${hasMore ? `
                    <button class="see-more-btn" onclick="loadMoreVotes('${repId}', ${rep.id})">
                        See more
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    // Store all votes on the card element for later access
    card.dataset.allVotes = JSON.stringify(rep.votes || []);
    card.dataset.displayedCount = initialVotes.length;
    
    return card;
}

// Create vote item
function createVoteItem(vote) {
    const voteClass = vote.vote.toLowerCase().replace(/\s+/g, '-');
    const voteIcon = getVoteIcon(vote.vote);
    const date = new Date(vote.vote_date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    const voteId = `vote-${Math.random().toString(36).substr(2, 9)}`;
    const hasMediumSummary = vote.ai_summary?.medium_summary;
    
    return `
        <div class="vote-item vote-${voteClass}">
            <div class="vote-header">
                <div class="vote-position">
                    <span class="vote-icon">${voteIcon}</span>
                    <span>${vote.vote}</span>
                </div>
                <div class="vote-date">${date}</div>
            </div>
            ${vote.title ? `<div class="vote-title">${vote.title}</div>` : ''}
            ${vote.bill_id ? `<div class="vote-bill">${formatBillId(vote.bill_id)}</div>` : ''}
            ${vote.ai_summary ? `
                <div class="vote-summary">${vote.ai_summary.short_summary || ''}</div>
                ${hasMediumSummary ? `
                    <button class="expand-btn" onclick="toggleExpand('${voteId}')">
                        <span class="expand-text">Read more</span>
                        <span class="expand-icon">▼</span>
                    </button>
                    <div class="medium-summary" id="${voteId}" style="display: none;">
                        ${vote.ai_summary.medium_summary}
                    </div>
                ` : ''}
                <div class="vote-explanation">
                    ${getVoteExplanation(vote.vote, vote.ai_summary)}
                </div>
            ` : ''}
        </div>
    `;
}

// Get vote icon
function getVoteIcon(vote) {
    const voteUpper = vote.toUpperCase();
    if (voteUpper === 'YEA' || voteUpper === 'AYE') return '✓';
    if (voteUpper === 'NAY' || voteUpper === 'NO') return '✗';
    if (voteUpper === 'PRESENT') return '◯';
    if (voteUpper === 'NOT VOTING') return '—';
    return '•';
}

// Get vote explanation
function getVoteExplanation(vote, aiSummary) {
    const voteUpper = vote.toUpperCase();
    
    if (voteUpper === 'YEA' || voteUpper === 'AYE') {
        return `<strong>Voted YES:</strong> ${aiSummary.what_a_yea_vote_means || 'Supported this measure'}`;
    }
    if (voteUpper === 'NAY' || voteUpper === 'NO') {
        return `<strong>Voted NO:</strong> ${aiSummary.what_a_nay_vote_means || 'Opposed this measure'}`;
    }
    if (voteUpper === 'PRESENT') {
        return '<strong>Present:</strong> Was there but chose not to vote yes or no';
    }
    if (voteUpper === 'NOT VOTING') {
        return '<strong>Not Voting:</strong> Did not cast a vote on this measure';
    }
    return '';
}

// Format bill ID
function formatBillId(billId) {
    if (!billId) return '';
    // Convert "hr2766-119" to "H.R. 2766 (119th Congress)"
    const match = billId.match(/^([a-z]+)(\d+)-(\d+)$/);
    if (match) {
        const [, type, number, congress] = match;
        const typeUpper = type.toUpperCase().split('').join('.') + '.';
        return `${typeUpper} ${number} (${congress}th Congress)`;
    }
    return billId;
}

// Get initials from name
function getInitials(name) {
    return name
        .split(' ')
        .map(word => word[0])
        .filter((_, i, arr) => i === 0 || i === arr.length - 1)
        .join('')
        .toUpperCase();
}

// UI Helper Functions
function showLoading() {
    loadingEl.classList.remove('hidden');
    searchBtn.disabled = true;
}

function hideLoading() {
    loadingEl.classList.add('hidden');
    searchBtn.disabled = false;
}

function showResults() {
    resultsEl.classList.remove('hidden');
}

function hideResults() {
    resultsEl.classList.add('hidden');
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function hideError() {
    errorEl.classList.add('hidden');
}

// Toggle expand/collapse for medium summary
function toggleExpand(voteId) {
    const mediumSummary = document.getElementById(voteId);
    const btn = event.target.closest('.expand-btn');
    const expandText = btn.querySelector('.expand-text');
    const expandIcon = btn.querySelector('.expand-icon');
    
    if (mediumSummary.style.display === 'none') {
        mediumSummary.style.display = 'block';
        expandText.textContent = 'Show less';
        expandIcon.textContent = '▲';
    } else {
        mediumSummary.style.display = 'none';
        expandText.textContent = 'Read more';
        expandIcon.textContent = '▼';
    }
}

// Load more votes (5 at a time)
function loadMoreVotes(repId, repIdNum) {
    const votesList = document.getElementById(repId);
    const repCard = votesList.closest('.rep-card');
    const allVotes = JSON.parse(repCard.dataset.allVotes);
    const currentCount = parseInt(repCard.dataset.displayedCount);
    const nextCount = Math.min(currentCount + 5, allVotes.length);
    
    console.log(`Loading more votes: ${currentCount} -> ${nextCount} of ${allVotes.length}`);
    
    // Add the next 5 votes
    const nextVotes = allVotes.slice(currentCount, nextCount);
    nextVotes.forEach(vote => {
        const voteHtml = createVoteItem(vote);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = voteHtml;
        votesList.appendChild(tempDiv.firstElementChild);
    });
    
    // Update count
    repCard.dataset.displayedCount = nextCount;
    
    // Hide "See more" button if we've shown all votes
    if (nextCount >= allVotes.length) {
        const btn = event.target;
        btn.style.display = 'none';
        console.log('All votes displayed, hiding button');
    }
}

// Make functions available globally
window.toggleExpand = toggleExpand;
window.loadMoreVotes = loadMoreVotes;
