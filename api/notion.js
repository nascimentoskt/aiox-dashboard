module.exports = async function handler(req, res) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB = process.env.NOTION_DB || '33af6feb-79cc-8013-b07d-e794fa0ac469';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    // Paginate to get ALL cards
    let allResults = [];
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data.message });
      }

      allResults = allResults.concat(data.results);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || undefined;
    }

    const cards = allResults.map(page => {
      const props = page.properties;
      return {
        id: page.id,
        title: props.Nome?.title?.[0]?.text?.content || 'Sem titulo',
        status: props.Status?.status?.name || 'Não iniciada',
        squad: props.Squad?.select?.name || '',
        projeto: props.Projeto?.select?.name || '',
        prioridade: props.Prioridade?.select?.name || '',
        responsavel: props.Responsavel?.rich_text?.[0]?.text?.content || '',
        lastEdited: page.last_edited_time,
        url: page.url
      };
    });

    // Normalize status: strip accents for matching
    function normalize(s) {
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    const statusMap = {
      'nao iniciada': 'backlog',
      'a fazer': 'todo',
      'em andamento': 'progress',
      'em revisao': 'review',
      'concluido': 'done'
    };

    const columns = [
      { id: 'backlog', title: 'Backlog', color: '#8b8fa3', cards: [] },
      { id: 'todo', title: 'A Fazer', color: '#0088FF', cards: [] },
      { id: 'progress', title: 'Em Progresso', color: '#FFB300', cards: [] },
      { id: 'review', title: 'Em Revisao', color: '#00BCD4', cards: [] },
      { id: 'done', title: 'Concluido', color: '#00C853', cards: [] }
    ];

    cards.forEach(card => {
      const colId = statusMap[normalize(card.status)] || 'backlog';
      const col = columns.find(c => c.id === colId);
      if (col) col.cards.push(card);
    });

    res.status(200).json({
      columns,
      totalCards: cards.length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
