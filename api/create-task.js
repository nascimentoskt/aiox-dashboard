module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB = '33af6feb-79cc-8013-b07d-e794fa0ac469';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
  }

  try {
    const body = await parseBody(req);
    const { title, status, squad, responsavel, prioridade, projeto } = body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Validate required fields to prevent incomplete cards
    if (!squad) {
      return res.status(400).json({ error: 'squad is required' });
    }
    if (!responsavel) {
      return res.status(400).json({ error: 'responsavel is required' });
    }
    if (!projeto) {
      return res.status(400).json({ error: 'projeto is required' });
    }

    const properties = {
      Nome: {
        title: [{ text: { content: title } }]
      },
      Status: {
        status: { name: status || 'A Fazer' }
      }
    };

    if (squad) {
      properties.Squad = { select: { name: squad } };
    }
    if (responsavel) {
      properties.Responsavel = { rich_text: [{ text: { content: responsavel } }] };
    }
    if (prioridade) {
      properties.Prioridade = { select: { name: prioridade } };
    }
    if (projeto) {
      properties.Projeto = { select: { name: projeto } };
    }

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB },
        properties
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Notion API error' });
    }

    return res.status(200).json({ success: true, pageId: data.id });
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
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
