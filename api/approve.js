module.exports = async function handler(req, res) {
  // CORS headers for all requests (including preflight OPTIONS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = '';
  await new Promise(function(resolve) {
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', resolve);
  });

  var params = JSON.parse(body);
  var pageId = params.pageId;
  var action = params.action; // 'approve' or 'reject'
  var source = params.source || 'aiox'; // which kanban

  // Pick the right token
  var AIOX_TOKEN = process.env.NOTION_TOKEN;
  var LUZZOO_TOKEN = process.env.NOTION_LUZZOO_TOKEN;
  var token = (source === 'aiox') ? AIOX_TOKEN : LUZZOO_TOKEN;

  if (!token) return res.status(500).json({ error: 'Token not configured for source: ' + source });
  if (!pageId) return res.status(400).json({ error: 'pageId required' });

  try {
    // Map action to status name per source (each DB uses different status names)
    var statusName;
    if (action === 'approve') {
      statusName = 'Concluído';
    } else {
      // Reject = move back to actionable column (source-aware)
      var rejectMap = {
        'aiox': 'A Fazer',
        'impulso': 'Pendente',
        'luzzoo': 'Em espera',
        '1pra1': 'Em espera'
      };
      statusName = rejectMap[source] || 'Não iniciada';
    }

    // Update page status
    var updateRes = await fetch('https://api.notion.com/v1/pages/' + pageId, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { Status: { status: { name: statusName } } } })
    });

    if (!updateRes.ok) {
      var err = await updateRes.json();
      return res.status(updateRes.status).json({ error: err.message });
    }

    // Add comment
    var commentText = action === 'approve'
      ? '@Lucas aprovou e concluiu esta demanda via AIOX Dashboard.'
      : '@Lucas reprovou esta demanda via AIOX Dashboard. Retornada para revisao.';

    await fetch('https://api.notion.com/v1/comments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ text: { content: commentText } }] })
    });

    res.status(200).json({ success: true, action: action, pageId: pageId, status: statusName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
