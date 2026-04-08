module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_LUZZOO_TOKEN = process.env.NOTION_LUZZOO_TOKEN;

  try {
    const body = await parseBody(req);
    const { pageId, comment, source } = body;

    if (!pageId || !comment) {
      return res.status(400).json({ error: 'pageId and comment are required' });
    }

    const token = (source && source !== 'aiox') ? NOTION_LUZZOO_TOKEN : NOTION_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Token not configured for source: ' + (source || 'aiox') });
    }

    const response = await fetch('https://api.notion.com/v1/comments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [{ text: { content: comment } }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Failed to add comment' });
    }

    return res.status(200).json({ success: true, commentId: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
