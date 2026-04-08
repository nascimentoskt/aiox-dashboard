module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const NOTION_TOKEN = process.env.NOTION_LUZZOO_TOKEN;
  const LUZZOO_DB = process.env.NOTION_LUZZOO_DB || '2e688f8f-70b0-8006-957b-db45457762ef';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_LUZZOO_TOKEN not configured' });
  }

  try {
    const body = await parseBody(req);
    const { title, descricao, tipo, canal, cliente, setor, responsavel } = body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Build properties
    const properties = {
      'Nome da campanha': {
        title: [{ text: { content: title } }]
      },
      'Status': {
        status: { name: 'Em espera' }
      }
    };

    if (descricao) {
      properties['Descrição'] = {
        rich_text: [{ text: { content: descricao.substring(0, 2000) } }]
      };
    }
    if (tipo) {
      properties['Tipo de campanha'] = { multi_select: [{ name: tipo }] };
    }
    if (canal) {
      properties['Canal'] = { select: { name: canal } };
    }
    if (cliente) {
      properties['Cliente'] = { select: { name: cliente } };
    }
    if (setor) {
      properties['Setor'] = { multi_select: [{ name: setor }] };
    }

    // Try to find the person by name to assign via People property
    if (responsavel) {
      try {
        const usersRes = await fetch('https://api.notion.com/v1/users', {
          headers: {
            'Authorization': 'Bearer ' + NOTION_TOKEN,
            'Notion-Version': '2022-06-28'
          }
        });
        const usersData = await usersRes.json();
        if (usersData.results) {
          const user = usersData.results.find(function(u) {
            return u.name && u.name.toLowerCase().indexOf(responsavel.toLowerCase()) >= 0;
          });
          if (user) {
            properties['Pessoa'] = { people: [{ id: user.id }] };
          }
        }
      } catch (e) {
        // If user lookup fails, continue without assigning person
      }
    }

    // Create the page
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: LUZZOO_DB },
        properties: properties
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Notion API error' });
    }

    // Add comment with full email strategy details
    if (descricao) {
      await fetch('https://api.notion.com/v1/comments', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + NOTION_TOKEN,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parent: { page_id: data.id },
          rich_text: [{ text: { content: '@AIOX Email Marketing — Direcionamento gerado automaticamente.\n\n' + descricao } }]
        })
      });
    }

    return res.status(200).json({ success: true, pageId: data.id, url: data.url });
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
