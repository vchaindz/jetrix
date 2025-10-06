// Helper script to reset sync state for testing
// Run this in the browser console to clear all sync tracking

function resetSyncState() {
    // Clear all sync-related localStorage keys
    localStorage.removeItem('jetrix_synced_score_ids');
    localStorage.removeItem('jetrix_last_sync_timestamp');
    localStorage.removeItem('jetrix_initial_sync_done');
    
    console.log('✅ Sync state reset successfully');
    console.log('🔄 On next page load, scores will be synced to the server once');
}

// Run the reset
resetSyncState();