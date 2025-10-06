// Clear the sync tracking since we're using a new database
localStorage.removeItem('jetrix_synced_score_ids');
localStorage.removeItem('jetrix_last_sync_timestamp');
console.log('✅ Cleared sync tracking for fresh database start');
