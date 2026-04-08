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
  const NOTION_LUZZOO_TOKEN = process.env.NOTION_LUZZOO_TOKEN;

  try {
    const body = await parseBody(req);
    const { pageId, newStatus, source } = body;

    if (!pageId || !newStatus) {
      return res.status(400).json({ error: 'pageId and newStatus are required' });
    }

    const token = source === 'aiox' ? NOTION_TOKEN : NOTION_LUZZOO_TOKEN;

    if (!token) {
      return res.status(500).json({ error: `Token not configured for source: ${source || 'unknown'}` });
    }

    const statusMap = {
      aiox: {
        'backlog': 'Não iniciada',
        'todo': 'A Fazer',
        'progress': 'Em andamento',
        'review': 'Em Revisao',
        'done': 'Concluído'
      },
      luzzoo: {
        'nao-iniciado': 'Não iniciado',
        'planejamento': 'Em planejamento',
        'espera': 'Em espera',
        'producao': 'Em produção',
        'continuas': 'Tarefas Contínuas',
        'aprovar': 'Aprovar',
        'concluido': 'Concluído'
      },
      impulso: {
        'nao-iniciado': 'Não iniciado',
        'pendente': 'Pendente',
        'pronto': 'Pronto Para Produção',
        'producao': 'Em produção',
        'continuas': 'Jobs Contínuos',
        'fixo': 'Fixo',
        'aprovacao': 'Aprovação',
        'concluido': 'Concluído'
      },
      '1pra1': {
        'nao-iniciado': 'Não iniciado',
        'planejamento': 'Em planejamento',
        'espera': 'Em espera',
        'producao': 'Em produção',
        'execucao': 'Em execução',
        'bloqueado': 'Bloqueado',
        'concluido': 'Concluído'
      }
    };

    const sourceMap = statusMap[source] || statusMap.aiox;
    const notionStatus = sourceMap[newStatus] || newStatus;

    // Update page status
    const updateResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          Status: {
            status: { name: notionStatus }
          }
        }
      })
    });

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      return res.status(updateResponse.status).json({ error: updateData.message || 'Failed to update status' });
    }

    // Add comment
    await fetch('https://api.notion.com/v1/comments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [
          {
            text: {
              content: `@AIOX Dashboard atualizou status para ${notionStatus}`
            }
          }
        ]
      })
    });

    return res.status(200).json({ success: true });
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
