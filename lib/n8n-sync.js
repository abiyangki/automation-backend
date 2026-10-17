// Minimal n8n-sync module to unblock deploy
async function syncWithN8n() {
  console.log('n8n-sync stub: no action');
  return { ok: true };
}

async function triggerN8nWorkflow(data) {
  console.log('n8n trigger stub', data);
  return { ok: true };
}

module.exports = {
  syncWithN8n,
  triggerN8nWorkflow,
};
